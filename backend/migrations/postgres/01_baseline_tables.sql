-- ==============================================================================
-- OpenClaw Gateway — PostgreSQL / Supabase Baseline Tables
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT,
    budget_usd NUMERIC(10,2) DEFAULT NULL,
    budget_alert_threshold_pct NUMERIC(5,2) DEFAULT 80.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.upstream_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    key_name TEXT,
    api_key TEXT NOT NULL,
    base_url TEXT,
    models TEXT,
    custom_models TEXT,
    is_active BOOLEAN DEFAULT true,
    billing_type TEXT DEFAULT 'free',
    max_context_tokens INTEGER,
    max_output_tokens INTEGER,
    rpm_limit INTEGER,
    tpm_limit INTEGER,
    rpd_limit INTEGER,
    tpd_limit INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.gateway_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    key_name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.gateway_key_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_key_id UUID REFERENCES public.gateway_keys(id) ON DELETE CASCADE,
    upstream_key_id UUID REFERENCES public.upstream_keys(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    upstream_model_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.model_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT '*',
    model_name TEXT NOT NULL,
    input_price_per_1m NUMERIC(10,6) NOT NULL DEFAULT 0,
    output_price_per_1m NUMERIC(10,6) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(provider, model_name)
);

CREATE TABLE IF NOT EXISTS public.batch_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    gateway_key_id UUID,
    type TEXT DEFAULT 'batch',
    status TEXT DEFAULT 'pending',
    openai_batch_id TEXT,
    payload TEXT,
    result TEXT,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
