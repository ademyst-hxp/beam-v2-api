import { Router } from 'express';
import type { Request, Response } from 'express';

import { can_access, genChar } from '../utils/functions.js';
import { convertPost, convertProfile } from '../utils/converters.js';

import { db, supabase } from '../db/index.js';
import type { Session } from '../db/models/auth.js';
import type { PartialProfile, Settings, Relations, Profile, Badge } from '../db/models/profiles.js';
import type { PartialPost, Post } from '../db/models/interactions.js';
import type { File } from '../db/models/drive.js';
import type { PartialInbox, PartialNotificationSingle, PartialPendingRequest } from '../db/models/inbox.js';

const router = Router();


router.get('/fetch', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let query: string = req.query.q as string;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let profiles: Profile[] = [];
        let _result: PartialProfile[] = await db.all('SELECT * FROM Users WHERE name ILIKE $1;', [ `%${query}%` ]) as PartialProfile[];

        for (const p of _result) {
            let relations: Relations | undefined;
            relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ p.id ]) as Relations;

            if (!relations.blocklist.includes(session.account) && !relations.blocklist.includes(session.ip || '')) {
                const badge: Badge | null = p.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ p.badge ]) as Badge : null;
                profiles.push(convertProfile(p, relations, badge));
            }
        }

        res.status(200).json(profiles);
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/:name', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | null = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) || null;

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

        const badge: Badge | null = profile.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ profile.badge ]) as Badge : null;

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


        res.status(is_visible(settings.privacy.profile) ? 200 : 206).json(convertProfile(profile, relations, badge));
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/:name/avatar', async (req: Request, res: Response) => {
    res.redirect(`/users/${req.params.name}/avatar.png`)
});

router.get('/:name/avatar.png', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | null = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) || null;

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
                ephemeral: false,
                creation_date: new Date(),
                update_date: null
            }
        }


        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ _profile.id ]) as Relations;

        let settings: Settings | undefined;
        settings = await db.get('SELECT * FROM Settings WHERE id = $1;', [ _profile.id ]) as Settings;


        const is_visible = (field: string) => can_access(field, _profile, relations, session)

        if (!is_visible(settings.privacy.profile)) {
            _file = {
                id: _profile.id,
                author_id: _profile.id,
                path: '/avatars/DefaultAvatar.png',
                type: 'image/png',
                visibility: 'everyone',
                ephemeral: false,
                creation_date: new Date(),
                update_date: null
            }
        }

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

router.get('/:name/following', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: PartialProfile | undefined
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as PartialProfile;

        if (!author) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

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

        if (!is_visible(settings.privacy.profile)) {
            res.status(403).json({ message: 'ProfileIsPrivate' });
            return;
        }

        let new_following: Profile[] = [];

        for (const id of relations.following) {
            const _profile: PartialProfile | undefined = await db.get('SELECT * FROM Users WHERE id = $1;', [ id ]) as PartialProfile;
            const _relations: Relations | undefined = await db.get('SELECT * FROM Relations WHERE id = $1;', [ id ]) as Relations;
            const _badge: Badge | null = _profile.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ _profile.badge ]) as Badge : null;

            const new_p: Profile = convertProfile(_profile, _relations, _badge);

            new_following.push(new_p);
        }

        if (author.level >= 3) {
            res.status(200).json(new_following.filter(u => u.level >= 3));
        } else {
            res.status(200).json([]);
        }

        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});


router.get('/:name/followers', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let name: string = req.params.name;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        let author: PartialProfile | undefined
        author = await db.get('SELECT * FROM Users WHERE id = $1;', [ session.account ]) as PartialProfile;

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

        if (!is_visible(settings.privacy.profile)) {
            res.status(403).json({ message: 'ProfileIsPrivate' });
            return;
        }

        let new_followers: Profile[] = [];

        for (const id of relations.followers) {
            const _profile: PartialProfile | undefined = await db.get('SELECT * FROM Users WHERE id = $1;', [ id ]) as PartialProfile;
            const _relations: Relations | undefined = await db.get('SELECT * FROM Relations WHERE id = $1;', [ id ]) as Relations;
            const _badge: Badge | null = _profile.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ _profile.badge ]) as Badge : null;

            const new_p: Profile = convertProfile(_profile, _relations, _badge);

            new_followers.push(new_p);
        }

        if (author.level >= 3) {
            res.status(200).json(new_followers.filter(u => u.level >= 3));
        } else {
            res.status(200).json([]);
        }
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.get('/:name/posts', async (req: Request, res: Response) => {
    let name: string = req.params.name;
    res.redirect(`/posts/fetch?author=${name}`)
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

        let my_inbox: PartialInbox | undefined;
        my_inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ author.id ]) as PartialInbox;


        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as PartialProfile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ profile.id ]) as Relations;

        let inbox: PartialInbox | undefined;
        inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ profile.id ]) as PartialInbox;

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
            if (is_visible(settings.privacy.profile) && author.level >= 3) {
                relations.followers.push(author.id);
                await db.run('UPDATE Relations SET followers = $1 WHERE id = $2;', [ relations.followers, profile.id ]);

                my_relations.following.push(profile.id);
                await db.run('UPDATE Relations SET following = $1 WHERE id = $2;', [ my_relations.following, author.id ]);

                const new_notif: PartialNotificationSingle = {
                    id: genChar(12, 'hex').toUpperCase(),
                    date: new Date(),
                    type: 'follow',
                    isGroupable: false,
                    read: false,
                    author: author.id,
                }

                inbox.other.unshift(new_notif)

                await db.run('UPDATE Inbox SET other = $1 WHERE id = $2;', [ inbox.other, profile.id ])

                res.status(200).json({ message: 'Success' });
                return
            } else {
                for (const request of inbox.incoming.follow) {
                    if (request.from === author.id) {
                        res.status(204).json({ message: 'NoContent' });
                        return
                    }
                }

                my_inbox.outgoing.follow.push({
                    from: author.id,
                    to: profile.id,
                    date: new Date().toISOString()
                } as PartialPendingRequest);

                await db.run('UPDATE Inbox SET outgoing = $1 WHERE id = $2;', [ my_inbox.outgoing, author.id ]);

                inbox.incoming.follow.push({
                    from: author.id,
                    to: profile.id,
                    date: new Date().toISOString()
                } as PartialPendingRequest);

                await db.run('UPDATE Inbox SET incoming = $1 WHERE id = $2;', [ inbox.incoming, profile.id ]);

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

        let my_inbox: PartialInbox | undefined;
        my_inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ author.id ]) as PartialInbox;


        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as PartialProfile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ profile.id ]) as Relations;

        let inbox: PartialInbox | undefined;
        inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ profile.id ]) as PartialInbox;


        if (relations.followers.includes(author.id)) {
            let new_followers = relations.followers.filter((id) => id != author.id);
            await db.run('UPDATE Relations SET followers = $1 WHERE id = $2;', [ new_followers, profile.id ]);

            let new_following = my_relations.following.filter((id) => id != profile.id);
            await db.run('UPDATE Relations SET following = $1 WHERE id = $2;', [ new_following, author.id ]);

            res.status(200).json({ message: 'Success' });
            return
        } else {
            for (const request of my_inbox.outgoing.follow) {
                if (request.from === author.id) {
                    inbox.incoming.follow = inbox.incoming.follow.filter(_request => (_request.from !== author.id));
                    await db.run('UPDATE Inbox SET incoming = $1 WHERE id = $2;', [ inbox.incoming, profile.id ]);

                    my_inbox.outgoing.follow = my_inbox.outgoing.follow.filter(_request => (_request.to !== profile.id));
                    await db.run('UPDATE Inbox SET outgoing = $1 WHERE id = $2;', [ my_inbox.outgoing, author.id ]);

                    res.status(202).json({ message: 'Success' });
                    return
                }
            }

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

        let my_inbox: PartialInbox | undefined;
        my_inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ author.id ]) as PartialInbox;


        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as PartialProfile;

        if (!profile) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ profile.id ]) as Relations;

        let inbox: PartialInbox | undefined;
        inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ profile.id ]) as PartialInbox;

        if (relations.blocklist.includes(session.id) || relations.blocklist.includes(session.ip || '')) {
            res.status(404).json({ message: 'UserNotFound' });
            return
        }

        for (const request of my_inbox.incoming.follow) {
            if (request.from === profile.id) {
                relations.following.push(author.id);
                await db.run('UPDATE Relations SET following = $1 WHERE id = $2;', [ relations.following, profile.id ]);

                my_relations.followers.push(profile.id);
                await db.run('UPDATE Relations SET followers = $1 WHERE id = $2;', [ my_relations.followers, author.id ]);

                my_inbox.incoming.follow = my_inbox.incoming.follow.filter(_request => (_request.from !== profile.id));
                await db.run('UPDATE Inbox SET incoming = $1 WHERE id = $2;', [ my_inbox.incoming, author.id ]);

                inbox.outgoing.follow = inbox.outgoing.follow.filter(_request => (_request.to !== author.id));
                await db.run('UPDATE Inbox SET outgoing = $1 WHERE id = $2;', [ inbox.outgoing, profile.id ]);

                const new_notif: PartialNotificationSingle = {
                    id: genChar(12, 'hex').toUpperCase(),
                    date: new Date(),
                    type: 'accept_follow',
                    isGroupable: false,
                    read: false,
                    author: author.id,
                }

                inbox.other.unshift(new_notif)

                await db.run('UPDATE Inbox SET other = $1 WHERE id = $2;', [ inbox.other, profile.id ])

                res.status(200).json({ message: 'Success' });
                return
            }
        }

        res.status(204).json({ message: 'NoContent' })
        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

router.post('/:name/reject/follow', async (req: Request, res: Response) => {
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

        let my_inbox: PartialInbox | undefined;
        my_inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ author.id ]) as PartialInbox;


        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE name = $1;', [ name ]) as PartialProfile;

        if (!profile) {
            res.status(204).json({ message: 'NoContent' });
            return
        }

        let inbox: PartialInbox | undefined;
        inbox = await db.get('SELECT * FROM Inbox WHERE id = $1;', [ profile.id ]) as PartialInbox;

        for (const request of my_inbox.incoming.follow) {
            if (request.from === profile.id) {
                my_inbox.incoming.follow = my_inbox.incoming.follow.filter(_request => (_request.from !== profile.id));
                await db.run('UPDATE Inbox SET incoming = $1 WHERE id = $2;', [ my_inbox.incoming, author.id ]);

                inbox.outgoing.follow = inbox.outgoing.follow.filter(_request => (_request.to !== author.id));
                await db.run('UPDATE Inbox SET outgoing = $1 WHERE id = $2;', [ inbox.outgoing, profile.id ]);

                res.status(200).json({ message: 'Success' });
                return
            }
        }

        res.status(204).json({ message: 'NoContent' })
        return
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
