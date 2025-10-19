import { Router } from 'express';
import bcrypt from 'bcrypt';

import type { Request, Response } from 'express';

import { db } from '../utils/db.js';
import { genChar, convert, parse } from '../utils/functions.js';

import type { Session, Account } from '../models/auth.js';
import type { Profile, Settings, ProfileSettings } from '../models/profiles.js';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
    let username: string = req.body.username;
    let password: string = req.body.password;

    try {
        let result: Account | undefined = parse(await db.get('SELECT * FROM Logins WHERE username = ?;', [ username ])) as Account;

        if (!result) {
            result = parse(await db.get('SELECT * FROM Logins WHERE email = ?;', [ username ])) as Account;

            if (!result) {
                res.status(401).send({ message: 'UserNotFound' });
                return
            }
        }

        const isValid: boolean = await bcrypt.compare(password, result.password_hash);

        if (isValid) {
            const session: Session = {
                id: genChar(8, 'hex').toUpperCase(),
                token: genChar(256, 'base64'),
                account: result.id,
                last_activity: new Date().toISOString(),
                ip: req.ip
            };

            await db.run("INSERT INTO Sessions (id, token, account, last_activity, ip) VALUES (?, ?, ?, ?, ?)", Object.values(convert(session)))

            res.cookie('token', session.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 1000 * 60 * 60 * 24 * 28
            });

            res.status(200).send({ message: 'Success', token: session.token });
        } else {
            res.status(401).send({ message: 'InvalidPassword' });
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
            res.status(401).send({ message: 'NoToken' });
            return
        }

        let session: Session | undefined = parse(await db.get('SELECT * FROM Sessions WHERE token = ?;', [ token ])) as Session;

        if (session) {
            session.last_activity = new Date().toISOString();
            await db.run('UPDATE Sessions SET last_activity = ? WHERE token = ?;', [ session.last_activity, token ]);
        } else {
            res.status(401).send({ message: 'InvalidToken' });
            return
        }

        let result: Account | undefined = parse(await db.get('SELECT * FROM Logins WHERE username = ?;', [ username ])) as Account;

        if (!result) {
            res.status(401).send({ message: 'UserNotFound' });
            return
        }

        const isValid: boolean = await bcrypt.compare(password, result.password_hash);

        if (isValid) {
            res.status(200).send({ message: 'Success' });
        } else {
            res.status(401).send({ message: 'InvalidPassword' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.post('/signup', async (req: Request, res: Response) => {
    let username: string = req.body.username;
    let display_name: string | null = req.body.display_name || null;
    let email: string = req.body.email;
    let password: string = req.body.password;
    let _private: boolean = req.body.private || true;

    let password_hash = await bcrypt.hash(password, 12);

    try {
        const account: Account = {
            id: genChar(8, 'hex').toUpperCase(),
            username: username,
            email: email,
            password_hash: password_hash
        };

        try {
            await db.run('INSERT INTO Logins (id, username, email, password_hash) VALUES (?, ?, ?, ?)', Object.values(convert(account)))
        } catch (err) {
            console.error(err);
            res.status(409).send({ message: 'UserAlreadyExists'});
            return
        }

        const preferences: Settings = {
            id: account.id,
            privacy: {
                profile_visibility: _private ? 'friends' : 'everyone',
                birthday_visibility: 'friends',
                status_visibility: 'friends',
                dms: _private ? 'friends' : 'followers'
            },
            appearance: {
                global_theme: 'light',
            }
        }

        const settings: ProfileSettings = {
            id: account.id,
            blocklist: [],
            pending: {
                children: [],
                followers: []
            },
            friends: [],
            children: [],
            parent: null,
            preferences: preferences
        };

        try {
            await db.run('INSERT INTO Settings (id, blocklist, pending, friends, children, parent, preferences) VALUES (?, ?, ?, ?, ?, ?, ?)', Object.values(convert(settings)));
        } catch (err) {
            console.error(err);
            await db.run('DELETE FROM Logins WHERE id = ?;', [ account.id ]);

            res.status(500).send({ message: 'Error' });
            return
        }

        const profile: Profile = {
            id: account.id,
            name: username,
            display_name: display_name,
            creation_date: new Date().toISOString(),
            update_date: new Date().toISOString(),
            followers: [],
            following: [],
            status: null,
            birthday: null,
            pronouns: null,
            account_type: null,
            level: 0
        };

        try {
            await db.run('INSERT INTO Users (id, name, display_name, creation_date, update_date, followers, following, status, birthday, pronouns, account_type, level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', Object.values(convert(profile)));
        } catch (err) {
            console.error(err);
            await db.run('DELETE FROM Settings WHERE id = ?;', [ account.id ]);
            await db.run('DELETE FROM Logins WHERE id = ?;', [ account.id ]);

            res.status(500).send({ message: 'Error' });
            return
        }

        res.status(200).send({ message: 'Success' });
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
            res.status(401).send({ message: 'NoToken' });
            return
        }

        let result: Account | undefined = parse(await db.get('SELECT * FROM Logins WHERE username = ?;', [ username ])) as Account;

        if (!result) {
            res.status(401).send({ message: 'UserNotFound' });
            return
        }

        const isValid: boolean = await bcrypt.compare(password, result.password_hash);

        if (isValid) {
            await db.run('DELETE FROM Settings WHERE id = ?;', [ result.id ]);
            await db.run('DELETE FROM Users WHERE id = ?;', [ result.id ]);
            await db.run('DELETE FROM Sessions WHERE account = ?;', [ result.id ]); 
            await db.run('DELETE FROM Logins WHERE id = ?;', [ result.id ]);

            res.status(200).send({ message: 'Success' });
        } else {
            res.status(401).send({ message: 'InvalidPassword' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;