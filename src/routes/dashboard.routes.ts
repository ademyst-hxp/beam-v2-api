import { Router } from 'express';
import type { Request, Response } from 'express';

import multer from 'multer';
import { readFile } from 'fs/promises';
import sharp from 'sharp';

import { can_access } from '../utils/functions.js';
import { convertPost, convertProfile } from '../utils/converters.js';

import { db, supabase } from '../db/index.js';
import type { Session } from '../db/models/auth.js';
import type { Badge, PartialProfile, Settings, Relations, Tastes } from '../db/models/profiles.js'
import type { PartialPost, Post } from '../db/models/interactions.js';
import type { PartialInbox, Inbox } from '../db/models/inbox.js';
import type { Notification, PendingRequest } from '../db/models/inbox.js';

const router = Router();

function isValidImage(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) return true;
    // GIF: GIF87a or GIF89a
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38 &&
        (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61) return true;
    // WebP: RIFF????WEBP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
    // BMP: BM
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) return true;
    // TIFF: little-endian (II) or big-endian (MM)
    if ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2A && buffer[3] === 0x00) ||
        (buffer[0] === 0x4D && buffer[1] === 0x4D && buffer[2] === 0x00 && buffer[3] === 0x2A)) return true;

    return false;
}

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

        let inbox: PartialInbox | undefined;
        inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ session.account ]) as PartialInbox;

        let badge: Badge | null = profile.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ profile.badge ]) as Badge : null;

        let new_profile = convertProfile(profile, relations, badge);

        res.status(200).json({ 
            profile: new_profile,
            avatar: '/users/' + new_profile.name + '/avatar',
            relations: {
                ...relations,
                incoming: inbox.incoming.follow.map((request) => request.from),
                outgoing: inbox.outgoing.follow.map((request) => request.to)
            },
            settings: settings,
            tastes: tastes
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

        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as PartialProfile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        let badge = profile.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ profile.badge ]) as Badge : null;

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ session.account ]) as Relations;

        let inbox: PartialInbox | undefined;
        inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ session.account ]) as PartialInbox;

        const new_inbox: Inbox = {
            id: inbox.id,
            read: [] as Notification[],
            unread: [] as Notification[],
            outgoing: {
                children: [] as PendingRequest[],
                follow: [] as PendingRequest[]
            },
            incoming: {
                children: [] as PendingRequest[],
                follow: [] as PendingRequest[]
            },
        }

        for (const u of inbox.outgoing.children) {
            const _user = await db.get('SELECT * FROM Users WHERE id = $1;', [ u.to ]) as PartialProfile;

            if (!_user) continue

            const _badge: Badge | null = _user?.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ _user.badge ]) as Badge : null;

            new_inbox.outgoing.children.push({
                from: convertProfile(profile, relations, badge),
                to: convertProfile(_user, await db.get('SELECT * FROM Relations WHERE id = $1;', [ _user.id ]) as Relations, _badge),
                date: new Date(u.date)
            } as PendingRequest);
        }

        for (const u of inbox.outgoing.follow) {
            const _user = await db.get('SELECT * FROM Users WHERE id = $1;', [ u.to ]) as PartialProfile;

            if (!_user) continue

            const _badge: Badge | null = _user?.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ _user.badge ]) as Badge : null;

            new_inbox.outgoing.follow.push({
                from: convertProfile(profile, relations, badge),
                to: convertProfile(_user, await db.get('SELECT * FROM Relations WHERE id = $1;', [ _user.id ]) as Relations, _badge),
                date: new Date(u.date)
            } as PendingRequest);
        }

        for (const u of inbox.incoming.children) {
            const _user = await db.get('SELECT * FROM Users WHERE id = $1;', [ u.from ]) as PartialProfile;

            if (!_user) continue

            const _badge: Badge | null = _user?.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ _user.badge ]) as Badge : null;

            new_inbox.incoming.children.push({
                from: convertProfile(_user, await db.get('SELECT * FROM Relations WHERE id = $1;', [ _user.id ]) as Relations, _badge),
                to: convertProfile(profile, relations, badge),
                date: new Date(u.date)
            } as PendingRequest);
        }

        for (const u of inbox.incoming.follow) {
            const _user = await db.get('SELECT * FROM Users WHERE id = $1;', [ u.from ]) as PartialProfile;

            if (!_user) continue

            const _badge: Badge | null = _user?.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ _user.badge ]) as Badge : null;

            new_inbox.incoming.follow.push({
                from: convertProfile(_user, await db.get('SELECT * FROM Relations WHERE id = $1;', [ _user.id ]) as Relations, _badge),
                to: convertProfile(profile, relations, badge),
                date: new Date(u.date)
            } as PendingRequest);
        }

        for (const n of inbox.other) {
            let new_n: Notification = { ...n } as Notification;

            if (n.author) {
                const _user = await db.get('SELECT * FROM Users WHERE id = $1;', [ n.author ]) as PartialProfile;
                if (!_user) continue

                const _badge: Badge | null = _user.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ _user.badge ]) as Badge : null;
                new_n.author = convertProfile(_user, await db.get('SELECT * FROM Relations WHERE id = $1;', [ _user.id ]) as Relations, _badge);
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

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

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

router.get('/entitlements', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    let include_expired = req.query.include_expired === 'true' || false;
    let include_revoked = req.query.include_revoked === 'true' || false;
    let type = req.query.type as string | null;
    let target = req.query.target as string | null;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let entitlements;
        entitlements = await db.all('SELECT * FROM Entitlements WHERE account = $1;', [ session.account ]);

        entitlements = entitlements.filter((e: any) => {
            if (!include_expired && e.expires_at && new Date(e.expires_at) < new Date()) return false
            if (!include_revoked && e.revoked) return false
            if (type && e.reward_type !== type) return false
            if (target && e.reward_id !== target) return false

            return true
        });

        res.status(200).json(entitlements);
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/entitlements/badges', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let entitlements;
        entitlements = await db.all('SELECT * FROM Entitlements WHERE account = $1;', [ session.account ]);

        entitlements = entitlements.filter((e: any) => {
            if (e.expires_at && new Date(e.expires_at) < new Date()) return false
            if (e.revoked) return false
            if (e.reward_type !== 'badge') return false

            return true
        });

        const badges: Badge[] = [];

        for (const e of entitlements) {
            const badge: Badge | null = await db.get('SELECT * FROM Badges WHERE id = $1;', [ e.reward_id ]) as Badge;

            if (badge) {
                badges.push(badge);
            } else {
                console.log("Badge not found:", e.reward_id);
            }
        }

        res.status(200).json(badges);
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
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
            !/^[a-z0-9_]+$/.test(new_profile.name)
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

        let entitlements;
        entitlements = await db.all('SELECT * FROM Entitlements WHERE account = $1;', [ session.account ]);

        entitlements = entitlements.filter((e: any) => {
            if (e.expires_at && new Date(e.expires_at) < new Date()) return false
            if (e.revoked) return false
            if (e.reward_type !== 'badge') return false
            if (e.reward_id !== new_profile.badge) return false

            return true
        });

        if (new_profile.badge && !entitlements.length) {
            new_profile.badge = null;
        }


        await db.run('UPDATE Users SET name = $1, display_name = $2, pronouns = $3, account_type = $4, description = $5, status = $6, update_date = $7, badge = $8 WHERE id = $9;', [
            new_profile.name,
            new_profile.display_name,
            new_profile.pronouns,
            new_profile.account_type,
            new_profile.description,
            new_profile.status,
            new Date(),
            new_profile.badge,
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

        if (!isValidImage(file_buffer)) {
            res.status(400).json({ message: 'InvalidImageFile' });
            return
        }

        const webp_buffer = await sharp(file_buffer).webp().toBuffer();

        await db.run('INSERT INTO Files (id, author_id, path, type, visibility, ephemeral, creation_date, update_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT(id) DO UPDATE SET type = $4, update_date = $8;', [
            session.account,
            session.account,
            `/avatars/${session.account}`,
            'image/webp',
            'everyone',
            false,
            new Date(),
            new Date()
        ]);

        await supabase.storage.from('profiles').upload(`/avatars/${session.account}`, webp_buffer, {
            contentType: 'image/webp',
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
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 50;

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

        let posts: Post[] = [];
        let _result: PartialPost[] = await db.all('SELECT * FROM Posts WHERE id = ANY($1) OR author_id = ANY($2) OR likes > 5 ORDER BY creation_date DESC;', [ likes, my_relations.following ]) as PartialPost[];

        for (const p of _result) {
            const profile: PartialProfile | undefined = await db.get('SELECT * FROM Users WHERE id = $1;', [ p.author_id ]) as PartialProfile;
            const relations: Relations | undefined = await db.get('SELECT * FROM Relations WHERE id = $1;', [ p.author_id ]) as Relations;
            const badge: Badge | null = profile.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ profile.badge ]) as Badge : null;

            const is_visible = (field: string) => can_access(field, profile, relations, session)

            const reposts = await db.get(`SELECT COUNT(*) FROM Posts WHERE parent_id = $1;`, [ p.id ]);
            const comments = await db.get(`SELECT COUNT(*) FROM Comments WHERE post_id = $1;`, [ p.id ]);

            let new_p = await convertPost(
                p, 
                { 
                    reposts: parseInt(reposts.count), 
                    comments: parseInt(comments.count)
                },
                convertProfile(profile, relations, badge)
            );

            if (is_visible(p.visibility) && !my_relations.blocklist.includes(new_p.author.id)) {
                posts.push(new_p)
            }
        }

        posts = posts.sort((a, b) => new Date(b.creation_date).getTime() - new Date(a.creation_date).getTime());

        const calcStats = (post: Post): number => {
            let stats = post.likes;
            stats += 1.5 * post.reposts;
            stats += 2 * post.comments;
            stats += 5 * (post.author.level - 3); // mise en avant des comptes de confiance
            stats += 40 * (7 - (new Date().getTime() - post.creation_date.getTime()) / 1000 / 60 / 60 / 24); // mise en avant du contenu récent

            return stats;
        }

        posts = posts.sort((a, b) => calcStats(b) - calcStats(a));
        posts = posts.filter((p) => p.author.id != session!.account);

        if (posts.length > limit) {
            posts = posts.filter((p) => p.creation_date >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
        }

        posts = posts.slice(offset, offset + limit);

        res.status(200).json({ posts: posts });
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;