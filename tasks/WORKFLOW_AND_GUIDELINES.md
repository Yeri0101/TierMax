# OpenClaw Gateway AAA Suite — Developer Workflow & Engineering Guidelines

This document specifies the engineering workflow, branch lifecycle, merge order, quality standards, and verification checklists for developing the OpenClaw Gateway AAA Suite.

---

## 1. Branch Strategy & Merge Sequence

The AAA Suite is partitioned into 6 sequential feature branches to prevent merge conflicts and enable modular testing:

```
[clean-main / main]
         │
         ▼
[feature/aaa-01-core-storage] ────────► Milestone 1: Storage Layer & DB Migrations
         │ (Merge to main)
         ▼
[feature/aaa-02-authn-keys-oidc-mtls] ─► Milestone 2: Enterprise Authentication (AuthN)
         │ (Merge to main)
         ▼
[feature/aaa-03-authz-rbac-abac-routes] ► Milestone 3: Dynamic Authorization (AuthZ)
         │ (Merge to main)
         ▼
[feature/aaa-04-autha-metering-ratelimit] Milestone 4: Accounting & Rate Limiting (Part 1)
         │ (Merge to main)
         ▼
[feature/aaa-05-autha-audit-siem] ─────► Milestone 5: Immutable Audit & SIEM (Part 2)
         │ (Merge to main)
         ▼
[feature/aaa-06-admin-api-ui] ─────────► Milestone 6: Admin APIs, UI & Integration Tests
```

### Strict Merge Order

1. **`feature/aaa-01-core-storage`**: Foundation containing `AAAStorageBackend` contracts, Memory and Redis adapters, Lua scripts, and database migration SQL. Must be merged first.
2. **`feature/aaa-02-authn-keys-oidc-mtls`**: Key manager, hashing, OIDC, mTLS, and `authnMiddleware`. Depends on M1 storage contracts.
3. **`feature/aaa-03-authz-rbac-abac-routes`**: RBAC permissions taxonomy, ABAC policy engine, parameter clamps, and `authzMiddleware`. Depends on M2 identities.
4. **`feature/aaa-04-autha-metering-ratelimit`**: Downstream sliding window rate limiter, RFC 6585 headers, atomic quota wallet, and streaming SSE hook. Depends on M1 and M2.
5. **`feature/aaa-05-autha-audit-siem`**: CloudEvents schema, immutable audit ledger, async queue, and Syslog/OTel/Webhook exporters. Depends on M1 and M3.
6. **`feature/aaa-06-admin-api-ui`**: Administrative REST endpoints (`/api/aaa/*`), Frontend UI views (TenantSwitcher, KeyWizard, AuditLogs), and E2E integration test suite. Depends on M1–M5.

---

## 2. Developer Workflow

### Branch Management via Script

Use `./scripts/scaffold-aaa-branches.sh` to manage branches:

```bash
# Check status of all feature branches
./scripts/scaffold-aaa-branches.sh list

# Switch to milestone branch (by number 1-6 or branch name)
./scripts/scaffold-aaa-branches.sh switch 1
# or
./scripts/scaffold-aaa-branches.sh switch feature/aaa-01-core-storage

# Verify all branches exist
./scripts/scaffold-aaa-branches.sh verify
```

### Pre-Commit Checklist

Before opening a PR or committing code on any feature branch:

1. **Type Checking & Build**:
   ```bash
   npm run build --prefix backend
   ```
   Must compile cleanly with 0 errors and zero warnings under strict TypeScript settings.

2. **Frontend Build Check** (if touching UI):
   ```bash
   npm run build --prefix frontend
   ```

3. **Database Compatibility**:
   - Verify that all new migrations run against both SQLite (`node:sqlite`) and PostgreSQL/Supabase.
   - Never use engine-specific syntax without compatibility fallbacks.

4. **Backward Compatibility**:
   - Zero breaking changes to existing `/v1/chat/completions` or `/v1/messages` APIs.
   - Plaintext keys must continue working via migration utility until transition period ends.

---

## 3. Coding Standards & Conventions

- **Module Isolation**: All AAA logic lives under `backend/src/aaa/`.
- **Zero Plaintext Secrets**: Keys must always be hashed with SHA-256 (`crypto.createHash('sha256')`). Constant-time comparison (`crypto.timingSafeEqual`) must be used for all hash verifications.
- **Pluggable Storage**: Never couple gateway routing directly to Redis or SQLite; always route stateful operations through `AAAStorageBackend`.
- **Zero Unhandled Rejections**: Always handle stream disconnects and asynchronous logger emissions gracefully.
- **Fail Closed for Security**: If an authorization policy evaluation errors or is indeterminate, reject with HTTP 403.
