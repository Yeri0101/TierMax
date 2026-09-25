-- ==============================================================================
-- OpenClaw Gateway — SQLite Baseline Tables
-- ==============================================================================

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
