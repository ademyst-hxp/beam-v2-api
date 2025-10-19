import { Router } from 'express';
import bcrypt from 'bcrypt';

import type { Request, Response } from 'express';

import { db } from '../utils/db.js';
import { convert, parse } from '../utils/functions.js';

import type { Session } from '../models/auth.js';
import type { Profile, ProfileSettings } from '../models/profiles.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = parse(await db.get('SELECT * FROM Sessions WHERE token = ?;', [ token ])) as Session;

        if (!session) {
            res.status(401).send({ message: 'Unauthorized' });
            return
        }

        let profile: Profile | undefined;
        profile = parse(await db.get('SELECT * FROM Users WHERE id = ?;', [ session.account ])) as Profile;

        let settings: ProfileSettings | undefined;
        settings = parse(await db.get('SELECT * FROM Settings WHERE id = ?;', [ session.account ])) as ProfileSettings;

        res.status(200).json({ profile: profile, settings: settings, inbox: {} });
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/settings', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = parse(await db.get('SELECT * FROM Sessions WHERE token = ?;', [ token ])) as Session;
        let settings: ProfileSettings | undefined;
        settings = parse(await db.get('SELECT * FROM Settings WHERE id = ?;', [ session.account ])) as ProfileSettings;
        
        res.status(200).json(settings);
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.put('/update_settings', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let updates: Record<string, any> = req.body

    try {
        let session: Session | undefined = parse(await db.get('SELECT * FROM Sessions WHERE token = ?;', [ token ])) as Session;
        let settings: ProfileSettings | undefined;
        settings = parse(await db.get('SELECT * FROM Settings WHERE id = ?;', [ session.account ])) as ProfileSettings;

        for (const [k, v] of Object.entries(updates)) {
            switch (k) {
                case 'privacy':
                    settings.preferences.privacy = v;
                    break;

                case 'appearance':
                    settings.preferences.appearance = v;
                    break;
            }
        }

        await db.run('UPDATE Settings SET preferences = ? WHERE id = ?;', [ JSON.stringify(settings.preferences), session.account ]);

        res.status(200).json(settings);
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;