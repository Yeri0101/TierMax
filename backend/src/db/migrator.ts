import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class DatabaseMigrator {
    private db: DatabaseSync;
    private migrationsDir: string;

    constructor(db: DatabaseSync, migrationsDir?: string) {
        this.db = db;
        this.migrationsDir = migrationsDir || path.resolve(__dirname, '../../migrations/sqlite');
    }

    public init(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }

    public applyPending(): string[] {
        this.init();
        const applied = new Set(
            this.db.prepare('SELECT version FROM schema_migrations').all().map((r: any) => r.version)
        );

        const files = fs.readdirSync(this.migrationsDir)
            .filter(f => f.endsWith('.sql') && !f.startsWith('.'))
            .sort();

        const newlyApplied: string[] = [];

        for (const file of files) {
            if (applied.has(file)) continue;

            const filePath = path.join(this.migrationsDir, file);
            const sql = fs.readFileSync(filePath, 'utf8');

            console.log(`[TierMax Migrator] Applying migration: ${file}...`);
            this.db.exec('BEGIN TRANSACTION;');
            try {
                this.db.exec(sql);
                this.db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
                this.db.exec('COMMIT;');
                newlyApplied.push(file);
                console.log(`[TierMax Migrator] Successfully applied: ${file}`);
            } catch (err) {
                this.db.exec('ROLLBACK;');
                throw new Error(`Failed applying migration ${file}: ${(err as Error).message}`);
            }
        }

        return newlyApplied;
    }
}
