import { Router } from 'express';

import type { Request, Response } from 'express';

import { db } from '../db/index.js';
import { can_access } from '../utils/functions.js';

import type { Session } from '../db/models/auth.js';
import type { Profile, Relations, Tastes } from '../db/models/profiles.js'
import { Post } from '@/db/models/interactions.js';

const router = Router();

router.get('/users', async (req: Request, res: Response) => {
    try {
        let users: any[] = [];
        let _result: any[] = await db.all('SELECT * FROM Users;') as Profile[];

        for (const u of _result) {
            const relations: Relations | undefined = await db.get('SELECT * FROM Relations WHERE id = $1;', [ u.id ]) as Relations;

            let new_u: Record<string, any> = {
                ...u,
                following: relations.following.length,
                followers: relations.followers.length
            }

            users.push(new_u);
        }

        users = users.sort((a, b) => b.followers - a.followers).slice(
            parseInt(req.query.offset as string) || 0,
            parseInt(req.query.limit as string) || users.length
        );

        res.status(200).json(users);
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/posts', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let order_by = req.query.sort_by || 'date'

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let my_relations: Relations | undefined;
        let my_tastes: Tastes | undefined;

        if (session) {
            my_relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ session.account ]) as Relations;
            my_tastes = await db.get('SELECT * FROM Tastes WHERE id = $1;', [ session.account ]) as Tastes;
        } else {
            my_relations = {
                id: '',
                blocklist: [],
                pending: { children: [], followers: [], following: [] },
                following: [],
                followers: [],
                friends: [],
                parents: [],
                children: []
            } as Relations;

            my_tastes = { id: '', likes: [], hashtags: [] } as Tastes;
        }

        let posts: any[] = [];
        let _result: any[] = await db.all('SELECT * FROM Posts ORDER BY creation_date DESC;') as Post[];

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

        if (order_by == 'date') {
            posts = posts.sort((a, b) => new Date(b.creation_date).getTime() - new Date(a.creation_date).getTime());
        } else if (order_by == 'stats') {
            const calcStats = (post: any) => {
                let stats = post.likes;
                stats += 2 * post.reposts;
                stats += 5 * post.comments;
                stats += 10 * (post.author.level - 3); // mise en avant des comptes de confiance

                return stats;
            }

            posts = posts.sort((a, b) => calcStats(b) - calcStats(a));
        }

        res.status(200).json(posts);
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;