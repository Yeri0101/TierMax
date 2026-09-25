-- ==============================================================================
-- OpenClaw Gateway AAA Suite — Migration 3: Audit Ledger & Quota Wallets
-- Target: ANSI SQL Compatible (SQLite node:sqlite & PostgreSQL / Supabase)
-- ==============================================================================

-- Baseline prerequisite table guards (for isolated test environments)
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT,
    slug TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT
);

-- 1. Immutable Audit Events Ledger
CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    client_ip TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    severity TEXT NOT NULL DEFAULT 'INFO',
    metadata TEXT DEFAULT '{}',
    prev_hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for compliance audit queries
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_id ON audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_id ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_severity ON audit_events(severity);

-- 2. Quota & Credit Wallets
CREATE TABLE IF NOT EXISTS tenant_wallets (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    balance_usd NUMERIC(12,6) NOT NULL DEFAULT 100.000000,
    reserved_usd NUMERIC(12,6) NOT NULL DEFAULT 0.000000,
    monthly_token_quota BIGINT DEFAULT 10000000,
    tokens_used_current_cycle BIGINT DEFAULT 0,
    cycle_reset_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(tenant_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_wallets_tenant_project ON tenant_wallets(tenant_id, project_id);
