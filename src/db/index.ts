import dotenv from 'dotenv';
dotenv.config({ quiet: true, override: true })

import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';

const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION || undefined;

const poolConfig: PoolConfig = connectionString ? { connectionString } : {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER || process.env.USER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'postgres',
};

if (process.env.NODE_ENV === 'production' && poolConfig.connectionString) {
    (poolConfig as any).ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

export const query = async <T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> => {
    return pool.query<T>(text, params);
};

export const run = async (text: string, params?: any[]) => {
    const res = await pool.query(text, params);
    return {
        lastID: (res.rows && res.rows[0] && (res.rows[0].id ?? res.rows[0].lastval)) || undefined,
        changes: res.rowCount,
    } as const;
};

export const get = async <T extends QueryResultRow = any>(text: string, params?: any[]): Promise<T | undefined> => {
    const res = await pool.query<T>(text, params);
    return res.rows[0];
};

export const all = async <T extends QueryResultRow = any>(text: string, params?: any[]): Promise<T[]> => {
    const res = await pool.query<T>(text, params);
    return res.rows;
};

export const exec = async (text: string) => {
    return pool.query(text);
};

export const db = {
    pool,
    query,
    run,
    get,
    all,
    exec,
};

export default db;

/**** Supabase Client ****/
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_KEY || ''
)