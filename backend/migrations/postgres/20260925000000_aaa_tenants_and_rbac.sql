-- ==============================================================================
-- OpenClaw Gateway AAA Suite — Migration 1: Tenants & RBAC
-- Target: PostgreSQL / Supabase
-- ==============================================================================

-- 1. Organizations / Tenants
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    tier TEXT DEFAULT 'standard' NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL,
    default_rpm INTEGER DEFAULT 120,
    default_tpm INTEGER DEFAULT 100000,
    max_concurrency INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed default tenant
INSERT INTO public.tenants (id, name, slug, tier, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default-org', 'enterprise', 'active')
ON CONFLICT (slug) DO NOTHING;

-- Link projects to tenants
ALTER TABLE public.projects 
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

UPDATE public.projects 
SET tenant_id = '00000000-0000-0000-0000-000000000001' 
WHERE tenant_id IS NULL;

-- 2. Tenant Memberships
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'Developer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tenant_id, user_id)
);

-- 3. RBAC Roles
CREATE TABLE IF NOT EXISTS public.roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_builtin BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. RBAC Permissions
CREATE TABLE IF NOT EXISTS public.permissions (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Role-Permission Cross Map
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id TEXT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (role_id, permission_id)
);

-- Seed standard enterprise roles
INSERT INTO public.roles (id, name, description, is_builtin) VALUES
('SuperAdmin', 'Super Administrator', 'Full system and multi-tenant access', true),
('OrgAdmin', 'Organization Administrator', 'Tenant administrator managing users, keys, and budgets', true),
('ProjectAdmin', 'Project Administrator', 'Project manager managing project keys and models', true),
('Developer', 'Developer', 'Data plane API caller and analytics viewer', true),
('Auditor', 'Compliance Auditor', 'Read-only access to audit logs and security policies', true),
('BillingAdmin', 'Billing Administrator', 'Budget and credit management', true)
ON CONFLICT (id) DO NOTHING;

-- Seed core permissions
INSERT INTO public.permissions (id, domain, action, description) VALUES
('llm:chat:invoke', 'llm', 'chat:invoke', 'Execute chat completion and message requests'),
('llm:models:read', 'llm', 'models:read', 'View available AI models and registry'),
('llm:audio:invoke', 'llm', 'audio:invoke', 'Execute speech transcription and synthesis'),
('keys:create', 'keys', 'create', 'Generate new API keys'),
('keys:read', 'keys', 'read', 'List and view API key metadata'),
('keys:revoke', 'keys', 'revoke', 'Revoke active API keys'),
('policies:read', 'policies', 'read', 'View ABAC rules and security policies'),
('policies:write', 'policies', 'write', 'Create and modify ABAC security policies'),
('tenants:read', 'tenants', 'read', 'View organization tenant details'),
('tenants:write', 'tenants', 'write', 'Modify organization tenant settings'),
('audit:read', 'audit', 'read', 'Query security audit logs and compliance records'),
('billing:read', 'billing', 'read', 'Inspect budget spend and balances'),
('billing:write', 'billing', 'write', 'Update budgets and replenish quota balances')
ON CONFLICT (id) DO NOTHING;

-- Seed SuperAdmin wildcard mapping
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'SuperAdmin', id FROM public.permissions
WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = 'SuperAdmin' AND rp.permission_id = permissions.id
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON public.projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_id ON public.tenant_memberships(tenant_id);
