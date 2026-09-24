/**
 * TierMax — Database Synchronization & Migration Utility
 *
 * Allows users to:
 * 1. Pull / clone their existing projects, keys, and configurations from Supabase into Local SQLite.
 * 2. Export / backup local SQLite data to JSON.
 * 3. Inspect database status and record counts.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { initSQLiteDatabase } from '../db/sqliteAdapter';

dotenv.config({ override: true });

async function pullFromSupabase() {
    const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
    const supabaseKey = (process.env.SUPABASE_ANON_KEY || '').trim();

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY are required in .env to pull data.');
        process.exit(1);
    }

    console.log(`[DBSync] Connecting to Supabase: ${supabaseUrl}...`);
    const supabase = createClient(supabaseUrl, supabaseKey);

    const dbPath = path.resolve(process.cwd(), 'data', 'tiermax.db');
    const local = initSQLiteDatabase(dbPath);

    console.log(`[DBSync] Pulling data into Local SQLite (${dbPath})...`);

    // 1. Projects
    const { data: projects, error: pErr } = await supabase.from('projects').select('*');
    if (pErr) console.warn('[DBSync] Failed to fetch projects from Supabase:', pErr.message);
    else if (projects && projects.length > 0) {
        for (const p of projects) {
            local.db.prepare(`
                INSERT INTO projects (id, name, color, budget_usd, budget_alert_threshold_pct, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    color = excluded.color,
                    budget_usd = excluded.budget_usd,
                    budget_alert_threshold_pct = excluded.budget_alert_threshold_pct
            `).run(p.id, p.name, p.color || null, p.budget_usd || null, p.budget_alert_threshold_pct || 80, p.created_at || new Date().toISOString());
        }
        console.log(`  ✓ Synced ${projects.length} project(s)`);
    }

    // 2. Upstream Keys
    const { data: upstreamKeys, error: uErr } = await supabase.from('upstream_keys').select('*');
    if (uErr) console.warn('[DBSync] Failed to fetch upstream_keys:', uErr.message);
    else if (upstreamKeys && upstreamKeys.length > 0) {
        for (const k of upstreamKeys) {
            local.db.prepare(`
                INSERT INTO upstream_keys (
                    id, project_id, provider, key_name, api_key, base_url, models, custom_models,
                    is_active, billing_type, max_context_tokens, max_output_tokens, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    project_id = excluded.project_id,
                    provider = excluded.provider,
                    key_name = excluded.key_name,
                    api_key = excluded.api_key,
                    base_url = excluded.base_url,
                    models = excluded.models,
                    custom_models = excluded.custom_models,
                    is_active = excluded.is_active,
                    billing_type = excluded.billing_type,
                    max_context_tokens = excluded.max_context_tokens,
                    max_output_tokens = excluded.max_output_tokens
            `).run(
                k.id, k.project_id, k.provider, k.key_name || null, k.api_key, k.base_url || null,
                typeof k.models === 'object' ? JSON.stringify(k.models) : (k.models || null),
                typeof k.custom_models === 'object' ? JSON.stringify(k.custom_models) : (k.custom_models || null),
                k.is_active === false ? 0 : 1, k.billing_type || 'free',
                k.max_context_tokens || null, k.max_output_tokens || null,
                k.created_at || new Date().toISOString()
            );
        }
        console.log(`  ✓ Synced ${upstreamKeys.length} upstream provider key(s)`);
    }

    // 3. Gateway Keys
    const { data: gatewayKeys, error: gErr } = await supabase.from('gateway_keys').select('*');
    if (gErr) console.warn('[DBSync] Failed to fetch gateway_keys:', gErr.message);
    else if (gatewayKeys && gatewayKeys.length > 0) {
        for (const gk of gatewayKeys) {
            local.db.prepare(`
                INSERT INTO gateway_keys (id, project_id, key_name, api_key, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    project_id = excluded.project_id,
                    key_name = excluded.key_name,
                    api_key = excluded.api_key
            `).run(gk.id, gk.project_id, gk.key_name, gk.api_key, gk.created_at || new Date().toISOString());
        }
        console.log(`  ✓ Synced ${gatewayKeys.length} gateway key(s)`);
    }

    // 4. Gateway Key Models
    const { data: models, error: mErr } = await supabase.from('gateway_key_models').select('*');
    if (mErr) console.warn('[DBSync] Failed to fetch gateway_key_models:', mErr.message);
    else if (models && models.length > 0) {
        for (const m of models) {
            local.db.prepare(`
                INSERT INTO gateway_key_models (id, gateway_key_id, upstream_key_id, model_name, upstream_model_name, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    gateway_key_id = excluded.gateway_key_id,
                    upstream_key_id = excluded.upstream_key_id,
                    model_name = excluded.model_name,
                    upstream_model_name = excluded.upstream_model_name
            `).run(m.id, m.gateway_key_id, m.upstream_key_id, m.model_name, m.upstream_model_name || null, m.created_at || new Date().toISOString());
        }
        console.log(`  ✓ Synced ${models.length} gateway model routing rule(s)`);
    }

    // 5. Model Pricing
    const { data: pricing, error: prErr } = await supabase.from('model_pricing').select('*');
    if (prErr) console.warn('[DBSync] Failed to fetch model_pricing:', prErr.message);
    else if (pricing && pricing.length > 0) {
        for (const pr of pricing) {
            local.db.prepare(`
                INSERT INTO model_pricing (id, provider, model_name, input_price_per_1m, output_price_per_1m, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(provider, model_name) DO UPDATE SET
                    input_price_per_1m = excluded.input_price_per_1m,
                    output_price_per_1m = excluded.output_price_per_1m,
                    is_active = excluded.is_active
            `).run(
                pr.id, pr.provider || '*', pr.model_name, pr.input_price_per_1m || 0, pr.output_price_per_1m || 0,
                pr.is_active === false ? 0 : 1, pr.created_at || new Date().toISOString(), pr.updated_at || new Date().toISOString()
            );
        }
        console.log(`  ✓ Synced ${pricing.length} custom model pricing rule(s)`);
    }

    console.log(`\n🎉 Synchronization complete! You can now run TierMax completely offline with:`);
    console.log(`   export DB_TYPE=sqlite`);
    console.log(`   npm run dev\n`);
}

const command = process.argv[2] || 'pull';
if (command === 'pull') {
    pullFromSupabase().catch(err => {
        console.error('Fatal error during sync:', err);
        process.exit(1);
    });
} else {
    console.log(`Usage: npx tsx src/utils/dbSync.ts pull`);
}
