import { Router } from 'express';

import type { Request, Response } from 'express';

import { db, supabase } from '../db/index.js';
import { can_access } from '../utils/functions.js';
import { convertPost, convertProfile } from '../utils/converters.js';

import type { Session } from '../db/models/auth.js';
import type { PartialProfile, Settings, Relations } from '../db/models/profiles.js';
import type { PartialPost, Post } from '../db/models/interactions.js';
import type { File } from '../db/models/drive.js';
import type { Inbox } from '../db/models/inbox.js';

const router = Router();

router.get('/:name', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as PartialProfile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ profile.id ]) as Relations;

        let settings: Settings | undefined;
        settings = await db.get('SELECT * FROM Settings WHERE id = $1;', [ profile.id ]) as Settings;


        const is_visible = (field: string) => can_access(field, profile, relations, session)

        if (!is_visible(settings.privacy.birthday)) {
            profile.birthday = null;
        }

        if (!is_visible(settings.privacy.status)) {
            profile.status = null;
        }

        if (!is_visible(settings.privacy.profile)) {
            profile.pronouns = null;
        }


        res.status(is_visible(settings.privacy.profile) ? 200 : 206).json(convertProfile(profile, relations));
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/:name/avatar', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let _profile: PartialProfile | undefined;
        _profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as PartialProfile;

        if (!_profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        let _file: File | undefined;
        _file = await db.get('SELECT * FROM Files WHERE id = $1;', [ _profile.id ]) as File;

        if (!_file) {
            _file = {
                id: _profile.id,
                author_id: _profile.id,
                path: '/avatars/DefaultAvatar.png',
                type: 'image/png',
                visibility: 'everyone',
                creation_date: new Date(),
                update_date: null
            }
        }


        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ _profile.id ]) as Relations;

        let settings: Settings | undefined;
        settings = await db.get('SELECT * FROM Settings WHERE id = $1;', [ _profile.id ]) as Settings;


        const is_visible = (field: string) => can_access(field, _profile, relations, session)

        /*if (!is_visible(settings.privacy.profile)) {
            _file = {
                id: _profile.id,
                author_id: _profile.id,
                path: '/avatars/DefaultAvatar.png',
                type: 'image/png',
                visibility: 'everyone',
                creation_date: new Date(),
                update_date: null
            }
        }

        if (!is_visible(_file.visibility)) {
            _file = {
                id: _profile.id,
                author_id: _profile.id,
                path: '/avatars/DefaultAvatar.png',
                type: 'image/png',
                visibility: 'everyone',
                creation_date: new Date(),
                update_date: null
            }
        }*/

        const { data, error } = await supabase.storage
            .from('profiles')
            .download(_file.path)

        if (data) {
            const buffer = Buffer.from(await data!.arrayBuffer());

            res.setHeader('Content-Type', data!.type || 'application/octet-stream');
            res.send(buffer);
        } else {
            console.error(error)
            res.status(404).send({ message: 'Error' })
        }

        
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/:name/posts', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as PartialProfile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ profile.id ]) as Relations;

        let settings: Settings | undefined;
        settings = await db.get('SELECT * FROM Settings WHERE id = $1;', [ profile.id ]) as Settings;

        const is_visible = (field: string) => can_access(field, profile, relations, session)

        if (!is_visible(settings.privacy.birthday)) {
            profile.birthday = null;
        }

        if (!is_visible(settings.privacy.status)) {
            profile.status = null;
        }

        if (!is_visible(settings.privacy.profile)) {
            profile.pronouns = null;
        }



        let posts: any[] | undefined = [];
        let _result: any[] = await db.all('SELECT * FROM Posts WHERE author_id = $1;', [ profile.id ]) as PartialPost[];

        for (const p of _result) {
            const reposts = await db.get(`SELECT COUNT(*) FROM Posts WHERE parent_id = $1;`, [ p.id ]);
            const comments = await db.get(`SELECT COUNT(*) FROM Comments WHERE post_id = $1;`, [ p.id ]);

            let new_p: Post = convertPost(
                p, 
                { reposts: reposts.count, comments: comments.count },
                convertProfile(profile, relations)
            )

            if (is_visible(p.visibility)) {
                posts.push(new_p)
            }
        }

        posts = posts.sort((a, b) => new Date(b.creation_date).getTime() - new Date(a.creation_date).getTime());


        if (is_visible(settings.privacy.profile)) {
            res.status(200).json(posts);
            return
        } else {
            res.status(206).json([]);
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

        let my_relations: Relations | undefined;
        my_relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ author.id ]) as Relations;


        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as PartialProfile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ profile.id ]) as Relations;

        let inbox: Inbox | undefined;
        inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ profile.id ]) as Inbox;

        let settings: Settings | undefined;
        settings = await db.get('SELECT * FROM Settings WHERE id = $1;', [ profile.id ]) as Settings;

        if (relations.blocklist.includes(session.id) || relations.blocklist.includes(session.ip || '')) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }


        const is_visible = (field: string) => can_access(field, profile, relations, session)

        if (relations.followers.includes(author.id)) {
            res.status(204).json({ message: 'NoContent' });
            return
        } else {
            if (is_visible(settings.privacy.profile)) {
                relations.followers.push(author.id);
                await db.run('UPDATE Relations SET followers = $1 WHERE id = $2;', [ relations.followers, profile.id ]);

                my_relations.following.push(profile.id);
                await db.run('UPDATE Relations SET following = $1 WHERE id = $2;', [ my_relations.following, author.id ]);

                res.status(200).json({ message: 'Success' });
                return
            } else {
                inbox.requests.followers.push(author.id);
                await db.run('UPDATE Inbox SET requests = $1 WHERE id = $2;', [ inbox.requests, profile.id ]);

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

        let my_relations: Relations | undefined;
        my_relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ author.id ]) as Relations;



        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as PartialProfile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ profile.id ]) as Relations;



        if (relations.followers.includes(author.id)) {
            let new_followers = relations.followers.filter((id) => id != author.id);
            await db.run('UPDATE Relations SET followers = $1 WHERE id = $2;', [ new_followers, profile.id ]);

            let new_following = my_relations.following.filter((id) => id != profile.id);
            await db.run('UPDATE Relations SET following = $1 WHERE id = $2;', [ new_following, author.id ]);

            res.status(200).json({ message: 'Success' });
            return
        } else {
            console.log(relations.followers, author.id)
            res.status(204).json({ message: 'NoContent' });
            return
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.post('/:name/accept/follow', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

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

        let my_relations: Relations | undefined;
        my_relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ author.id ]) as Relations;

        let my_inbox: Inbox | undefined;
        my_inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ author.id ]) as Inbox;


        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as PartialProfile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ profile.id ]) as Relations;

        let inbox: Inbox | undefined;
        inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ profile.id ]) as Inbox;

        if (relations.blocklist.includes(session.id) || relations.blocklist.includes(session.ip || '')) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }


        if (my_inbox.requests.followers.includes(profile.id)) {
            relations.following.push(author.id);
            await db.run('UPDATE Relations SET followers = $1 WHERE id = $2;', [ relations.followers, profile.id ]);

            my_relations.followers.push(profile.id);
            await db.run('UPDATE Relations SET following = $1 WHERE id = $2;', [ my_relations.following, author.id ]);

            inbox.requests.following = 
                inbox.requests.following.filter(id => (id !== author.id));
            await db.run('UPDATE Inbox SET requests = $1 WHERE id = $2;', [ inbox.requests, profile.id ]);

            my_inbox.requests.followers = 
                my_inbox.requests.followers.filter(id => (id !== profile.id));
            await db.run('UPDATE Inbox SET requests = $1 WHERE id = $2;', [ my_inbox.requests, author.id ]);

            res.status(200).json({ message: 'Success' });
            return
        } else {
            res.status(204).json({ message: 'NoContent' })
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

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ author.id ]) as Relations;


        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as PartialProfile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }


        if (relations.blocklist.includes(profile.id)) {
            res.status(204).json({ message: 'NoContent' });
            return
        } else {
            relations.blocklist.push(profile.id);
            await db.run('UPDATE Relations SET blocklist = $1 WHERE id = $2;', [ relations.blocklist, author.id ]);

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

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ author.id ]) as Relations;

        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as PartialProfile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }


        if (relations.blocklist.includes(profile.id)) {
            let new_blocklist = relations.blocklist.filter((id) => id !== profile.id);
            await db.run('UPDATE Relations SET blocklist = $1 WHERE id = $2;', [ new_blocklist, author.id ]);

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