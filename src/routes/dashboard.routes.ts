import { Router } from 'express';
import multer from 'multer';
import { readFile } from 'fs/promises';

import type { Request, Response } from 'express';

import { db, supabase } from '../db/index.js';
import { can_access } from '../utils/functions.js';
import { convertPost, convertProfile } from '../utils/converters.js';

import type { Session } from '../db/models/auth.js';
import type { PartialProfile, Profile, Settings, Relations, Tastes } from '../db/models/profiles.js'
import type { PartialPost } from '../db/models/interactions.js';
import type { PartialInbox, PartialNotification } from '../db/models/inbox.js';
import type { Notification } from '../db/models/inbox.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as PartialProfile;

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ session.account ]) as Relations;

        let settings: Settings | undefined;
        settings = await db.get('SELECT * FROM Settings WHERE id = $1;', [ session.account ]) as Settings;

        let tastes: Tastes | undefined;
        tastes = await db.get('SELECT * FROM Tastes WHERE id = $1;', [ session.account ]) as Tastes;

        res.status(200).json({ 
            profile: profile,
            avatar: '/users/' + profile.name + '/avatar',
            relations: relations,
            settings: settings,
            tastes: tastes,
            inbox: {
                id: '',
                requests: {
                    children: [],
                    following: [],
                    followers: []
                },
                other: []
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/inbox', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let leave_unread = req.query.leave_unread === 'true' || false;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let inbox: PartialInbox | undefined;
        inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ session.account ]) as PartialInbox;

        const new_inbox = {
            id: inbox.id,
            read: [] as Notification[],
            unread: [] as Notification[],
            requests: {
                children: [] as Profile[],
                following: [] as Profile[],
                followers: [] as Profile[]
            }
        }

        for (const u of inbox.requests.children) {
            const _user = await db.get('SELECT * FROM Users WHERE id = $1;', [ u ]) as PartialProfile;

            new_inbox.requests.children.push(convertProfile(_user, await db.get('SELECT * FROM Relations WHERE id = $1;', [ _user.id ]) as Relations));
        }

        for (const u of inbox.requests.following) {
            const _user = await db.get('SELECT * FROM Users WHERE id = $1;', [ u ]) as PartialProfile;

            new_inbox.requests.following.push(convertProfile(_user, await db.get('SELECT * FROM Relations WHERE id = $1;', [ _user.id ]) as Relations));
        }

        for (const u of inbox.requests.followers) {
            const _user = await db.get('SELECT * FROM Users WHERE id = $1;', [ u ]) as PartialProfile;

            new_inbox.requests.followers.push(convertProfile(_user, await db.get('SELECT * FROM Relations WHERE id = $1;', [ _user.id ]) as Relations));
        }

        for (const n of inbox.other) {
            let new_n: Notification = { ...n } as Notification;

            if (n.author) {
                const _user = await db.get('SELECT * FROM Users WHERE id = $1;', [ n.author ]) as PartialProfile;
                new_n.author = convertProfile(_user, await db.get('SELECT * FROM Relations WHERE id = $1;', [ _user.id ]) as Relations);
            }

            if (n.read) {
                new_inbox.read.push(new_n);
            } else {
                new_inbox.unread.push(new_n);
            }
        }

        res.status(200).json(new_inbox);

        if (!leave_unread) {
            for (const n of inbox.other) {
                n.read = true;
            }

            await db.run('UPDATE Inbox SET other = $1 WHERE id = $2;', [ inbox.other, inbox.id ]);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/settings', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let settings: Settings | undefined;
        settings = await db.get('SELECT * FROM Settings WHERE id = $1;', [ session.account ]) as Settings;

        res.status(200).json(settings);
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.put("/settings", async (req: Request, res: Response) => {
    const token =
        req.cookies?.token ||
        req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const updates: Settings = req.body;

    try {
        const session = await db.get<Session>(
            "SELECT * FROM Sessions WHERE token = $1",
            [token]
        );

        if (!session) {
            return res.status(401).json({ message: "Invalid session" });
        }

        const currentSettings = await db.get<Settings>(
            "SELECT * FROM Settings WHERE id = $1",
            [session.account]
        );

        const new_settings = {
            ...currentSettings,
            ...updates
        };

        await db.run(
            "UPDATE Settings SET privacy = $1, appearance = $2 WHERE id = $3;",
            [
                new_settings.privacy,
                new_settings.appearance,
                session.account,
            ]
        );

        res.status(200).json({ message: "Success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error" });
    }
});

router.put('/profile', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    const updates: Partial<PartialProfile> = req.body;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as PartialProfile;

        const new_profile = {
            ...profile,
            ...updates
        };

        if (
            new_profile.name.length < 3 ||
            new_profile.name.length > 24 ||
            !/^[a-zA-Z0-9_]+$/.test(new_profile.name)
        ) {
            res.status(400).json({ message: 'InvalidProfileName' });
            return
        }

        if (
            new_profile.display_name && new_profile.display_name.length > 30
        ) {
            res.status(400).json({ message: 'InvalidDisplayName' });
            return
        }

        if (
            new_profile.status && new_profile.status.length > 25
        ) {
            res.status(400).json({ message: 'InvalidStatus' });
            return
        }

        if (
            new_profile.description && new_profile.description.length > 200
        ) {
            res.status(400).json({ message: 'InvalidDescription' });
            return
        }

        if (
            new_profile.pronouns && new_profile.pronouns.length > 20
        ) {
            res.status(400).json({ message: 'InvalidPronouns' });
            return
        }

        await db.run('UPDATE Users SET name = $1, display_name = $2, pronouns = $3, account_type = $4, description = $5, status = $6, update_date = $7 WHERE id = $8;', [
            new_profile.name,
            new_profile.display_name,
            new_profile.pronouns,
            new_profile.account_type,
            new_profile.description,
            new_profile.status,
            new Date(),
            session.account
        ]);

        await db.run('UPDATE Logins SET username = $1 WHERE id = $2;', [
            new_profile.name,
            session.account
        ]);

        res.status(200).json({ message: 'Success' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

const avatar_upload = multer({
    dest: ".local/uploads/", // dossier temporaire
    limits: { fileSize: 5 * 1024 * 1024 }, // limite de taille de fichier à 5MB
});

router.post('/avatar', avatar_upload.single('avatar'),async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    const avatar_data = req.file;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        const file_buffer = await readFile(avatar_data!.path);

        await db.run('INSERT INTO Files (id, author_id, path, type, visibility, ephemeral, creation_date, update_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT(id) DO UPDATE SET type = $4, update_date = $8;', [
            session.account,
            session.account,
            `/avatars/${session.account}`,
            avatar_data?.mimetype || 'image/png',
            'everyone',
            false,
            new Date(),
            new Date()
        ]);

        await supabase.storage.from('profiles').upload(`/avatars/${session.account}`, file_buffer, {
            contentType: avatar_data?.mimetype || 'image/png',
            upsert: true
        });

        res.status(200).json({ message: 'Success' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/feed', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let my_relations: Relations | undefined;
        my_relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ session.account ]) as Relations;

        let my_tastes: Tastes | undefined;
        my_tastes = await db.get('SELECT * FROM Tastes WHERE id = $1;', [ session.account ]) as Tastes;

        let likes: string[] = []

        for (const influencer of my_relations.following) {
            let influencer_tastes: Tastes | undefined;
            influencer_tastes = await db.get('SELECT * FROM Tastes WHERE id = $1;', [ influencer ]) as Tastes;

            likes = likes.concat(influencer_tastes.likes);
        }

        let posts: any[] = [];
        let _result: PartialPost[] = await db.all('SELECT * FROM Posts WHERE id = ANY($1) OR author_id = ANY($2) OR likes > 5 ORDER BY creation_date DESC;', [ likes, my_relations.following ]) as PartialPost[];

        for (const p of _result) {
            const profile: PartialProfile | undefined = await db.get('SELECT * FROM Users WHERE id = $1;', [ p.author_id ]) as PartialProfile;
            const relations: Relations | undefined = await db.get('SELECT * FROM Relations WHERE id = $1;', [ p.author_id ]) as Relations;

            const is_visible = (field: string) => can_access(field, profile, relations, session)

            const reposts = await db.get(`SELECT COUNT(*) FROM Posts WHERE parent_id = $1;`, [ p.id ]);
            const comments = await db.get(`SELECT COUNT(*) FROM Comments WHERE post_id = $1;`, [ p.id ]);

            let new_p = convertPost(
                p, 
                { 
                    reposts: parseInt(reposts.count), 
                    comments: parseInt(comments.count)
                },
                convertProfile(profile, relations)
            );

            if (is_visible(p.visibility) && !my_relations.blocklist.includes(new_p.author.id)) {
                posts.push(new_p)
            }
        }

        posts = posts.sort((a, b) => new Date(b.creation_date).getTime() - new Date(a.creation_date).getTime());

        const calcStats = (post: any): number => {
            let stats = post.likes;
            stats += 1.5 * post.reposts;
            stats += 2 * post.comments;
            stats += 5 * (post.author.level - 3); // mise en avant des comptes de confiance

            return stats;
        }

        for (const post of posts) {
            post.score = calcStats(post);
        }

        posts = posts.sort((a, b) => b.score - a.score);
        posts = posts.filter((p) => !my_tastes.likes.includes(p.id));

        res.status(200).json({ posts: posts });
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;