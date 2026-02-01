import dotenv from 'dotenv';
dotenv.config({ quiet: true, override: true });

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { db } from './db/index.js';
import { parse } from './utils/functions.js';
import type { Session } from './db/models/auth.js';

import authRoute from './routes/auth.routes.js';
import dashboardRoute from './routes/dashboard.routes.js';
import leaderboardRoute from './routes/leaderboard.routes.js';
import usersRoute from './routes/profiles.routes.js';
import shortUserRoute from './routes/_u.routes.js';
import shortPostRoute from './routes/_p.routes.js';
import postsRoute from './routes/posts.routes.js';
import driveRoute from './routes/drive.routes.js';
import modRoute from './routes/mod.routes.js';
import commentsRoute from './routes/comments.routes.js';

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://beam.ejnalo.me',
        'https://www.beam.ejnalo.me',
        'https://dev.beam.ejnalo.me'
    ],
    credentials: true
}));

app.use(cookieParser());
app.use(express.json());

app.use(async (req, res, next) => {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    if (token) {
        let session: Session | null = parse(await db.get('SELECT * FROM Sessions WHERE token = $1', [ token ])) as Session;

        if (session) {
            await db.run('UPDATE Sessions SET last_activity = $1 WHERE id = $2', [ new Date().toISOString(), session.id ]);
        } else {
            res.clearCookie('token');
        }
    }

    next();

    res.on('finish', () => console.log(req.method, req.path, "-", res.statusCode))
});

app.use('/auth', authRoute);
app.use('/me', dashboardRoute);
app.use('/users', usersRoute);
app.use('/top', leaderboardRoute);
app.use('/posts', postsRoute);
app.use('/comments', commentsRoute);
app.use('/u', shortUserRoute);
app.use('/p', shortPostRoute);
app.use('/drive', driveRoute);
app.use('/mod', modRoute);

app.listen(port, () => {
    console.log(`DB: Connected to ${process.env.PGHOST}:${process.env.PGPORT} as ${process.env.PGUSER}`);
    console.log(`Server: Listening on port ${port}`);
});