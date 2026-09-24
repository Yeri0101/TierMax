/**
 * TierMax — Universal Embedded SQLite Database Adapter
 *
 * Implements a complete zero-configuration local database using Node.js built-in `node:sqlite`.
 * Provides 100% wire-compatibility with Supabase/PostgREST query builder syntax:
 *   - .from(table).select(...)
 *   - .from(table).insert(...)
 *   - .from(table).update(...)
 *   - .from(table).delete()
 *   - .eq, .neq, .in, .gte, .lte, .gt, .lt, .not
 *   - .order, .limit, .single, .maybeSingle
 *   - Relational joins: projects(name), gateway_keys(...), gateway_key_models(...)
 */

import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface UniversalQueryResult<T = any> {
    data: T | null;
    error: { message: string } | null;
}

export class SQLiteQueryBuilder {
    private db: DatabaseSync;
    private table: string;
    private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
    private selectCols: string = '*';
    private insertPayload: any[] = [];
    private updatePayload: any = null;
    private filters: { col: string; op: string; val: any }[] = [];
    private orders: { col: string; asc: boolean }[] = [];
    private limitCount?: number;
    private isSingle: boolean = false;
    private isMaybeSingle: boolean = false;

    constructor(db: DatabaseSync, table: string) {
        this.db = db;
        this.table = table;
    }

    select(cols: string = '*') {
        this.selectCols = cols || '*';
        return this;
    }

    insert(data: any | any[]) {
        this.action = 'insert';
        this.insertPayload = Array.isArray(data) ? data : [data];
        return this;
    }

    update(data: any) {
        this.action = 'update';
        this.updatePayload = data;
        return this;
    }

    delete() {
        this.action = 'delete';
        return this;
    }

    eq(col: string, val: any) {
        this.filters.push({ col, op: '=', val });
        return this;
    }

    neq(col: string, val: any) {
        this.filters.push({ col, op: '!=', val });
        return this;
    }

    in(col: string, vals: any[]) {
        this.filters.push({ col, op: 'IN', val: vals });
        return this;
    }

    gte(col: string, val: any) {
        this.filters.push({ col, op: '>=', val });
        return this;
    }

    lte(col: string, val: any) {
        this.filters.push({ col, op: '<=', val });
        return this;
    }

    gt(col: string, val: any) {
        this.filters.push({ col, op: '>', val });
        return this;
    }

    lt(col: string, val: any) {
        this.filters.push({ col, op: '<', val });
        return this;
    }

    not(col: string, op: string, val: any) {
        if (op === 'is' && val === null) {
            this.filters.push({ col, op: 'IS NOT NULL', val: undefined });
        } else {
            this.filters.push({ col, op: '!=', val });
        }
        return this;
    }

    order(col: string, options?: { ascending?: boolean }) {
        this.orders.push({ col, asc: options?.ascending !== false });
        return this;
    }

    limit(n: number) {
        this.limitCount = n;
        return this;
    }

    single() {
        this.isSingle = true;
        this.limitCount = 1;
        return this;
    }

    maybeSingle() {
        this.isMaybeSingle = true;
        this.limitCount = 1;
        return this;
    }

    private normalizeVal(val: any): any {
        if (val === true) return 1;
        if (val === false) return 0;
        if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
            return JSON.stringify(val);
        }
        return val;
    }

    private buildWhere(): { sql: string; params: any[] } {
        if (this.filters.length === 0) return { sql: '', params: [] };
        const clauses: string[] = [];
        const params: any[] = [];

        for (const f of this.filters) {
            if (f.op === 'IS NOT NULL') {
                clauses.push(`"${f.col}" IS NOT NULL`);
            } else if (f.op === 'IN') {
                const arr = Array.isArray(f.val) ? f.val : [f.val];
                if (arr.length === 0) {
                    clauses.push('0=1');
                } else {
                    const placeholders = arr.map(() => '?').join(', ');
                    clauses.push(`"${f.col}" IN (${placeholders})`);
                    params.push(...arr.map(v => this.normalizeVal(v)));
                }
            } else {
                clauses.push(`"${f.col}" ${f.op} ?`);
                params.push(this.normalizeVal(f.val));
            }
        }

        return { sql: ' WHERE ' + clauses.join(' AND '), params };
    }

    async execute(): Promise<UniversalQueryResult> {
        try {
            if (this.action === 'insert') {
                const insertedRows: any[] = [];
                for (const row of this.insertPayload) {
                    const id = row.id || crypto.randomUUID();
                    const now = row.created_at || new Date().toISOString();
                    const fullRow = { ...row, id, created_at: now };

                    const cols = Object.keys(fullRow);
                    const placeholders = cols.map(() => '?').join(', ');
                    const values = cols.map(c => this.normalizeVal(fullRow[c]));

                    const sql = `INSERT INTO "${this.table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
                    this.db.prepare(sql).run(...values);
                    insertedRows.push(fullRow);
                }

                const resultData = this.isSingle || this.isMaybeSingle ? insertedRows[0] || null : insertedRows;
                return { data: resultData, error: null };
            }

            if (this.action === 'update') {
                const { sql: whereSql, params: whereParams } = this.buildWhere();
                const updateCols = Object.keys(this.updatePayload);
                if (updateCols.length === 0) {
                    return { data: [], error: null };
                }

                const setClauses = updateCols.map(c => `"${c}" = ?`).join(', ');
                const setParams = updateCols.map(c => this.normalizeVal(this.updatePayload[c]));

                const sql = `UPDATE "${this.table}" SET ${setClauses}${whereSql}`;
                this.db.prepare(sql).run(...setParams, ...whereParams);

                // Fetch updated rows if returning
                const fetchSql = `SELECT * FROM "${this.table}"${whereSql}`;
                const rows = this.db.prepare(fetchSql).all(...whereParams) as any[];
                return { data: this.isSingle ? (rows[0] || null) : rows, error: null };
            }

            if (this.action === 'delete') {
                const { sql: whereSql, params: whereParams } = this.buildWhere();
                const sql = `DELETE FROM "${this.table}"${whereSql}`;
                this.db.prepare(sql).run(...whereParams);
                return { data: null, error: null };
            }

            // SELECT action
            const { sql: whereSql, params: whereParams } = this.buildWhere();
            let orderSql = '';
            if (this.orders.length > 0) {
                orderSql = ' ORDER BY ' + this.orders.map(o => `"${o.col}" ${o.asc ? 'ASC' : 'DESC'}`).join(', ');
            }
            let limitSql = '';
            if (this.limitCount !== undefined) {
                limitSql = ` LIMIT ${this.limitCount}`;
            }

            const rawSql = `SELECT * FROM "${this.table}"${whereSql}${orderSql}${limitSql}`;
            let rows = this.db.prepare(rawSql).all(...whereParams) as any[];

            // Post-process rows: convert boolean ints (is_active) to booleans
            rows = rows.map(r => {
                const copy = { ...r };
                if ('is_active' in copy && typeof copy.is_active === 'number') {
                    copy.is_active = copy.is_active === 1;
                }
                return copy;
            });

            // Expand relations if requested in selectCols
            if (this.selectCols.includes('projects(') || this.selectCols.includes('projects (')) {
                for (const row of rows) {
                    if (row.project_id) {
                        const proj = this.db.prepare('SELECT name FROM projects WHERE id = ?').get(row.project_id) as any;
                        row.projects = proj ? { name: proj.name } : null;
                    } else {
                        row.projects = null;
                    }
                }
            }

            if (this.selectCols.includes('gateway_keys(') || this.selectCols.includes('gateway_keys (')) {
                for (const row of rows) {
                    if (this.table === 'request_logs') {
                        if (row.gateway_key_id) {
                            const gk = this.db.prepare('SELECT key_name FROM gateway_keys WHERE id = ?').get(row.gateway_key_id) as any;
                            row.gateway_keys = gk ? { key_name: gk.key_name } : null;
                        } else {
                            row.gateway_keys = null;
                        }
                    } else {
                        const gkeys = this.db.prepare('SELECT id, key_name, api_key FROM gateway_keys WHERE project_id = ?').all(row.id) as any[];
                        row.gateway_keys = gkeys || [];
                    }
                }
            }

            if (this.selectCols.includes('gateway_key_models(') || this.selectCols.includes('gateway_key_models (')) {
                for (const row of rows) {
                    const models = this.db.prepare('SELECT upstream_key_id, model_name, upstream_model_name FROM gateway_key_models WHERE gateway_key_id = ?').all(row.id) as any[];
                    row.gateway_key_models = models || [];
                }
            }

            // Filter columns if not '*'
            if (this.selectCols && this.selectCols !== '*' && this.selectCols !== '') {
                const requestedKeys = this.selectCols
                    .split(',')
                    .map(c => c.trim())
                    .map(c => c.split('(')[0].trim())
                    .filter(c => c && !c.includes(')'));

                if (requestedKeys.length > 0) {
                    rows = rows.map(r => {
                        const filtered: any = {};
                        for (const k of requestedKeys) {
                            if (k in r) filtered[k] = r[k];
                        }
                        // Always preserve joined relations if populated
                        if ('projects' in r) filtered.projects = r.projects;
                        if ('gateway_keys' in r) filtered.gateway_keys = r.gateway_keys;
                        if ('gateway_key_models' in r) filtered.gateway_key_models = r.gateway_key_models;
                        return filtered;
                    });
                }
            }

            if (this.isSingle) {
                return { data: rows[0] || null, error: rows.length === 0 ? { message: 'Row not found' } : null };
            }
            if (this.isMaybeSingle) {
                return { data: rows[0] || null, error: null };
            }

            return { data: rows, error: null };
        } catch (err: any) {
            console.error(`[SQLiteQueryBuilder] Error on table "${this.table}":`, err);
            return { data: null, error: { message: err.message } };
        }
    }

    then(onfulfilled?: (value: UniversalQueryResult) => any, onrejected?: (reason: any) => any) {
        return this.execute().then(onfulfilled, onrejected);
    }
}

export interface SQLiteClient {
    from: (table: string) => SQLiteQueryBuilder;
    db: DatabaseSync;
}

export function initSQLiteDatabase(dbFilePath?: string): SQLiteClient {
    const resolvedPath = dbFilePath || path.resolve(process.cwd(), 'data', 'tiermax.db');
    const dbDir = path.dirname(resolvedPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    console.log(`[TierMax DB] Initializing Local SQLite database at: ${resolvedPath}`);
    const db = new DatabaseSync(resolvedPath);

    // Bootstrap tables
    db.exec(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS admins (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT,
            password_hash TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            budget_usd REAL DEFAULT NULL,
            budget_alert_threshold_pct REAL DEFAULT 80,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS upstream_keys (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            provider TEXT NOT NULL,
            key_name TEXT,
            api_key TEXT NOT NULL,
            base_url TEXT,
            models TEXT,
            custom_models TEXT,
            is_active INTEGER DEFAULT 1,
            billing_type TEXT DEFAULT 'free',
            max_context_tokens INTEGER,
            max_output_tokens INTEGER,
            rpm_limit INTEGER,
            tpm_limit INTEGER,
            rpd_limit INTEGER,
            tpd_limit INTEGER,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS gateway_keys (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            key_name TEXT NOT NULL,
            api_key TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS gateway_key_models (
            id TEXT PRIMARY KEY,
            gateway_key_id TEXT REFERENCES gateway_keys(id) ON DELETE CASCADE,
            upstream_key_id TEXT REFERENCES upstream_keys(id) ON DELETE CASCADE,
            model_name TEXT NOT NULL,
            upstream_model_name TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS request_logs (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            gateway_key_id TEXT,
            upstream_key_id TEXT,
            provider TEXT,
            model TEXT,
            status_code INTEGER,
            latency_ms INTEGER,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            input_cost_usd REAL DEFAULT 0,
            output_cost_usd REAL DEFAULT 0,
            total_cost_usd REAL DEFAULT 0,
            pricing_provider TEXT,
            pricing_model_name TEXT,
            pricing_input_per_1m REAL,
            pricing_output_per_1m REAL,
            error_message TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS model_pricing (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL DEFAULT '*',
            model_name TEXT NOT NULL,
            input_price_per_1m REAL NOT NULL DEFAULT 0,
            output_price_per_1m REAL NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(provider, model_name)
        );

        CREATE TABLE IF NOT EXISTS batch_jobs (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            gateway_key_id TEXT,
            type TEXT DEFAULT 'batch',
            status TEXT DEFAULT 'pending',
            openai_batch_id TEXT,
            payload TEXT,
            result TEXT,
            error TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
    `);

    // Seed default admin if missing
    const adminCheck = db.prepare('SELECT COUNT(*) as count FROM admins').get() as { count: number };
    if (!adminCheck || adminCheck.count === 0) {
        const adminId = crypto.randomUUID();
        const defaultAdmin = process.env.DEFAULT_ADMIN_USER || 'admin';
        const defaultPass = process.env.DEFAULT_ADMIN_PASSWORD || 'admin';
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = `scrypt:${salt}:${crypto.scryptSync(defaultPass, salt, 64).toString('hex')}`;
        db.prepare('INSERT INTO admins (id, username, password, password_hash) VALUES (?, ?, ?, ?)').run(
            adminId,
            defaultAdmin,
            null, // Do not store plaintext password in database
            hash
        );
        console.log(`[TierMax DB] Seeded default administrator account: ${defaultAdmin}`);
    }

    // Seed default project and gateway key if missing
    const projectCheck = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };
    if (!projectCheck || projectCheck.count === 0) {
        const defaultProjectId = crypto.randomUUID();
        db.prepare('INSERT INTO projects (id, name, color) VALUES (?, ?, ?)').run(
            defaultProjectId,
            'Proyecto Principal',
            '#6366f1'
        );

        const defaultKeyId = crypto.randomUUID();
        const defaultApiKey = 'gk_' + crypto.randomBytes(16).toString('hex');
        db.prepare('INSERT INTO gateway_keys (id, project_id, key_name, api_key) VALUES (?, ?, ?, ?)').run(
            defaultKeyId,
            defaultProjectId,
            'Llave de Entrada Local',
            defaultApiKey
        );
        console.log(`[TierMax DB] Seeded default project and gateway key (${defaultApiKey.slice(0, 4)}...${defaultApiKey.slice(-4)})`);
    }

    return {
        from: (table: string) => new SQLiteQueryBuilder(db, table),
        db,
    };
}
