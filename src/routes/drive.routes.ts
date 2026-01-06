import { Router } from 'express';

import type { Request, Response } from 'express';

import { db, supabase } from '../db/index.js';
import { can_access } from '../utils/functions.js';

import type { Session } from '../db/models/auth.js';
import type { PartialProfile, Settings, Relations } from '../db/models/profiles.js';
import { File } from '../db/models/drive.js';

const router = Router();

router.get('/:id', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let id: string = req.params.id;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let _file: File | undefined;
        _file = await db.get('SELECT * FROM Files WHERE name = $1;', [ id ]) as File;

        if (!_file) {
            res.status(404).json({ message: 'FileNotFound' });
            return
        }

        let _profile: PartialProfile | undefined;
        _profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ _file.author_id ]) as PartialProfile;

        if (!_profile) {
            res.status(403).json({ message: 'FileIsPrivate' });
            return
        }

        let relations: Relations | undefined;
        relations = await db.get('SELECT * FROM Relations WHERE id = $1;', [ _profile.id ]) as Relations;

        let settings: Settings | undefined;
        settings = await db.get('SELECT * FROM Settings WHERE id = $1;', [ _profile.id ]) as Settings;


        const is_visible = (field: string) => can_access(field, _profile, relations, session)

        if (!is_visible(_file.visibility)) {
            res.status(403).send({ message: 'FileIsPrivate'})
        }

        const { data, error } = await supabase.storage
            .from('profiles')
            .download(_file.path)

        const buffer = Buffer.from(await data!.arrayBuffer());

        res.setHeader('Content-Type', data!.type || 'application/octet-stream');
        res.send(buffer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;