import { Router } from 'express';
import bcrypt from 'bcrypt';

import type { Request, Response } from 'express';

import { db } from '../db/index.js';
import { genChar, convert, parse } from '../utils/functions.js';

import type { Session, Account } from '../db/models/auth.js';
import type { Profile, Settings, Relations, Tastes, Inbox } from '../db/models/profiles.js';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
    let username: string = req.body.username;
    let password: string = req.body.password;

    try {
        let result: Account | undefined = parse(await db.get('SELECT * FROM Logins WHERE username = $1', [ username ])) as Account;

        if (!result) {
            result = parse(await db.get('SELECT * FROM Logins WHERE email = $1', [ username ])) as Account;

            if (!result) {
                res.status(401).json({ message: 'UserNotFound' });
                return
            }
        }

        const isValid: boolean = await bcrypt.compare(password, result.password_hash);

        if (isValid) {
            const session: Session = {
                id: genChar(8, 'hex').toUpperCase(),
                token: genChar(256, 'base64'),
                account: result.id,
                last_activity: new Date(),
                ip: req.ip
            };

            console.log(session)

            await db.run("INSERT INTO Sessions (id, token, account, last_activity, ip) VALUES ($1, $2, $3, $4, $5)", [
                session.id,
                session.token,
                session.account,
                session.last_activity,
                session.ip
            ])

            res.cookie('token', session.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'none',
                maxAge: 1000 * 60 * 60 * 24 * 28
            });

            res.status(200).json({ message: 'Success', token: session.token });
        } else {
            res.status(401).json({ message: 'InvalidPassword' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.post('/sudo', async (req: Request, res: Response) => {
    let username: string = req.body.username;
    let password: string = req.body.password;
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        if (!token) {
            res.status(401).json({ message: 'NoToken' });
            return
        }

        let session: Session | undefined = parse(await db.get('SELECT * FROM Sessions WHERE token = $1', [ token ])) as Session;

        if (session) {
            session.last_activity = new Date();
            await db.run('UPDATE Sessions SET last_activity = $1 WHERE token = $2', [ session.last_activity, token ]);
        } else {
            res.status(401).json({ message: 'InvalidToken' });
            return
        }

        let result: Account | undefined = parse(await db.get('SELECT * FROM Logins WHERE username = $1', [ username ])) as Account;

        if (!result) {
            res.status(401).json({ message: 'UserNotFound' });
            return
        }

        const isValid: boolean = await bcrypt.compare(password, result.password_hash);

        if (isValid) {
            res.status(200).json({ message: 'Success' });
        } else {
            res.status(401).json({ message: 'InvalidPassword' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.post('/signup', async (req: Request, res: Response) => {
    let username: string = req.body.username;
    let display_name: string | null = req.body.display_name || null;
    let birthday: Date | null = new Date(req.body.birthday) || null;

    let email: string = req.body.email;
    let password: string = req.body.password ?? true;

    let _private: boolean = req.body.private;


    let password_hash = await bcrypt.hash(password, 12);

    try {
        const account: Account = {
            id: genChar(8, 'hex').toUpperCase(),
            username: username,
            email: email,
            password_hash: password_hash
        };

        try {
            await db.run('INSERT INTO Logins (id, username, email, password_hash) VALUES ($1, $2, $3, $4)', Object.values(account))
        } catch (err) {
            console.error(err);
            res.status(409).json({ message: 'UserAlreadyExists'});
            return
        }

        const settings: Settings = {
            id: account.id,
            privacy: {
                profile: _private ? 'followers' : 'everyone',
                birthday: _private ? 'friends' : 'followers',
                status: _private ? 'friends' : 'followers',
                dms: _private ? 'friends' : 'followers'
            },
            appearance: {
                global_theme: 'light',
            }
        }

        try {
            await db.run('INSERT INTO Settings (id, privacy, appearance) VALUES ($1, $2, $3)', Object.values(settings));
        } catch (err) {
            console.error(err);
            await db.run('DELETE FROM Logins WHERE id = $1', [ account.id ]);

            res.status(500).json({ message: 'Error' });
            return
        }

        const relations: Relations = {
            id: account.id,
            blocklist: [],
            following: [],
            followers: [],
            friends: [],
            children: [],
            parents: [],
        };

        try {
            await db.run('INSERT INTO Relations (id, blocklist, following, followers, friends, children, parent) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', Object.values(relations));
        } catch (err) {
            console.error(err);
            await db.run('DELETE FROM Settings WHERE id = $1', [ account.id ]);
            await db.run('DELETE FROM Logins WHERE id = $1', [ account.id ]);

            res.status(500).json({ message: 'Error' });
            return
        }

        const tastes: Tastes = {
            id: account.id,
            likes: [],
            hashtags: []
        };

        try {
            await db.run('INSERT INTO Tastes (id, likes, hashtags) VALUES ($1, $2, $3)', Object.values(tastes));
        } catch (err) {
            console.error(err);
            await db.run('DELETE FROM Relations WHERE id = $1', [ account.id ]);
            await db.run('DELETE FROM Settings WHERE id = $1', [ account.id ]);
            await db.run('DELETE FROM Logins WHERE id = $1', [ account.id ]);

            res.status(500).json({ message: 'Error' });
            return
        }

        const inbox: Inbox = {
            id: account.id,
            requests: {
                children: [],
                following: [],
                followers: []
            },
            other: []
        };

        try {
            await db.run('INSERT INTO Inbox (id, requests, other) VALUES ($1, $2, $3)', Object.values(inbox));
        } catch (err) {
            console.error(err);
            await db.run('DELETE FROM Tastes WHERE id = $1', [ account.id ]);
            await db.run('DELETE FROM Relations WHERE id = $1', [ account.id ]);
            await db.run('DELETE FROM Settings WHERE id = $1', [ account.id ]);
            await db.run('DELETE FROM Logins WHERE id = $1', [ account.id ]);

            res.status(500).json({ message: 'Error' });
            return
        }

        const profile: Profile = {
            id: account.id,
            name: username,
            display_name: display_name,
            creation_date: new Date().toISOString(),
            update_date: new Date().toISOString(),
            status: null,
            description: null,
            birthday: null,
            pronouns: null,
            account_type: null,
            level: 3,
            flags: []
        };

        try {
            await db.run('INSERT INTO Users (id, name, display_name, creation_date, update_date, status, description, birthday, pronouns, account_type, level, flags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', Object.values(profile));
        } catch (err) {
            console.error(err);
            await db.run('DELETE FROM Inbox WHERE id = $1', [ account.id ]);
            await db.run('DELETE FROM Tastes WHERE id = $1', [ account.id ]);
            await db.run('DELETE FROM Relations WHERE id = $1', [ account.id ]);
            await db.run('DELETE FROM Settings WHERE id = $1', [ account.id ]);
            await db.run('DELETE FROM Logins WHERE id = $1', [ account.id ]);

            res.status(500).json({ message: 'Error' });
            return
        }

        res.status(200).json({ message: 'Success' });
    } catch (err) {
        console.error(err);
    }
});

router.post('/delete', async (req: Request, res: Response) => {
    let username: string = req.body.username;
    let password: string = req.body.password;
    let token: string = req.cookies.token;

    try {
        if (!token) {
            res.status(401).json({ message: 'NoToken' });
            return
        }

        let result: Account | undefined = parse(await db.get('SELECT * FROM Logins WHERE username = $1', [ username ])) as Account;

        if (!result) {
            res.status(401).json({ message: 'UserNotFound' });
            return
        }

        const isValid: boolean = await bcrypt.compare(password, result.password_hash);

        if (isValid) {
            await db.run('DELETE FROM Users WHERE id = $1', [ result.id ]);
            await db.run('DELETE FROM Relations WHERE id = $1', [ result.id ]);
            await db.run('DELETE FROM Settings WHERE id = $1', [ result.id ]);
            await db.run('DELETE FROM Sessions WHERE account = $1', [ result.id ]); 
            await db.run('DELETE FROM Logins WHERE id = $1', [ result.id ]);

            res.status(200).json({ message: 'Success' });
        } else {
            res.status(401).json({ message: 'InvalidPassword' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;