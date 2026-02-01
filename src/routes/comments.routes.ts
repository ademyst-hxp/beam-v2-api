import { Router } from 'express';

import type { Request, Response } from 'express';
import he from 'he'

import { db } from '../db/index.js';
import { can_access, genChar } from '../utils/functions.js';

import type { Session } from '../db/models/auth.js';
import type { PartialPost, PartialComment, Comment, Post } from '../db/models/interactions.js';
import type { Badge, PartialProfile, Settings, Relations, Tastes } from '../db/models/profiles.js';
import type { PartialInbox, PartialNotificationPost, NotificationSingle, PartialNotificationComment } from '../db/models/inbox.js';
import { convertComment, convertPost, convertProfile } from '../utils/converters.js';

const router = Router();

router.get('/:id', async (req: Request, res: Response) => {
    const id = req.params.id

    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;
        let author: PartialProfile | null;

        if (session) {
            author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as PartialProfile;
        } else {
            author = null;
        }


        let comment: PartialComment | null;
        comment = await db.get('SELECT * FROM Comments WHERE id = $1;', [ id ]) as PartialComment;

        if (!comment) {
            res.status(404).json({ message: 'CommentNotFound' });
            return
        }

        let _profile: PartialProfile | undefined;
        _profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ comment.author_id ]) as PartialProfile;

        if (!_profile) {
            res.status(403).json({ message: 'PrivateComment' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ _profile.id ]) as Relations;

        let settings: Settings | undefined;
        settings = await db.get('SELECT * FROM Settings WHERE id = $1;', [ _profile.id ]) as Settings;

        const badge: Badge | null = _profile.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ _profile.badge ]) as Badge : null;

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


        let _post: PartialPost | null;
        _post = await db.get('SELECT * FROM Posts WHERE id = $1;', [ comment.post_id ]) as PartialPost;

        if (!_post) {
            res.status(403).json({ message: 'PrivatePost' });
            return
        }

        if (!(is_visible(_post.visibility) || (comment.author_id == author?.id))) {
            res.status(403).json({ message: 'PrivatePost' });
            return
        }

        if (!(is_visible(comment.visibility) || (_post.author_id == author?.id))) {
            res.status(403).json({ message: 'PrivatePost' });
            return
        }


        const answers = await db.get(`SELECT COUNT(*) FROM Posts WHERE parent_id = $1;`, [ id ]);

        const reposts = await db.get(`SELECT COUNT(*) FROM Posts WHERE parent_id = $1;`, [ comment.post_id ]);
        const comments = await db.get(`SELECT COUNT(*) FROM Comments WHERE post_id = $1;`, [ comment.post_id ]);

        const profile = convertProfile(_profile, relations, badge);
        const post = convertPost(
            _post,
            {
                reposts: parseInt(reposts.count),
                comments: parseInt(comments.count)
            },
            profile
        );

        const data: Comment = convertComment(
            comment, 
            {
                answers: parseInt(answers.count)
            },
            post,
            profile
        )

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

        let author: PartialProfile | null;
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as PartialProfile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }


        let comment: any;
        comment = await db.get('SELECT * FROM Comments WHERE id = $1;', [ id ]);

        if (!comment) {
            res.status(404).json({ message: 'CommentNotFound' });
            return
        }

        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ comment.author_id ]) as PartialProfile;

        if (author.level >= 6 || (profile && comment.author_id == profile.id)) {
            await db.run('DELETE FROM Comments WHERE id = $1;', [ id ]);
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

    res.status(501).json({ message: 'NotImplemented' });
    return

    /*try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: PartialProfile | null;
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as PartialProfile;

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

        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ post.author_id ]) as PartialProfile;

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

            let inbox: Inbox | undefined;
            inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ profile.id ]) as Inbox;

            const new_notif: NotificationPost = {
                id: genChar(12, 'hex').toUpperCase(),
                date: new Date(),
                type: 'like_comment',
                isGroupable: false,
                read: false,
                author: author.id,
                target: post.id,
            }

            inbox.other.unshift(new_notif)        

            await db.run('UPDATE Inbox SET other = $1 WHERE id = $2;', [ inbox.other, profile.id ])
        }

        await db.run('UPDATE Tastes SET likes = $1 WHERE id = $2;', [ tastes.likes, author.id ])
        await db.run('UPDATE Posts SET likes = $1 WHERE id = $2;', [ post.likes, post.id ])

        res.status(200).json({ message: 'Success' })
    } catch(err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }*/
});


router.delete('/:id/like', async (req: Request, res: Response) => {
    const id = req.params.id

    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    res.status(501).json({ message: 'NotImplemented' });
    return

    /*try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: PartialProfile | null;
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as PartialProfile;

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

        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ post.author_id ]) as PartialProfile;

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
    }*/
});


/**********************************/

router.post('/new', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    const content: string = req.body.content
    const visibility: PartialComment['visibility'] = req.body.visibility
    const answers_to: string | null = req.body.answers_to || null
    const post_id: string | null = req.body.post_id || null

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: PartialProfile | null;
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as PartialProfile;

        if (!author) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        const badge: Badge | null = author.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ author.badge ]) as Badge : null;

        const post: PartialPost | undefined = await db.get('SELECT * FROM Posts WHERE id = $1;', [ post_id ]) as PartialPost;
        const post_author: PartialProfile | undefined = post ? await db.get('SELECT * FROM Users WHERE id = $1;', [ post.author_id ]) as PartialProfile : undefined;

        if (!post) {
            console.log(post, post_id)
            res.status(404).json({ message: 'PostNotFound' });
            return
        }

        if (!post_author) {
            res.status(403).json({ message: 'PostIsPrivate' });
            return
        }

        const post_badge: Badge | null = post_author.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ post_author.badge ]) as Badge : null;


        const parent: PartialComment | undefined = answers_to ? await db.get('SELECT * FROM Comments WHERE id = $1;', [ answers_to ]) as PartialComment : undefined;
        const parent_author: PartialProfile | undefined = parent ? await db.get('SELECT * FROM Users WHERE id = $1;', [ parent.author_id ]) as PartialProfile : undefined;

        if (answers_to && !(parent && parent_author)) {
            res.status(404).json({ message: 'PostNotFound' });
            return
        }

        /* Limitations & sécurité */
        if (content.length > 500) {
            res.status(413).json({ message: 'PostTooLong' })
        }

        /* Enregistrement du commentaire */
        let comment: PartialComment = {
            id: genChar(8, 'hex').toUpperCase(),
            author_id: author.id,
            post_id: post.id,
            parent_id: parent?.id || null,
            content: content,
            visibility: visibility,
            creation_date: new Date(),
            update_date: null,
            likes: 0,
            flags: []
        }

        const post_relations: Relations | undefined = await db.get('SELECT * FROM Relations WHERE id = $1;', [ post_author!.id ]) as Relations;
        const is_visible = (field: string) => can_access(field, post_author!, post_relations, session)

        if (!is_visible(post!.visibility)) {
            res.status(403).json({ message: 'PostIsPrivate' });
            return
        }

        try {
            if (answers_to) {
                const parent_relations: Relations | undefined = await db.get('SELECT * FROM Relations WHERE id = $1;', [ parent_author!.id ]) as Relations;
                const is_visible = (field: string) => can_access(field, parent_author!, parent_relations, session)

                if (!is_visible(parent!.visibility)) {
                    res.status(403).json({ message: 'ParentPostIsPrivate' });
                    return
                }

                const parent_inbox: PartialInbox | undefined = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ parent_author!.id ]) as PartialInbox;

                const new_notif: PartialNotificationComment = {
                    id: genChar(12, 'hex').toUpperCase(),
                    date: new Date(),
                    type: 'answer_comment',
                    isGroupable: false,
                    read: false,
                    author: author.id,
                    target: comment!.id,
                    post: post!.id
                }

                parent_inbox.other.unshift(new_notif)

                await db.run('UPDATE Inbox SET other = $1 WHERE id = $2;', [ parent_inbox.other, parent_author!.id ])
            }

            const post_inbox: PartialInbox | undefined = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ post_author!.id ]) as PartialInbox;

            const new_notif: PartialNotificationComment = {
                id: genChar(12, 'hex').toUpperCase(),
                date: new Date(),
                type: 'add_comment',
                isGroupable: false,
                read: false,
                author: author.id,
                target: comment!.id,
                post: post!.id
            }

            post_inbox.other.unshift(new_notif)

            await db.run('UPDATE Inbox SET other = $1 WHERE id = $2;', [ post_inbox.other, post_author!.id ])

            await db.run('INSERT INTO Comments (id, author_id, post_id, parent_id, content, visibility, creation_date, update_date, likes, flags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', Object.values(comment))
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Error'});
            return
        }

        const relations: Relations | undefined = await db.get('SELECT * FROM Relations WHERE id = $1;', [ author.id ]) as Relations;

        const data: Comment = convertComment(
            comment,
            { answers: 0 },
            convertPost(
                post,
                { reposts: 0, comments: 0 },
                convertProfile(post_author, post_relations, post_badge)
            ),
            convertProfile(author, relations, badge)
        )

        res.status(200).json(data)
    } catch(err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;