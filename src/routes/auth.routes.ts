import { Router } from 'express';
import bcrypt from 'bcrypt';

import type { Request, Response } from 'express';

import { db } from '../db/index.js';
import { genChar } from '../utils/functions.js';

import type { Session, Account } from '../db/models/auth.js';
import type { PartialProfile, Settings, Relations, Tastes } from '../db/models/profiles.js';
import type { Inbox } from '../db/models/inbox.js';
import { randomUUID } from 'crypto';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
    let username: string = req.body.username;
    let password: string = req.body.password;

    try {
        let result: Account | undefined = await db.get('SELECT * FROM Logins WHERE username = $1', [ username ]) as Account;

        if (!result) {
            result = await db.get('SELECT * FROM Logins WHERE email = $1', [ username ]) as Account;

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
                sameSite: 'lax',
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

router.get('/credentials', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        if (!token) {
            res.status(401).json({ message: 'NoToken' });
            return
        }

        let result: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1', [ token ]) as Session;

        if (!result) {
            res.status(401).json({ message: 'InvalidToken' });
            return
        }

        let account = await db.get('SELECT id, username, email FROM Logins WHERE id = $1', [ result.account ]) as Account;

        let data = {
            email: account.email,
            username: account.username
        }

        res.status(200).json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.post('/logout', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        if (!token) {
            res.status(401).json({ message: 'NoToken' });
            return
        }

        let result: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1', [ token ]) as Session;

        if (!result) {
            res.status(401).json({ message: 'InvalidToken' });
            return
        }

        await db.run('DELETE FROM Sessions WHERE token = $1', [ token ]);

        res.clearCookie('token');

        res.status(200).json({ message: 'Success' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.post('/sudo', async (req: Request, res: Response) => {
    let username: string = req.body.username;
    let password: string = req.body.password;
    let action = req.query.action || null;

    try {
        let result: Account | undefined = await db.get('SELECT * FROM Logins WHERE username = $1', [ username ]) as Account;

        if (!result) {
            result = await db.get('SELECT * FROM Logins WHERE email = $1', [ username ]) as Account;

            if (!result) {
                res.status(401).json({ message: 'UserNotFound' });
                return
            }
        }

        const isValid: boolean = await bcrypt.compare(password, result.password_hash);

        if (isValid) {
            const sudo = {
                created_at: new Date(),
                token: randomUUID(),
                action: action,
                account: result.id,
                __expires: new Date(new Date().getTime() + 1000 * 60 * 720), // 12 hours
                user_generated: true
            };

            await db.run("INSERT INTO Sudo (id, created_at, token, action, account, __expires, user_generated) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
                randomUUID(),
                sudo.created_at,
                sudo.token,
                sudo.action,
                sudo.account,
                sudo.__expires,
                sudo.user_generated
            ])

            res.status(200).json({ message: 'Success', token: sudo.token });
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
        if (
            username.length < 3 ||
            username.length > 24 ||
            !/^[a-zA-Z0-9_]+$/.test(username)
        ) {
            res.status(400).json({ message: 'InvalidProfileName' });
            return
        }

        if (
            !/^[a-zA-Z0-9_]+@[a-zA-Z0-9]+\.[a-zA-Z]{2,}$/.test(email)
        ) {
            res.status(400).json({ message: 'InvalidEmail' });
            return
        }

        if (
            display_name && display_name.length > 30
        ) {
            res.status(400).json({ message: 'InvalidDisplayName' });
            return
        }


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
            },
            feed: {
                posts_feed: 'trending',
                users_feed: 'trending'
            }
        }

        try {
            await db.run('INSERT INTO Settings (id, privacy, appearance, feed) VALUES ($1, $2, $3, $4)', Object.values(settings));
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
            parent: null,
        };

        try {
            await db.run('INSERT INTO Relations (id, blocklist, following, followers, friends, children, parent) VALUES ($1, $2, $3, $4, $5, $6, $7)', Object.values(relations));
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

        const profile: PartialProfile = {
            id: account.id,
            name: username,
            display_name: display_name,
            creation_date: new Date(),
            update_date: new Date(),
            status: null,
            description: null,
            birthday: birthday ? birthday : null,
            pronouns: null,
            account_type: null,
            badge: null,
            level: 3,
            flags: []
        };

        try {
            await db.run('INSERT INTO Users (id, name, display_name, creation_date, update_date, status, description, birthday, pronouns, account_type, badge, level, flags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)', Object.values(profile));
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

router.post('/password-reset', async (req: Request, res: Response) => {
    let token: string = req.body.token;
    let new_password: string = req.body.new_password;

    try {
        let result: Record<string, any> | undefined = await db.get('SELECT * FROM Sudo WHERE token = $1', [ token ]) as Object;

        if (!result) {
            console.log('No result for token:', token);
            res.status(401).json({ message: 'InvalidToken' });
            return
        }

        if (new Date(result.__expires) < new Date()) {
            res.status(401).json({ message: 'TokenExpired' });
            return
        }

        if (result.action !== 'password-reset') {
            console.log('Invalid action for token:', result.action);
            res.status(401).json({ message: 'InvalidToken' });
            return
        }

        let password_hash = await bcrypt.hash(new_password, 12);

        await db.run('UPDATE Logins SET password_hash = $1 WHERE id = $2', [ password_hash, (result as any).account ]);
        await db.run('UPDATE Sudo SET __expires = $1 WHERE token = $2', [ new Date(), token ]);

        res.status(200).json({ message: 'Success' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.post('/email-reset', async (req: Request, res: Response) => {
    let token: string = req.body.token;
    let new_email: string = req.body.new_email;

    try {
        let result: Record<string, any> | undefined = await db.get('SELECT * FROM Sudo WHERE token = $1', [ token ]) as Object;

        if (!result) {
            console.log('No result for token:', token);
            res.status(401).json({ message: 'InvalidToken' });
            return
        }

        if (new Date(result.__expires) < new Date()) {
            res.status(401).json({ message: 'TokenExpired' });
            return
        }

        if (result.action !== 'email-reset') {
            console.log('Invalid action for token:', result.action);
            res.status(401).json({ message: 'InvalidToken' });
            return
        }

        await db.run('UPDATE Logins SET email = $1 WHERE id = $2', [ new_email, (result as any).account ]);
        await db.run('UPDATE Sudo SET __expires = $1 WHERE token = $2', [ new Date(), token ]);

        res.status(200).json({ message: 'Success' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.post('/delete', async (req: Request, res: Response) => {
    let token: string = req.cookies.token ? req.cookies.token : req.body.token;

    try {
        let result: Record<string, any> | undefined = await db.get('SELECT * FROM Sudo WHERE token = $1', [ token ]) as Object;

        if (!result) {
            console.log('No result for token:', token);
            res.status(401).json({ message: 'InvalidToken' });
            return
        }

        if (new Date(result.__expires) < new Date()) {
            res.status(401).json({ message: 'TokenExpired' });
            return
        }

        if (result.action !== 'delete-account') {
            res.status(401).json({ message: 'InvalidToken' });
            return
        }

        // Delete from Logins - ON DELETE CASCADE handles all related tables
        await db.run('DELETE FROM Logins WHERE id = $1', [ result.account ]);

        res.status(200).json({ message: 'Success' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;