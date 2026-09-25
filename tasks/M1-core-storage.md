# Milestone 1: AAA Core Architecture & Storage Layer

- **Branch**: `feature/aaa-01-core-storage`
- **Dependencies**: Baseline OpenClaw Gateway
- **Target Completion**: Week 1

## Objective
Establish the foundational data layer and pluggable storage abstractions for the AAA Suite, supporting in-memory zero-config execution for development and distributed Redis for enterprise scale.

## Task Breakdown

### Task AAA-M1-01: Multi-Tenant Database Schema Migrations
- **Inputs**: `backend/migrations/02_request_logs.sql`, `backend/src/db/sqliteAdapter.ts`
- **Outputs**:
  - `backend/migrations/20260925000000_aaa_tenants_and_rbac.sql`
  - `backend/migrations/20260925000100_aaa_hashed_keys_and_policies.sql`
  - `backend/migrations/20260925000200_aaa_audit_and_quotas.sql`
- **Implementation**:
  - Define `tenants`, `tenant_memberships`, `roles`, `permissions`, and `role_permissions`.
  - Extend `gateway_keys` with `key_prefix`, `secret_hash`, `allowed_ips`, `allowed_origins`, `allowed_models`, `max_tokens_ceiling`, `temperature_ceiling`, `rpm_limit`, `tpm_limit`, `max_concurrency`, `expires_at`, `revoked_at`.
  - Add `audit_events` and `tenant_quotas` tables.
- **Acceptance Criteria**:
  - Migrations run idempotently on PostgreSQL and SQLite without data corruption.

### Task AAA-M1-02: Unified Storage Backend Contract (`AAAStorageBackend`)
- **Inputs**: `PROJECT.md § Interface Contracts`
- **Outputs**: `backend/src/aaa/types.ts`, `backend/src/aaa/storage/interface.ts`
- **Implementation**:
  - Declare `AAAStorageBackend` interface with methods: `getHashedKey`, `setHashedKey`, `invalidateHashedKey`, `consumeRateLimit`, `acquireConcurrencySlot`, `releaseConcurrencySlot`, `reserveQuota`, `settleQuota`, `enqueueAuditEvents`, `flushAuditEvents`.
- **Acceptance Criteria**:
  - Interface contracts fully match the architectural specifications.

### Task AAA-M1-03: In-Memory Storage Adapter (`MemoryStorageBackend`)
- **Inputs**: `backend/src/aaa/storage/interface.ts`
- **Outputs**: `backend/src/aaa/storage/memoryStorage.ts`
- **Implementation**:
  - Zero-dependency in-process LRU cache with TTL eviction.
  - Sliding-window rate limiter using rolling timestamp log.
  - Concurrency slot tracker.
  - Quota wallet tracking reserved and available balances.
- **Acceptance Criteria**:
  - Rate limiting correctly throttles when limit is exceeded.
  - Concurrency slot acquisition blocks when max concurrency reached.

### Task AAA-M1-04: Redis Distributed Storage Adapter
- **Inputs**: `backend/src/aaa/storage/interface.ts`
- **Outputs**:
  - `backend/src/aaa/storage/redisStorage.ts`
  - `backend/src/aaa/storage/lua/sliding_window.lua`
  - `backend/src/aaa/storage/lua/quota_reserve.lua`
- **Implementation**:
  - Implement Redis client with automated connection recovery.
  - Implement atomic Lua scripts for sliding-window rate limiting and quota holds.
- **Acceptance Criteria**:
  - Lua scripts execute atomically in Redis without multi-step race conditions.
