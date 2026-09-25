/**
 * OpenClaw Gateway AAA Suite — Core Type Definitions
 * Contracts for Authentication (AuthN), Authorization (AuthZ),
 * Accounting & Rate Limiting (AuthA), and Storage.
 */

// -----------------------------------------------------------------------------
// 1. Identity & Context Contracts
// -----------------------------------------------------------------------------

export type IdentityType = 'api_key' | 'oidc_user' | 'mtls_cert' | 'admin_session';

export interface AuthIdentity {
    type: IdentityType;
    id: string;
    name: string;
    tenantId: string;
    projectId?: string;
    roles: string[];
    permissions: string[];
    metadata?: Record<string, unknown>;
}

export interface MTLSCertificateInfo {
    fingerprint: string;
    subjectCN: string;
    subjectSAN: string;
}

export interface AuthContext {
    identity: AuthIdentity;
    clientIp: string;
    userAgent: string;
    credentialId: string;
    mTLSCertificate?: MTLSCertificateInfo;
}

// -----------------------------------------------------------------------------
// 2. Storage & API Key Contracts
// -----------------------------------------------------------------------------

export interface HashedKeyData {
    id: string;
    tenantId: string;
    projectId: string;
    name: string;
    keyPrefix: string;
    secretHash: string;
    allowedIps?: string[];
    allowedOrigins?: string[];
    allowedModels?: string[];
    maxTokensCeiling?: number;
    temperatureCeiling?: number;
    rpmLimit?: number;
    tpmLimit?: number;
    maxConcurrency?: number;
    expiresAt?: string | null;
    revokedAt?: string | null;
    lastUsedAt?: string | null;
    createdAt?: string;
}

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetSeconds: number;
    retryAfterSeconds?: number;
}

export interface QuotaReservation {
    tenantId: string;
    projectId: string;
    reservedUsd: number;
    createdAt: number;
    expiresAt: number;
}

// -----------------------------------------------------------------------------
// 3. Authorization & Policy Contracts
// -----------------------------------------------------------------------------

export interface PolicyEvaluationRequest {
    identity: AuthIdentity;
    action: string;             // e.g. 'llm:chat:invoke', 'keys:create'
    resource: {
        type: string;           // e.g. 'model', 'gateway_key', 'tenant'
        id: string;             // e.g. 'gpt-4o', 'gk_live_123'
        metadata?: Record<string, unknown>;
    };
    environment: {
        clientIp: string;
        timestamp: string;
        requestedTokens?: number;
        temperature?: number;
    };
}

export interface PolicyDecision {
    allowed: boolean;
    reason?: string;
    clampedParameters?: {
        maxTokens?: number;
        temperature?: number;
    };
}

export interface PolicyRule {
    id: string;
    description?: string;
    effect: 'ALLOW' | 'DENY';
    subjects?: {
        roles?: string[];
        tenants?: string[];
        identities?: string[];
    };
    resources?: {
        models?: string[];
        types?: string[];
        tiers?: string[];
    };
    actions?: string[];
    conditions?: {
        ipCidr?: string[];
        timeOfDayUtc?: { start: string; end: string };
        maxTokensCeiling?: number;
        temperatureCeiling?: number;
    };
}

// -----------------------------------------------------------------------------
// 4. Accounting & Audit Ledger Contracts
// -----------------------------------------------------------------------------

export type AuditSeverity = 'INFO' | 'WARNING' | 'ALERT' | 'CRITICAL';
export type AuditStatus = 'SUCCESS' | 'DENIED' | 'ERROR';
export type ActorType = 'user' | 'api_key' | 'service_account' | 'system';

export interface AuditEvent {
    id: string;                 // UUIDv7 time-sortable
    timestamp: string;          // ISO-8601 UTC
    tenantId: string;
    actor: {
        type: ActorType;
        id: string;
        name: string;
    };
    action: string;             // e.g. 'KEY_CREATED', 'POLICY_DENIED', 'AUTH_FAILED'
    resource: {
        type: string;
        id: string;
    };
    clientInfo: {
        ip: string;
        userAgent: string;
    };
    status: AuditStatus;
    severity: AuditSeverity;
    metadata?: Record<string, unknown>;
    prevHash?: string;          // Cryptographic blockchain-style tamper pointer
}
