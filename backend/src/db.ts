import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { initSQLiteDatabase } from './db/sqliteAdapter';

dotenv.config({ override: true });

export type DatabaseType = 'sqlite' | 'supabase';

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_ANON_KEY || '').trim();
const requestedDbType = (process.env.DB_TYPE || '').toLowerCase().trim();

let activeClient: any = null;
let activeDbType: DatabaseType = 'sqlite';

const wantsSupabase = requestedDbType === 'supabase' || (
    !requestedDbType &&
    supabaseUrl.length > 0 &&
    supabaseKey.length > 0 &&
    requestedDbType !== 'sqlite' &&
    requestedDbType !== 'local'
);

if (wantsSupabase && supabaseUrl && supabaseKey) {
    try {
        console.log(`[TierMax DB] Connecting to Supabase Cloud (${supabaseUrl.slice(0, 30)}...)`);
        activeClient = createClient(supabaseUrl, supabaseKey);
        activeDbType = 'supabase';
    } catch (err: any) {
        console.warn(`[TierMax DB] Supabase initialization failed (${err.message}). Falling back to Local SQLite.`);
        const sqlite = initSQLiteDatabase();
        activeClient = sqlite;
        activeDbType = 'sqlite';
    }
} else {
    console.log(`[TierMax DB] Operating in Local Zero-Config Mode (SQLite)`);
    const sqlite = initSQLiteDatabase();
    activeClient = sqlite;
    activeDbType = 'sqlite';
}

export const supabase: any = activeClient;
export const dbType = activeDbType;
export const isLocalDb = activeDbType === 'sqlite';
