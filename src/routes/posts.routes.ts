import { Router } from 'express';

import type { Request, Response } from 'express';

import { db } from '../db/index.js';
import { can_access, genChar } from '../utils/functions.js';

import type { Session } from '../db/models/auth.js';
import type { Post, Comment } from '../db/models/interactions.js';
import type { Profile, Settings, Relations, Tastes } from '../db/models/profiles.js';
import type { Inbox, NotificationGroup, NotificationSingle } from '../db/models/inbox.js';

const router = Router();

router.get('/:id', async (req: Request, res: Response) => {
    const id = req.params.id

    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;
        let author: Profile | null;

        if (session) {
            author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as Profile;
        } else {
            author = null;
        }


        let post: any;
        post = await db.get('SELECT * FROM Posts WHERE id = $1;', [ id ]);

        if (!post) {
            res.status(404).json({ message: 'PostNotFound' });
            return
        }

        let _profile: Profile | undefined;
        _profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ post.author_id ]) as Profile;

        if (!_profile) {
            res.status(403).json({ message: 'PrivateAccount' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ _profile.id ]) as Relations;

        let settings: Settings | undefined;
        settings = await db.get('SELECT * FROM Settings WHERE id = $1;', [ _profile.id ]) as Settings;

        const is_visible = (field: string) => can_access(field, _profile, relations, session)

        if (!is_visible(settings.privacy.birthday)) {
            _profile.birthday = null;
        }

        if (!is_visible(settings.privacy.status)) {
            _profile.status = null;
        }

        if (!is_visible(settings.privacy.profile)) {
            _profile.pronouns = null;
        }

        if (!is_visible(post.visibility)) {
            res.status(403).json({ message: 'PrivatePost' });
            return
        }


        let { author_id, tags, flags, ...__without_id } = post
        let { flags: _, ...profile } = _profile

        const reposts = await db.get(`SELECT COUNT(*) FROM Posts WHERE parent_id = $1;`, [ id ]);
        const comments = await db.get(`SELECT COUNT(*) FROM Comments WHERE post_id = $1;`, [ id ]);

        const data: Post = {
            ...__without_id,
            reposts: parseInt(reposts.count),
            comments: parseInt(comments.count),
            author: {
                ...profile,
                following: relations.following.length,
                followers: relations.followers.length
            }
        }

        res.status(200).json(data)
    } catch(err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    const id = req.params.id

    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: Profile | null;
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as Profile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }


        let post: any;
        post = await db.get('SELECT * FROM Posts WHERE name = $1;', [ id ]);

        if (!post) {
            res.status(404).json({ message: 'PostNotFound' });
            return
        }

        let profile: Profile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ post.author_id ]) as Profile;

        if (author.level >= 4 || (profile && post.id == profile.id)) {
            await db.run('DELETE * FROM Posts WHERE id = $1;', [ id ]);
        } else {
            res.status(403).json({ message: 'Forbidden' })
        }

        res.status(200).json({ message: 'Success' })
    } catch(err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});


router.post('/:id/like', async (req: Request, res: Response) => {
    const id = req.params.id

    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: Profile | null;
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as Profile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let tastes: Tastes | null;
        tastes = await db.get('SELECT * FROM Tastes WHERE id = $1;', [ session.account ]) as Tastes;



        let post: any;
        post = await db.get('SELECT * FROM Posts WHERE id = $1;', [ id ]);

        if (!post) {
            res.status(404).json({ message: 'PostNotFound' });
            return
        }

        let profile: Profile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ post.author_id ]) as Profile;

        if (!profile) {
            res.status(403).json({ message: 'PrivateAccount' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ profile.id ]) as Relations;

        if (relations.blocklist.includes(session.id) || relations.blocklist.includes(session.ip || '')) {
            res.status(404).json({ message: 'PostNotFound' });
            return
        }

        let inbox: Inbox | undefined;
        inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ profile.id ]) as Inbox;



        const is_visible = (field: string) => can_access(field, profile, relations, session)

        if (!is_visible(post.visibility)) {
            res.status(403).json({ message: 'PrivateAccount' });
            return
        }


        if (tastes.likes.includes(post.id)) {
            res.status(204).json({ message: 'Success' })
            return
        } else {
            tastes.likes.push(post.id)
            post.likes += 1

            let found = false;

            for (const notif of inbox.other) {
                if (
                    notif.type == 'like'
                    && (notif as NotificationGroup).target == post.id
                    && !(notif as NotificationGroup).read
                    && !(notif as NotificationGroup).authors.includes(author.id)
                ) {
                    (notif as NotificationGroup).authors.push(author.id)
                    notif.date = new Date()
                    found = true;

                    break
                }
            }

            if (!found) {
                const new_notif: NotificationGroup = {
                    id: genChar(12, 'hex').toUpperCase(),
                    date: new Date(),
                    type: 'like',
                    isGroupable: true,
                    read: false,
                    authors: [ author.id ],
                    target: post.id,
                }

                inbox.other.unshift(new_notif)
            }

            await db.run('UPDATE Inbox SET other = $1 WHERE id = $2;', [ inbox.other, profile.id ])
        }

        await db.run('UPDATE Tastes SET likes = $1 WHERE id = $2;', [ tastes.likes, author.id ])
        await db.run('UPDATE Posts SET likes = $1 WHERE id = $2;', [ post.likes, post.id ])

        res.status(200).json({ message: 'Success' })
    } catch(err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});


router.delete('/:id/like', async (req: Request, res: Response) => {
    const id = req.params.id

    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: Profile | null;
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as Profile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let tastes: Tastes | null;
        tastes = await db.get('SELECT * FROM Tastes WHERE id = $1;', [ session.account ]) as Tastes;



        let post: any;
        post = await db.get('SELECT * FROM Posts WHERE id = $1;', [ id ]);

        if (!post) {
            res.status(404).json({ message: 'PostNotFound' });
            return
        }

        let profile: Profile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ post.author_id ]) as Profile;

        if (!profile) {
            res.status(403).json({ message: 'PrivateAccount' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ profile.id ]) as Relations;

        if (relations.blocklist.includes(session.id) || relations.blocklist.includes(session.ip || '')) {
            res.status(404).json({ message: 'PostNotFound' });
            return
        }


        const is_visible = (field: string) => can_access(field, profile, relations, session)

        if (!is_visible(post.visibility)) {
            res.status(403).json({ message: 'PrivatePost' });
            return
        }


        if (!tastes.likes.includes(post.id)) {
            res.status(204).json({ message: 'Success' })
            return
        } else {
            tastes.likes = tastes.likes.filter((_id: string) => _id !== post.id)
            post.likes -= 1
        }

        await db.run('UPDATE Tastes SET likes = $1 WHERE id = $2;', [ tastes.likes, author.id ])
        await db.run('UPDATE Posts SET likes = $1 WHERE id = $2;', [ post.likes, post.id ])

        res.status(200).json({ message: 'Success' })
    } catch(err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});


/**********************************/

router.post('/new', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    const content: string = req.body.content
    const visibility: Post['visibility'] = req.body.visibility
    const answers_to: string | null = req.body.answers_to || null


    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: Profile | null;
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as Profile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        const parent: Post | undefined = answers_to ? await db.get('SELECT * FROM Posts WHERE id = $1;', [ answers_to ]) as Post : undefined;
        const parent_author: Profile | undefined = parent ? await db.get('SELECT * FROM Users WHERE id = $1;', [ parent.author_id ]) as Profile : undefined;

        if (answers_to && !(parent && parent_author)) {
            res.status(404).json({ message: 'ParentPostNotFound' });
            return
        }

        /* Limitations & sécurité */
        if (content.length > 5000) {
            res.status(413).json({ message: 'PostTooLong' })
        }

        /* Enregistrement du post */
        let post: any = {
            id: genChar(8, 'hex').toUpperCase(),
            author_id: author.id,
            parent_id: parent?.id || null,
            content: content,
            attachments: [],
            visibility: visibility,
            creation_date: new Date(),
            update_date: null,
            likes: 0
        }

        try {
            if (answers_to) {
                const parent_relations: Relations | undefined = await db.get('SELECT * FROM Relations WHERE id = $1;', [ parent_author!.id ]) as Relations;
                const is_visible = (field: string) => can_access(field, parent_author!, parent_relations, session)

                if (!is_visible(parent!.visibility)) {
                    res.status(403).json({ message: 'ParentPostIsPrivate' });
                    return
                }

                const parent_inbox: Inbox | undefined = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ parent_author!.id ]) as Inbox;

                const new_notif: NotificationSingle = {
                    id: genChar(12, 'hex').toUpperCase(),
                    date: new Date(),
                    type: 'repost',
                    isGroupable: false,
                    read: false,
                    author: author.id,
                    target: post!.id,
                }

                parent_inbox.other.unshift(new_notif)

                await db.run('UPDATE Inbox SET other = $1 WHERE id = $2;', [ parent_inbox.other, parent_author!.id ])
            }

            await db.run('INSERT INTO Posts (id, author_id, parent_id, content, attachments, visibility, creation_date, update_date, likes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', Object.values(post))
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Error'});
            return
        }

        let { author_id, ...__without_id } = post

        const data: Post = {
            author: author,
            ...__without_id
        }

        res.status(200).json(data)
    } catch(err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;