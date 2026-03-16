import { Router } from 'express';
import type { Request, Response } from 'express';

import multer from 'multer';
import { readFile } from 'fs/promises';
import sharp from 'sharp';

import { can_access, genChar } from '../utils/functions.js';

import { db, supabase } from '../db/index.js';
import type { Session } from '../db/models/auth.js';
import type { PartialProfile, Settings, Relations } from '../db/models/profiles.js';
import { File } from '../db/models/drive.js';
import { PartialPost } from '../db/models/interactions.js';

const router = Router();

function isValidImage(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) return true;
    // GIF: GIF87a or GIF89a
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38 &&
        (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61) return true;
    // WebP: RIFF????WEBP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
    // BMP: BM
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) return true;
    // TIFF: little-endian (II) or big-endian (MM)
    if ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2A && buffer[3] === 0x00) ||
        (buffer[0] === 0x4D && buffer[1] === 0x4D && buffer[2] === 0x00 && buffer[3] === 0x2A)) return true;

    return false;
}

router.get('/:id', async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    let id: string = req.params.id;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        let _file: File | undefined;
        _file = await db.get('SELECT * FROM Files WHERE id = $1;', [ id ]) as File;

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
            return
        }

        const { data, error } = await supabase.storage
            .from('files')
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

router.post('/upload/attachment', file_upload.single('file'),async (req: Request, res: Response) => {
    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;
    const file_data = req.file;

    const post_id = req.query.post_id || null;
    let visibility = req.query.visibility || 'everyone';
    let ephemeral = req.query.ephemeral || false;

    try {
        let session: Session | undefined = await db.get('SELECT * FROM Sessions WHERE token = $1;', [ token ]) as Session;

        if (!session) {
            res.status(401).json({ message: 'Unauthorized' });
            return
        }

        const post: PartialPost | undefined = await db.get('SELECT * FROM Posts WHERE id = $1;', [ post_id ]) as PartialPost;

        if (post_id) {
            if (!post) {
                res.status(404).json({ message: 'PostNotFound' });
                return
            }

            if (post.author_id !== session.account) {
                res.status(403).json({ message: 'Forbidden' });
                return
            }

            if (post.attachments.length >= 4) {
                res.status(400).json({ message: 'AttachmentLimitReached' });
                return
            }
        }

        // override specified visibility if the file is attached to a post
        visibility = post ? post.visibility : visibility;
        ephemeral = post ? false : ephemeral;


        const file_buffer = await readFile(file_data!.path);

        if (!isValidImage(file_buffer)) {
            res.status(400).json({ message: 'InvalidImageFile' });
            return
        }

        const webp_buffer = await sharp(file_buffer).webp().toBuffer();

        const file_id = genChar(12, 'hex');

        try {
            await supabase.storage.from('files').upload(`/attachments/${session.account.toLowerCase()}/${file_id.toLowerCase()}`, webp_buffer, {
                contentType: 'image/webp',
                upsert: true
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Error uploading file' });
            return
        }

        await db.run('INSERT INTO Files (id, author_id, path, type, visibility, ephemeral, creation_date, update_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT(id) DO UPDATE SET type = $4, update_date = $8;', [
            file_id,
            session.account,
            `/attachments/${session.account.toLowerCase()}/${file_id.toLowerCase()}`,
            'image/webp',
            visibility,
            ephemeral,
            new Date(),
            null
        ]);


        if (post) {
            let attachments: string[] = post.attachments;
            attachments.push(file_id);

            await db.run('UPDATE Posts SET attachments = $1 WHERE id = $2;', [
                attachments,
                post.id
            ]);
        };

        res.status(200).json({ message: 'Success' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error' });
    }
});

export default router;