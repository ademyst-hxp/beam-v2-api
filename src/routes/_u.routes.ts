import { Router } from 'express';

import type { Request, Response } from 'express';

import { db } from '../db/index.js';
import { can_access } from '../utils/functions.js';

import type { Session } from '../db/models/auth.js';
import type { PartialProfile, Settings, Relations } from '../db/models/profiles.js';

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

        const page = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${profile.display_name || profile.name} sur Beam</title>

            <meta property="og:title" content="${profile.display_name || profile.name} sur Beam">
            <meta property="og:description" content="${profile.description || 'Beam Profile'}">
            <meta property="og:image" content="https://api.beam.ejnalo.me/users/${profile.name}/avatar.png">
            <meta property="og:author" content="${profile.name}">
            <meta property="og:color" content="#e021ff">
            <meta property="og:url" content="https://beam.ejnalo.me/@${profile.name}">
            <meta property="og:type" content="profile">
        </head>
        <body>
            <script>
                window.location.href = "https://beam.ejnalo.me/@${profile.name}";
            </script>
        </body>`;

        res.setHeader('Content-Type', 'text/html');
        res.status(is_visible(settings.privacy.profile) ? 200 : 206).send(page);

        return
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;