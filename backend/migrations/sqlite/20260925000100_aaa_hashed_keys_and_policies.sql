-- ==============================================================================
-- OpenClaw Gateway AAA Suite — Migration 2: Hashed Keys & ABAC Policies
-- Target: ANSI SQL Compatible (SQLite node:sqlite & PostgreSQL / Supabase)
-- ==============================================================================

-- Baseline prerequisite table guards (for isolated test environments)
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT,
    slug TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS gateway_keys (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    key_name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1. Extend gateway_keys with cryptographic hashing and governance columns (Single-statement additions)
ALTER TABLE gateway_keys ADD COLUMN tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE gateway_keys ADD COLUMN key_prefix TEXT;
ALTER TABLE gateway_keys ADD COLUMN secret_hash TEXT;
ALTER TABLE gateway_keys ADD COLUMN allowed_ips TEXT DEFAULT '[]';
ALTER TABLE gateway_keys ADD COLUMN allowed_origins TEXT DEFAULT '[]';
ALTER TABLE gateway_keys ADD COLUMN allowed_models TEXT DEFAULT '[]';
ALTER TABLE gateway_keys ADD COLUMN max_tokens_ceiling INTEGER;
ALTER TABLE gateway_keys ADD COLUMN temperature_ceiling NUMERIC(3,2);
ALTER TABLE gateway_keys ADD COLUMN rpm_limit INTEGER;
ALTER TABLE gateway_keys ADD COLUMN tpm_limit INTEGER;
ALTER TABLE gateway_keys ADD COLUMN max_concurrency INTEGER;
ALTER TABLE gateway_keys ADD COLUMN expires_at TIMESTAMP;
ALTER TABLE gateway_keys ADD COLUMN revoked_at TIMESTAMP;
ALTER TABLE gateway_keys ADD COLUMN last_used_at TIMESTAMP;

-- Populate default tenant_id for existing gateway keys
UPDATE gateway_keys
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Create indexes for low-latency hot-path prefix & hash lookup
CREATE INDEX IF NOT EXISTS idx_gateway_keys_prefix ON gateway_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_gateway_keys_secret_hash ON gateway_keys(secret_hash);
CREATE INDEX IF NOT EXISTS idx_gateway_keys_tenant_id ON gateway_keys(tenant_id);

-- 2. ABAC Policies Table
CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    effect TEXT NOT NULL DEFAULT 'ALLOW',
    rules_json TEXT NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_policies_tenant_id ON policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_policies_is_active ON policies(is_active);
