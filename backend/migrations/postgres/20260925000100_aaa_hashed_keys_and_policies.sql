-- ==============================================================================
-- OpenClaw Gateway AAA Suite — Migration 2: Hashed Keys & ABAC Policies
-- Target: PostgreSQL / Supabase
-- ==============================================================================

-- 1. Extend gateway_keys with cryptographic hashing and governance columns
ALTER TABLE public.gateway_keys
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS key_prefix TEXT,
    ADD COLUMN IF NOT EXISTS secret_hash TEXT,
    ADD COLUMN IF NOT EXISTS allowed_ips TEXT DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS allowed_origins TEXT DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS allowed_models TEXT DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS max_tokens_ceiling INTEGER,
    ADD COLUMN IF NOT EXISTS temperature_ceiling NUMERIC(3,2),
    ADD COLUMN IF NOT EXISTS rpm_limit INTEGER,
    ADD COLUMN IF NOT EXISTS tpm_limit INTEGER,
    ADD COLUMN IF NOT EXISTS max_concurrency INTEGER,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE;

-- Populate default tenant_id for existing gateway keys
UPDATE public.gateway_keys
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Create indexes for low-latency hot-path prefix & hash lookup
CREATE INDEX IF NOT EXISTS idx_gateway_keys_prefix ON public.gateway_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_gateway_keys_secret_hash ON public.gateway_keys(secret_hash);
CREATE INDEX IF NOT EXISTS idx_gateway_keys_tenant_id ON public.gateway_keys(tenant_id);

-- 2. ABAC Policies Table
CREATE TABLE IF NOT EXISTS public.policies (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    effect TEXT NOT NULL DEFAULT 'ALLOW',
    rules_json TEXT NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_policies_tenant_id ON public.policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_policies_is_active ON public.policies(is_active);
