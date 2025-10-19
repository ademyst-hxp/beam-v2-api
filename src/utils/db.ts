import dotenv from 'dotenv';
dotenv.config({ quiet: true, override: true })

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export const db = await open({
    filename: process.env.DBPATH || '.local/database.db',
    driver: sqlite3.Database
});