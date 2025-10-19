import dotenv from 'dotenv';
dotenv.config({ quiet: true, override: true });

import express from 'express';
import cors from 'cors';

import { db } from './utils/db.js';
import { parse, convert } from './utils/functions.js';
import type { Session } from './models/auth.js';

import authRoute from './routes/auth.js';
import dashboardRoute from './routes/settings.js';
import usersRoute from './routes/profiles.js';


const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use(async (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    let token = req.cookies?.token || req.headers?.authorization?.split(' ')[1] || null;

    if (token) {
        let session: Session | null = parse(await db.get('SELECT * FROM Sessions WHERE token = ?;', [ token ])) as Session;

        if (session) {
            await db.run('UPDATE Sessions SET last_activity = ? WHERE id = ?;', [ new Date().toISOString(), session.id ]);
        } else {
            res.status(401).send({ message: 'InvalidToken' });
            return
        }
    }

    next();
});

app.use('/auth', authRoute);
app.use('/me', dashboardRoute);
app.use('/users', usersRoute);

app.listen(port, () => {
    console.log(`DB: Editing base ${process.env.DBPATH}`);
    console.log(`Server: Listening on port ${port}`);
});