-- ==============================================================================
-- OpenClaw Gateway AAA Suite — Migration 1: Tenants & RBAC
-- Target: ANSI SQL Compatible (SQLite node:sqlite & PostgreSQL / Supabase)
-- ==============================================================================

-- Baseline prerequisite table guard (for isolated test environments)
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1. Organizations / Tenants
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    tier TEXT DEFAULT 'standard' NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL,
    default_rpm INTEGER DEFAULT 120,
    default_tpm INTEGER DEFAULT 100000,
    max_concurrency INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Seed default tenant
INSERT INTO tenants (id, name, slug, tier, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default-org', 'enterprise', 'active')
ON CONFLICT (slug) DO NOTHING;

-- Link projects to tenants
ALTER TABLE projects 
    ADD COLUMN tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL;

UPDATE projects 
SET tenant_id = '00000000-0000-0000-0000-000000000001' 
WHERE tenant_id IS NULL;

-- 2. Tenant Memberships
CREATE TABLE IF NOT EXISTS tenant_memberships (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Developer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(tenant_id, user_id)
);

-- 3. RBAC Roles
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_builtin BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. RBAC Permissions
CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 5. Role-Permission Cross Map
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (role_id, permission_id)
);

-- Seed standard enterprise roles
INSERT INTO roles (id, name, description, is_builtin) VALUES
('SuperAdmin', 'Super Administrator', 'Full system and multi-tenant access', 1),
('OrgAdmin', 'Organization Administrator', 'Tenant administrator managing users, keys, and budgets', 1),
('ProjectAdmin', 'Project Administrator', 'Project manager managing project keys and models', 1),
('Developer', 'Developer', 'Data plane API caller and analytics viewer', 1),
('Auditor', 'Compliance Auditor', 'Read-only access to audit logs and security policies', 1),
('BillingAdmin', 'Billing Administrator', 'Budget and credit management', 1)
ON CONFLICT (id) DO NOTHING;

-- Seed core permissions
INSERT INTO permissions (id, domain, action, description) VALUES
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

-- Seed SuperAdmin wildcard mapping (100% ANSI idempotent subquery)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'SuperAdmin', id FROM permissions
WHERE NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = 'SuperAdmin' AND rp.permission_id = permissions.id
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_id ON tenant_memberships(tenant_id);
