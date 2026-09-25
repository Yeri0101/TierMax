/**
 * OpenClaw Gateway AAA Suite — RBAC Permissions & Role Taxonomy
 */

export const Permissions = {
    // LLM Data Plane
    LLM_CHAT_INVOKE: 'llm:chat:invoke',
    LLM_MODELS_READ: 'llm:models:read',
    LLM_AUDIO_INVOKE: 'llm:audio:invoke',
    LLM_EMBEDDINGS_INVOKE: 'llm:embeddings:invoke',

    // Key Management
    KEYS_CREATE: 'keys:create',
    KEYS_READ: 'keys:read',
    KEYS_REVOKE: 'keys:revoke',

    // Policy & Tenant Admin
    POLICIES_READ: 'policies:read',
    POLICIES_WRITE: 'policies:write',
    TENANTS_READ: 'tenants:read',
    TENANTS_WRITE: 'tenants:write',

    // Accounting & Audit
    AUDIT_READ: 'audit:read',
    BILLING_READ: 'billing:read',
    BILLING_WRITE: 'billing:write'
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions] | '*';

export const RoleHierarchy: Record<string, string[]> = {
    SuperAdmin: ['*'],
    OrgAdmin: [
        'tenants:read',
        'tenants:write',
        'keys:*',
        'policies:*',
        'audit:read',
        'billing:*',
        'llm:*'
    ],
    ProjectAdmin: [
        'keys:*',
        'policies:read',
        'audit:read',
        'billing:read',
        'llm:*'
    ],
    Developer: [
        'llm:chat:invoke',
        'llm:models:read',
        'llm:audio:invoke',
        'llm:embeddings:invoke',
        'keys:read'
    ],
    Auditor: [
        'audit:read',
        'policies:read',
        'tenants:read'
    ],
    BillingAdmin: [
        'billing:read',
        'billing:write',
        'audit:read'
    ]
};

export function hasPermission(userRoles: string[], requiredPermission: string): boolean {
    for (const role of userRoles) {
        const rolePermissions = RoleHierarchy[role] || [];
        for (const p of rolePermissions) {
            if (p === '*' || p === requiredPermission) {
                return true;
            }
            if (p.endsWith(':*')) {
                const prefix = p.slice(0, -2);
                if (requiredPermission.startsWith(prefix)) {
                    return true;
                }
            }
        }
    }
    return false;
}
