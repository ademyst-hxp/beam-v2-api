import { Router } from 'express';

import type { Request, Response } from 'express';

import { db } from '../db/index.js';
import { can_access } from '../utils/functions.js';

import type { Session } from '../db/models/auth.js';
import type { PartialProfile, Settings, Relations } from '../db/models/profiles.js';
import type { PartialPost } from '../db/models/interactions.js';

const router = Router();

router.get('/:id', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let id: string = req.params.id;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let post: PartialPost | undefined;
        post = await db.get('SELECT * FROM Posts WHERE id = $1;', [ id ]) as PartialPost;

        if (!post) {
            res.status(404).json({ message: 'PostNotFound' });
            return
        }

        let profile: PartialProfile | undefined;
        profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ post.author_id ]) as PartialProfile;

        if (!profile) {
            res.status(404).json({ message: 'PostIsPrivate' });
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

        const page = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Publication de ${profile.display_name || profile.name}</title>

            <meta property="og:title" content="Publication de ${profile.display_name || profile.name}">
            <meta property="og:description" content="${post.content || 'Découvrez Beam !'}">
            <meta property="og:image" content="https://api.beam.ejnalo.me/users/${profile.name}/avatar.png">
            <meta property="og:author" content="${profile.name}">
            <meta property="og:color" content="#e021ff">
            <meta property="og:url" content="https://beam.ejnalo.me/post/${post.id}">
            <meta property="og:type" content="article">
        </head>
        <body>
            <script>
                window.location.href = "https://beam.ejnalo.me/post/${post.id}";
            </script>
        </body>`;

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(page);

        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;