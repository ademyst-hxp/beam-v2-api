import { Router } from 'express';
import multer from 'multer';
import { readFile } from 'fs/promises';

import type { Request, Response } from 'express';

import { db, supabase } from '../db/index.js';
import { can_access, genChar } from '../utils/functions.js';

import type { Session } from '../db/models/auth.js';
import type { PartialProfile, Settings, Relations } from '../db/models/profiles.js';
import { File } from '../db/models/drive.js';
import { PartialPost } from '@/db/models/interactions.js';

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

        if (_file.ephemeral) {
            await db.run('DELETE FROM Files WHERE id = $1;', [ _file.id ]);
            await supabase.storage.from('files').remove([ _file.path ]);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

const file_upload = multer({
    dest: ".local/uploads/", // dossier temporaire
    limits: { fileSize: 5 * 1024 * 1024 }, // limite de taille de fichier à 5MB
});

router.post('/upload_attachment', file_upload.single('file'),async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    const file_data = req.file;

    const post_id = req.body.post_id || null;
    const visibility = req.body.visibility || 'everyone';
    const ephemeral = req.body.ephemeral === 'true' || false;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        const file_buffer = await readFile(file_data!.path);

        const file_id = genChar(12, 'hex');

        await db.run('INSERT INTO Files (id, author_id, path, type, visibility, ephemeral, creation_date, update_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT(id) DO UPDATE SET type = $4, update_date = $8;', [
            file_id,
            session.account,
            `/attachments/${session.account}/${file_id}`,
            file_data?.mimetype || 'image/png',
            visibility,
            ephemeral,
            new Date(),
            new Date()
        ]);

        await supabase.storage.from('files').upload(`/attachments/${session.account}/${file_id}`, file_buffer, {
            contentType: file_data?.mimetype || 'image/png',
            upsert: true
        });

        const post: PartialPost = await db.get('SELECT * FROM Posts WHERE id = $1;', [ post_id ]) as PartialPost;

        if (post_id && post) {
            let attachments: string[] = post.attachments || [];
            attachments.push(file_id);

            await db.run('UPDATE Posts SET attachments = $1 WHERE id = $2;', [
                attachments,
                post_id
            ]);
        };

        res.status(200).json({ message: 'Success' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;