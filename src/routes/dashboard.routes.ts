import { Router } from 'express';
import bcrypt from 'bcrypt';

import type { Request, Response } from 'express';

import { db } from '../db/index.js';
import { can_access } from '../utils/functions.js';

import type { Session } from '../db/models/auth.js';
import type { Profile, Settings, Relations, Tastes, Inbox } from '../db/models/profiles.js'
import type { Post } from '../db/models/interactions.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let profile: Profile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as Profile;

        let inbox: Inbox | undefined;
        inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ session.account ]) as Inbox;

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
            inbox: inbox
        });
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

router.put("/update", async (req: Request, res: Response) => {
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

        
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error" });
    }
});

router.get('/feed', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

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
        let _result: any[] = await db.all('SELECT * FROM Posts WHERE id = ANY($1) ORDER BY creation_date DESC;', [ likes ]) as Post[];

        for (const p of _result) {
            const profile: Profile | undefined = await db.get('SELECT * FROM Users WHERE id = $1;', [ p.author_id ]) as Profile;
            const relations: Relations | undefined = await db.get('SELECT * FROM Relations WHERE id = $1;', [ p.author_id ]) as Relations;

            const is_visible = (field: string) => can_access(field, profile, relations, session)

            const reposts = await db.get(`SELECT COUNT(*) FROM Posts WHERE parent_id = $1;`, [ p.id ]);
            const comments = await db.get(`SELECT COUNT(*) FROM Comments WHERE post_id = $1;`, [ p.id ]);

            let new_p: Record<string, any> = {
                ...p,
                author: {
                    ...profile,
                    following: relations.following.length,
                    followers: relations.followers.length
                },
                likes: p.likes,
                reposts: reposts.count,
                comments: comments.count,
            }

            if (is_visible(p.visibility) && !my_relations.blocklist.includes(new_p.author.id)) {
                posts.push(new_p)
            }
        }

        posts = posts.sort((a, b) => new Date(b.creation_date).getTime() - new Date(a.creation_date).getTime());

        const calcStats = (post: any) => {
            let stats = post.likes;
            stats += 2 * post.reposts;
            stats += 5 * post.comments;
            stats += 10 * (post.author.level - 3); // mise en avant des comptes de confiance

            return stats;
        }

        posts = posts.sort((a, b) => calcStats(b) - calcStats(a));
        posts = posts.filter((p) => !my_tastes.likes.includes(p.id));

        res.status(200).json({ posts: posts });
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;