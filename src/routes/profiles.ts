import { Router } from 'express';
import bcrypt from 'bcrypt';

import type { Request, Response } from 'express';

import { db } from '../utils/db.js';
import { convert, parse, can_access } from '../utils/functions.js';

import type { Session } from '../models/auth.js';
import type { Profile, ProfileSettings } from '../models/profiles.js';

const router = Router();

router.get('/:name', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | undefined = parse(await db.get('SELECT * FROM Sessions WHERE token = ?;', [ token ])) as Session;

        let profile: Profile | undefined;
        profile = parse(await db.get('SELECT * FROM Users WHERE name = ?;', [ name ])) as Profile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        let settings: ProfileSettings | undefined;
        settings = parse(await db.get('SELECT * FROM Settings WHERE id = ?;', [ profile.id ])) as ProfileSettings;


        const is_visible = (field: string) => can_access(field, profile, settings, session)

        if (!is_visible(settings.preferences.privacy.birthday_visibility)) {
            profile.birthday = null;
        }

        if (!is_visible(settings.preferences.privacy.status_visibility)) {
            profile.status = null;
        }

        if (is_visible(settings.preferences.privacy.profile_visibility)) {
            res.status(200).json(profile);
            return
        } else {
            res.status(403).json({ message: 'PrivateAccount' });
            return
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.post('/:name/follow', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | undefined = parse(await db.get('SELECT * FROM Sessions WHERE token = ?;', [ token ])) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: Profile | null;
        author = parse(await db.get('SELECT * FROM Users WHERE id = ?;', [ session.account ])) as Profile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }


        let profile: Profile | undefined;
        profile = parse(await db.get('SELECT * FROM Users WHERE name = ?;', [ name ])) as Profile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        let settings: ProfileSettings | undefined;
        settings = parse(await db.get('SELECT * FROM Settings WHERE id = ?;', [ profile.id ])) as ProfileSettings;

        if (settings.blocklist.includes(session.id) || settings.blocklist.includes(session.ip || '')) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }


        const is_visible = (field: string) => can_access(field, profile, settings, session)

        if (profile.followers.includes(author.id)) {
            res.status(204).json({ message: 'NoContent' });
            return
        } else {
            if (is_visible(settings.preferences.privacy.profile_visibility)) {
                profile.followers.push(author.id);
                await db.run('UPDATE Users SET followers = ? WHERE id = ?;', [ JSON.stringify(profile.followers), profile.id ]);

                author.following.push(profile.id);
                await db.run('UPDATE Users SET following = ? WHERE id = ?;', [ JSON.stringify(author.following), author.id ]);

                res.status(200).json({ message: 'Success' });
                return
            } else {
                settings.pending.followers.push(session.account);
                await db.run('UPDATE Settings SET pending = ? WHERE id = ?;', [ JSON.stringify(settings.pending), profile.id ]);

                res.status(202).json({ message: 'Success' });
                return
            }
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.post('/:name/unfollow', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | undefined = parse(await db.get('SELECT * FROM Sessions WHERE token = ?;', [ token ])) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: Profile | null;
        author = parse(await db.get('SELECT * FROM Users WHERE id = ?;', [ session.account ])) as Profile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }


        let profile: Profile | undefined;
        profile = parse(await db.get('SELECT * FROM Users WHERE name = ?;', [ name ])) as Profile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }


        if (profile.followers.includes(author.id)) {
            let new_followers = profile.followers.filter((id) => id !== author.id);
            await db.run('UPDATE Users SET followers = ? WHERE id = ?;', [ JSON.stringify(new_followers), profile.id ]);

            let new_following = author.following.filter((id) => id !== profile.id);
            await db.run('UPDATE Users SET following = ? WHERE id = ?;', [ JSON.stringify(new_following), author.id ]);

            res.status(200).json({ message: 'Success' });
            return
        } else {
            res.status(204).json({ message: 'NoContent' });
            return
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});


router.post('/:name/block', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | undefined = parse(await db.get('SELECT * FROM Sessions WHERE token = ?;', [ token ])) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: Profile | null;
        author = parse(await db.get('SELECT * FROM Users WHERE id = ?;', [ session.account ])) as Profile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let settings: ProfileSettings | undefined;
        settings = parse(await db.get('SELECT * FROM Settings WHERE id = ?;', [ session.account ])) as ProfileSettings;


        let profile: Profile | undefined;
        profile = parse(await db.get('SELECT * FROM Users WHERE name = ?;', [ name ])) as Profile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }


        if (settings.blocklist.includes(profile.id)) {
            res.status(204).json({ message: 'NoContent' });
            return
        } else {
            settings.blocklist.push(profile.id);
            await db.run('UPDATE Settings SET blocklist = ? WHERE id = ?;', [ JSON.stringify(settings.blocklist), author.id ]);

            res.status(200).json({ message: 'Success' });
            return
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.post('/:name/unblock', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | undefined = parse(await db.get('SELECT * FROM Sessions WHERE token = ?;', [ token ])) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: Profile | null;
        author = parse(await db.get('SELECT * FROM Users WHERE id = ?;', [ session.account ])) as Profile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let settings: ProfileSettings | undefined;
        settings = parse(await db.get('SELECT * FROM Settings WHERE id = ?;', [ session.account ])) as ProfileSettings;


        let profile: Profile | undefined;
        profile = parse(await db.get('SELECT * FROM Users WHERE name = ?;', [ name ])) as Profile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }


        if (settings.blocklist.includes(profile.id)) {
            let new_blocklist = settings.blocklist.filter((id) => id !== profile.id);
            await db.run('UPDATE Settings SET blocklist = ? WHERE id = ?;', [ JSON.stringify(new_blocklist), author.id ]);

            res.status(200).json({ message: 'Success' });
            return
        } else {
            res.status(204).json({ message: 'NoContent' });
            return
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;