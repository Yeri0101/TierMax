-- ==============================================================================
-- OpenClaw Gateway AAA Suite — Migration 3: Audit Ledger & Quota Wallets
-- Target: PostgreSQL / Supabase
-- ==============================================================================

-- 1. Immutable Audit Events Ledger
CREATE TABLE IF NOT EXISTS public.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for compliance audit queries
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_id ON public.audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON public.audit_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON public.audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_id ON public.audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_severity ON public.audit_events(severity);

-- 2. Quota & Credit Wallets
CREATE TABLE IF NOT EXISTS public.tenant_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    balance_usd NUMERIC(12,6) NOT NULL DEFAULT 100.000000,
    reserved_usd NUMERIC(12,6) NOT NULL DEFAULT 0.000000,
    monthly_token_quota BIGINT DEFAULT 10000000,
    tokens_used_current_cycle BIGINT DEFAULT 0,
    cycle_reset_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tenant_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_wallets_tenant_project ON public.tenant_wallets(tenant_id, project_id);
