import { Router } from 'express';

import type { Request, Response } from 'express';

import { db } from '../db/index.js';

import type { Session } from '../db/models/auth.js';
import type { Profile } from '../db/models/profiles.js';

const router = Router();

router.put('/:name/ban', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;
    let soft: boolean = req.query.soft == 'true'

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let author: Profile | undefined;
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as Profile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let profile: Profile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as Profile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        if (author.level < 6 || author.level <= profile.level) {
            res.status(403).json({ message: 'Forbidden' });
            return
        }

        await db.run('UPDATE Users SET level = $1 WHERE name = $2;', [ soft ? 1 : 0, name ])
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.put('/:name/softban', async (req: Request, res: Response) => {
    res.redirect(`/mod/${req.params.name}/ban?soft=true`)
});

router.put('/:name/revoke', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let author: Profile | undefined;
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as Profile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let profile: Profile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as Profile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        if (author.level < 6 || author.level <= profile.level) {
            res.status(403).json({ message: 'Forbidden' });
            return
        }

        if (profile.level >= 3) {
            res.status(204).json({ message: 'NoContent' });
            return
        }

        await db.run('UPDATE Users SET level = $1 WHERE name = $2;', [ 3, name ])
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});


router.put('/:name/promote', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;
    let level: number | undefined = parseInt(req.params.level) || undefined

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let author: Profile | undefined;
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as Profile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        if (author.level < 7) {
            res.status(403).json({ message: 'Forbidden' });
            return
        }


        let profile: Profile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as Profile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        if (profile.level >= 7) { // Le niveau 8 doit être attribué manuellement
            res.status(403).json({ message: 'Forbidden' });
            return
        }

        if (level && level > 7) {
            res.status(400).json({ message: 'LevelToHigh', details: `Level must be ${Math.min(3, profile.level)}~7` });
            return
        }

        if (level && (level <= 3 || level <= profile.level)) {
            res.status(400).json({ message: 'LevelToLow', details: `Level must be ${Math.min(3, profile.level)}~7` });
            return
        }

        await db.run('UPDATE Users SET level = $1 WHERE name = $2;', [ level ? level : profile.level + 1, name ])
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.put('/:name/demote', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let author: Profile | undefined;
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as Profile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let profile: Profile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as Profile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        if (author.level < 7) { // Le niveau 8 doit être attribué manuellement
            res.status(403).json({ message: 'Forbidden' });
            return
        }

        if (profile.level <= 3) {
            res.status(204).json({ message: 'NoContent' });
            return
        }

        await db.run('UPDATE Users SET level = $1 WHERE name = $2;', [ 3, name ])
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;