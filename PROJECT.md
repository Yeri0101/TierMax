# Project: OpenClaw Gateway AAA Suite

## Executive Summary
The OpenClaw Gateway AAA Suite provides an enterprise-grade Authentication (AuthN), Authorization (AuthZ), and Accounting/Auditing (AuthA) platform built directly into OpenClaw Gateway (TierMax v3.0). It elevates the gateway from a prototype single-admin, plaintext-key reverse proxy to a multi-tenant, SOC 2 / ISO 27001 / HIPAA compliant AI gateway supporting hashed API keys, OIDC/OAuth2 federation, mTLS, RBAC/ABAC policy evaluation, sliding-window consumer rate limiting, atomic token quota reservations, immutable audit logging, and pluggable SIEM export pipelines.

---

## Architecture

### System Topology & Core Boundaries
OpenClaw Gateway operates across two architectural planes:
1. **Control / Management Plane (`/api/*`, `/api/aaa/*`)**:
   - Administrative operations, tenant provisioning, credential management, policy administration, and audit event inspection.
   - Guarded by multi-tenant RBAC (`SuperAdmin`, `OrgAdmin`, `ProjectAdmin`, `Developer`, `Auditor`) and session/OIDC tokens.
2. **Data / AI Gateway Plane (`/v1/*`, `/messages`)**:
   - High-throughput LLM proxy supporting OpenAI Chat Completions, Anthropic Messages API, Whisper audio, TTS, embeddings, and Brave search.
   - Low-latency hot-path execution pipeline featuring mTLS extraction, SHA-256 hashed API key verification, ABAC policy enforcement, consumer rate limiting, pre-flight token quota reservations, streaming SSE usage settlement, and asynchronous audit event emission.

### Request Pipeline Flow
```
                           Incoming HTTP Request
                                     │
                                     ▼
                 ┌───────────────────────────────────────┐
                 │        1. Global Infrastructure       │
                 │   - CORS & Request Logging            │
                 │   - Security Headers (HSTS, CSP)      │
                 └───────────────────┬───────────────────┘
                                     │
                                     ▼
                 ┌───────────────────────────────────────┐
                 │        2. mTLS Extraction             │
                 │   - Socket Cert / Ingress Header      │
                 │   - SAN/CN Fingerprint Validation     │
                 └───────────────────┬───────────────────┘
                                     │
                                     ▼
                 ┌───────────────────────────────────────┐
                 │        3. Unified AuthN               │
                 │   - Hashed API Key (sha256 cache)     │
                 │   - Bearer OIDC JWT / JWKS Verifier   │
                 │   - Injects AuthContext into c.set()  │
                 └───────────────────┬───────────────────┘
                                     │
                                     ▼
                 ┌───────────────────────────────────────┐
                 │        4. Tenant Context & Isolation  │
                 │   - Org / Workspace Validation        │
                 │   - Strict Tenant Boundary Check      │
                 └───────────────────┬───────────────────┘
                                     │
                                     ▼
                 ┌───────────────────────────────────────┐
                 │        5. AuthZ Policy Engine         │
                 │   - RBAC Scope Matcher                │
                 │   - ABAC Rules (IP CIDR, Time, Model) │
                 │   - Parameter Clamps (max_tokens)     │
                 │   - Audit Event on 403 REJECT         │
                 └───────────────────┬───────────────────┘
                                     │
                                     ▼
                 ┌───────────────────────────────────────┐
                 │        6. Consumer Rate Limiting      │
                 │   - Sliding Window (RPM, TPM, RPS)    │
                 │   - In-Flight Concurrency Tracker     │
                 │   - Standard RFC 6585 Headers         │
                 │   - Audit Event on 429 REJECT         │
                 └───────────────────┬───────────────────┘
                                     │
                                     ▼
                 ┌───────────────────────────────────────┐
                 │        7. Quota Reservation           │
                 │   - Atomic Pre-Flight Balance Reserve │
                 │   - Reject 402 if Wallet Overdrawn    │
                 └───────────────────┬───────────────────┘
                                     │
                                     ▼
                 ┌───────────────────────────────────────┐
                 │        8. Core Gateway Dispatch       │
                 │   - Smart Router & Virtual Consensus  │
                 │   - Semantic Cache & Context Pruner   │
                 │   - Upstream LLM Provider Fetch       │
                 └───────────────────┬───────────────────┘
                                     │
                                     ▼
                 ┌───────────────────────────────────────┐
                 │        9. Streaming SSE Wrap & Settle │
                 │   - Track SSE Tokens in Real-Time     │
                 │   - Settle Actual Tokens vs Reserved  │
                 │   - Insert request_logs record        │
                 └───────────────────┬───────────────────┘
                                     │
                                     ▼
                 ┌───────────────────────────────────────┐
                 │       10. Audit Ledger & SIEM Export  │
                 │   - Append to immutable audit_events  │
                 │   - Async Dispatch (Syslog, OTel,     │
                 │     Webhook Exporters)                │
                 └───────────────────────────────────────┘
```

### Storage Architecture (`AAAStorageBackend`)
Supports pluggable storage backends without code divergence:
- **Memory (`MemoryStorageBackend`)**: Zero-dependency LRU cache and in-process sliding logs for local development and unit tests.
- **Redis (`RedisStorageBackend`)**: Distributed high-throughput adapter using atomic Lua scripts for sliding-window rate limiting, concurrency tracking, and quota reservations.
- **SQL (`SQLStorageBackend`)**: Dual-engine persistence compatible with embedded SQLite (`node:sqlite`) and cloud Supabase/PostgreSQL.

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Baseline Hono Gateway Core | Modular HTTP gateway with `/v1/*` routing and `/api/*` management | Baseline | Survey (Existing) |
| 2 | Dual-Engine Database Adapter | SQLite (`DatabaseSync`) and Supabase PostgreSQL persistence | Baseline | Survey (Existing) |
| 3 | OpenAI & Anthropic Protocol Proxies | Compatibility layer for `/v1/chat/completions` and `/v1/messages` | Baseline | Survey (Existing) |
| 4 | Virtual Consensus Fusion Engine | 3-draft multi-model consensus and arbiter synthesis | Baseline | Survey (Existing) |
| 5 | Atlas Smart Router & System 1 Jev | Zero-latency 3-tier routing and decision engine integration | Baseline | Survey (Existing) |
| 6 | Free-Tier Guardian & Circuit Breakers | Upstream rate limit tracking and 60s failure quarantine | Baseline | Survey (Existing) |
| 7 | Semantic Cache & Context Pruner | In-memory SHA-256 prompt cache and history token compressor | Baseline | Survey (Existing) |
| 8 | Multi-Modal & MCP Proxies | Whisper audio, TTS, embeddings, and Brave search MCP | Baseline | Survey (Existing) |
| 9 | Request Logging & Model Pricing | Granular request logging and LiteLLM pricing catalog sync | Baseline | Survey (Existing) |
| 10 | Unified AAA Storage Contract | `AAAStorageBackend` interface for caching, rate limiting, and quotas | M1 | Architecture Spec |
| 11 | In-Memory Storage Adapter | Zero-config LRU cache, sliding-window log, and memory quota wallet | M1 | Architecture Spec |
| 12 | Redis Distributed Storage Adapter | Atomic Lua scripts for sliding window rate limiting and quota holds | M1 | Architecture Spec |
| 13 | Multi-Tenant Database Schema | Schema migrations for tenants, projects, roles, and hashed keys | M1 | Architecture Spec |
| 14 | Secure Hashed API Key Manager | SHA-256 hashed keys (`oc_<env>_<id>_<secret>`) with zero plaintext storage | M2 | Architecture Spec |
| 15 | Plaintext Key In-Place Migration | Seamless migration utility migrating existing plaintext keys | M2 | Architecture Spec |
| 16 | Federated OIDC / OAuth2 Verifier | Dynamic JWKS discovery, RS256/ES256 verification, and claims parsing | M2 | Architecture Spec |
| 17 | Mutual TLS (mTLS) Extractor | Socket client certificate and reverse-proxy header parsing (`XFCC`) | M2 | Architecture Spec |
| 18 | Unified AuthN Middleware | Hono middleware binding verified `AuthContext` to request lifecycle | M2 | Architecture Spec |
| 19 | Granular RBAC Engine | Built-in roles (`SuperAdmin`, `OrgAdmin`, `ProjectAdmin`, `Developer`, `Auditor`) | M3 | Architecture Spec |
| 20 | Contextual ABAC Policy Engine | Rule evaluator checking IP CIDR, time windows, and model permissions | M3 | Architecture Spec |
| 21 | Model Governance & Parameter Clamps | Hard ceilings on `max_tokens`, `temperature`, and provider isolation | M3 | Architecture Spec |
| 22 | Unified AuthZ Middleware | Declarative route protection middleware for data and control planes | M3 | Architecture Spec |
| 23 | Consumer Rate Limiter | Downstream sliding window RPM, TPM, RPS, and concurrency rate limiting | M4 | Architecture Spec |
| 24 | RFC 6585 Rate Limit Headers | Standard `RateLimit-Limit`, `RateLimit-Remaining`, `Retry-After` headers | M4 | Architecture Spec |
| 25 | Atomic Token Quota Manager | Pre-flight balance reservation and post-response token settlement | M4 | Architecture Spec |
| 26 | Streaming SSE Usage Settlement Hook | Chunk-level token tracking and balance reconciliation on stream end | M4 | Architecture Spec |
| 27 | Immutable Security Audit Ledger | CloudEvents/RFC 5424 `audit_events` schema with SHA-256 hash chaining | M5 | Architecture Spec |
| 28 | Asynchronous Audit Buffer Queue | Zero-latency in-memory batching buffer with backpressure protection | M5 | Architecture Spec |
| 29 | RFC 5424 Syslog Exporter | Audit log exporter supporting Syslog over TLS, TCP, and UDP | M5 | Architecture Spec |
| 30 | OpenTelemetry (OTel) Exporter | OTLP structured log exporter for enterprise observability | M5 | Architecture Spec |
| 31 | Signed Webhook SIEM Exporter | HMAC-SHA256 signed HTTP POST webhook dispatcher with exponential backoff | M5 | Architecture Spec |
| 32 | AAA Administrative REST APIs | Endpoints for managing tenants, API keys, roles, and querying audit logs | M6 | Architecture Spec |
| 33 | Frontend Control Panel AAA Views | Tenant switcher, key rotation wizard, and audit trail viewer | M6 | Architecture Spec |
| 34 | Automated AAA Test Suite | End-to-end integration tests for AuthN, AuthZ, Rate Limiting, and Auditing | M6 | Architecture Spec |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | AAA Core Architecture & Storage Layer | `AAAStorageBackend` interface, Memory & Redis adapters, Lua scripts, and database schema migrations (`tenants`, `roles`, `permissions`, `audit_events`) | Baseline | PLANNED |
| M2 | Enterprise Authentication (AuthN) Suite | Hashed API key manager, plaintext migration utility, OIDC/JWT validator with JWKS discovery, mTLS certificate extractor, and unified `authnMiddleware` | M1 | PLANNED |
| M3 | Dynamic Authorization (AuthZ) & Governance | Granular RBAC taxonomy, ABAC dynamic policy engine, model governance parameter clamps, and unified `authzMiddleware` | M2 | PLANNED |
| M4 | Consumer Accounting & Rate Limiting (AuthA Part 1) | Downstream RPM/TPM sliding-window rate limiter, RFC 6585 headers, atomic quota reservation wallet, and streaming SSE settlement hook | M1, M2 | PLANNED |
| M5 | Immutable Audit Ledger & SIEM Export (AuthA Part 2) | CloudEvents `audit_events` schema, cryptographic hash chaining, in-memory async buffer, Syslog RFC 5424, OTel, and Webhook exporters | M1, M3 | PLANNED |
| M6 | Admin Management APIs, UI & Integration Suite | `/api/aaa/*` management REST APIs, frontend tenant/key/audit UI components, and automated E2E integration test suite | M1-M5 | PLANNED |

---

## Interface Contracts

### 1. Storage Backend Contract (`backend/src/aaa/storage/interface.ts`)
```typescript
export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetSeconds: number;
    retryAfterSeconds?: number;
}

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
}

export interface AAAStorageBackend {
    readonly name: 'memory' | 'redis' | 'sql' | 'hybrid';
    init(): Promise<void>;
    close(): Promise<void>;

    // Key lookup & cache
    getHashedKey(keyPrefix: string): Promise<HashedKeyData | null>;
    setHashedKey(keyPrefix: string, data: HashedKeyData, ttlSeconds: number): Promise<void>;
    invalidateHashedKey(keyPrefix: string): Promise<void>;

    // Consumer Rate Limiting (Sliding Window)
    consumeRateLimit(
        scopeKey: string,
        cost: number,
        windowSeconds: number,
        maxLimit: number
    ): Promise<RateLimitResult>;

    // Concurrency Tracking
    acquireConcurrencySlot(scopeKey: string, maxConcurrent: number): Promise<boolean>;
    releaseConcurrencySlot(scopeKey: string): Promise<void>;

    // Quota Reservation & Settlement
    reserveQuota(tenantId: string, projectId: string, amountUsd: number): Promise<boolean>;
    settleQuota(tenantId: string, projectId: string, actualCostUsd: number, reservedUsd: number): Promise<void>;

    // Audit Event Queue
    enqueueAuditEvents(events: AuditEvent[]): Promise<void>;
    flushAuditEvents(): Promise<AuditEvent[]>;
}
```

### 2. Unified Auth Context (`backend/src/aaa/types.ts`)
```typescript
export interface AuthIdentity {
    type: 'api_key' | 'oidc_user' | 'mtls_cert' | 'admin_session';
    id: string;
    name: string;
    tenantId: string;
    projectId?: string;
    roles: string[];
    permissions: string[];
    metadata?: Record<string, unknown>;
}

export interface AuthContext {
    identity: AuthIdentity;
    clientIp: string;
    userAgent: string;
    credentialId: string;
    mTLSCertificate?: {
        fingerprint: string;
        subjectCN: string;
        subjectSAN: string;
    };
}
```

### 3. Authorization Decision (`backend/src/aaa/authz/policyEngine.ts`)
```typescript
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
```

### 4. Audit Event Contract (`backend/src/aaa/types.ts`)
```typescript
export interface AuditEvent {
    id: string;                 // UUIDv7 time-sortable
    timestamp: string;          // ISO-8601 UTC
    tenantId: string;
    actor: {
        type: 'user' | 'api_key' | 'service_account' | 'system';
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
    status: 'SUCCESS' | 'DENIED' | 'ERROR';
    severity: 'INFO' | 'WARNING' | 'ALERT' | 'CRITICAL';
    metadata?: Record<string, unknown>;
    prevHash?: string;          // Cryptographic blockchain-style tamper pointer
}
```

---

## Code Layout

```
openclaw-gateway-main/
├── backend/
│   ├── migrations/
│   │   ├── 20260925000000_aaa_tenants_and_rbac.sql
│   │   ├── 20260925000100_aaa_hashed_keys_and_policies.sql
│   │   └── 20260925000200_aaa_audit_and_quotas.sql
│   └── src/
│       ├── aaa/
│       │   ├── index.ts                      # Top-level AAA initialization & singleton registry
│       │   ├── types.ts                      # Common AAA types (Identities, Policies, Events)
│       │   ├── config.ts                     # AAA configuration schema & validator
│       │   │
│       │   ├── storage/                      # Pluggable Storage Abstraction
│       │   │   ├── interface.ts              # AAAStorageBackend contract
│       │   │   ├── memoryStorage.ts          # Zero-config LRU & sliding log adapter
│       │   │   ├── redisStorage.ts           # Distributed Redis adapter
│       │   │   ├── sqlStorage.ts             # SQLite & PostgreSQL adapter
│       │   │   └── lua/                      # Optimized Redis scripts
│       │   │       ├── sliding_window.lua
│       │   │       └── quota_reserve.lua
│       │   │
│       │   ├── authn/                        # Authentication Module
│       │   │   ├── keyManager.ts             # SHA-256 hashed API key engine
│       │   │   ├── keyMigration.ts           # Migration utility for existing plaintext keys
│       │   │   ├── oidcValidator.ts          # OIDC/OAuth2 JWKS token validator
│       │   │   ├── mtlsExtractor.ts          # mTLS socket & reverse proxy parser
│       │   │   └── authnMiddleware.ts        # Hono AuthN middleware
│       │   │
│       │   ├── authz/                        # Authorization Module
│       │   │   ├── permissions.ts            # RBAC permissions & role matrix
│       │   │   ├── policyEngine.ts           # ABAC conditions & rule evaluator
│       │   │   ├── modelGovernance.ts        # Model access & parameter clamps
│       │   │   └── authzMiddleware.ts        # Hono AuthZ middleware
│       │   │
│       │   ├── autha/                        # Accounting & Auditing Module
│       │   │   ├── consumerRateLimiter.ts    # Downstream RPM/TPM sliding window limiter
│       │   │   ├── quotaManager.ts           # Atomic pre-flight reservation & wallet
│       │   │   ├── auditLogger.ts            # Immutable audit event ledger & buffer
│       │   │   └── exporters/                # Pluggable SIEM Exporters
│       │   │       ├── syslogExporter.ts     # RFC 5424 Syslog (TLS/TCP/UDP)
│       │   │       ├── otlpExporter.ts       # OpenTelemetry structured exporter
│       │   │       └── webhookExporter.ts    # Signed HMAC webhook dispatcher
│       │   │
│       │   └── routes/                       # Management REST Endpoints
│       │       ├── tenants.ts                # Tenant provisioning API
│       │       ├── keys.ts                   # Hashed key administration API
│       │       ├── policies.ts               # Policy rule management API
│       │       └── audit.ts                  # Audit log query & export API
│       │
│       ├── middleware/                       # Core Gateway Middlewares
│       │   ├── auth.ts                       # Legacy admin auth adapter
│       │   └── gatewayAuth.ts                # Migrated to use AAA AuthN pipeline
│       └── routes/
│           ├── v1.ts                         # Instrumented with AAA rate limiting & quota hooks
│           └── ...
├── frontend/
│   └── src/
│       ├── components/aaa/                   # AAA UI widgets (TenantSwitcher, KeyWizard, etc.)
│       └── pages/
│           ├── AuditLogs.tsx                 # Audit trail compliance viewer
│           └── TenantSettings.tsx            # Organization & tenant settings
└── tests/
    └── e2e/aaa/                              # AAA Integration & E2E Test Suite
        ├── authn.test.ts                     # API key hashing, OIDC, and mTLS tests
        ├── authz.test.ts                     # RBAC & ABAC policy evaluation tests
        ├── ratelimit.test.ts                 # RPM/TPM & concurrency ceiling tests
        └── audit.test.ts                     # Audit log immutability & SIEM tests
```
