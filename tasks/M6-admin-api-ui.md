# Milestone 6: Admin Management APIs, UI & Integration Suite

- **Branch**: `feature/aaa-06-admin-api-ui`
- **Dependencies**: Milestones 1 through 5
- **Target Completion**: Week 6

## Objective
Implement administrative REST endpoints (`/api/aaa/*`), frontend management components (tenant switcher, key rotation wizard, audit trail viewer), and the comprehensive automated integration test suite.

## Task Breakdown

### Task AAA-M6-01: Administrative REST APIs
- **Inputs**: `keyManager.ts`, `policyEngine.ts`, `auditLogger.ts`
- **Outputs**:
  - `backend/src/aaa/routes/tenants.ts`
  - `backend/src/aaa/routes/keys.ts`
  - `backend/src/aaa/routes/policies.ts`
  - `backend/src/aaa/routes/audit.ts`
  - `backend/src/aaa/routes/index.ts`
- **Implementation**:
  - Tenant CRUD and membership management.
  - Hashed key generation, scoping, and revocation endpoints.
  - Policy testing and hot-reloading endpoints.
  - Audit log query endpoint with filtering, search, and CSV/JSON export.
- **Acceptance Criteria**:
  - All endpoints guarded by RBAC permissions.

### Task AAA-M6-02: Frontend Control Panel Views
- **Inputs**: `frontend/src/App.tsx`, `frontend/src/i18n.tsx`
- **Outputs**:
  - `frontend/src/components/aaa/TenantSwitcher.tsx`
  - `frontend/src/components/aaa/KeyCreationWizard.tsx`
  - `frontend/src/pages/AuditLogs.tsx`
- **Implementation**:
  - TenantSwitcher dropdown in dashboard header.
  - KeyCreationWizard modal with scope selector and one-time secret display.
  - AuditLogs page with real-time log streaming and JSON diff viewer.
- **Acceptance Criteria**:
  - Frontend compiles cleanly with `npm run build --prefix frontend`.

### Task AAA-M6-03: Automated AAA Integration Test Suite
- **Inputs**: `backend/src/aaa/index.ts`
- **Outputs**:
  - `tests/e2e/aaa/authn.test.ts`
  - `tests/e2e/aaa/authz.test.ts`
  - `tests/e2e/aaa/ratelimit.test.ts`
  - `tests/e2e/aaa/audit.test.ts`
- **Implementation**:
  - AuthN: Validate hashed key verification, OIDC JWT, mTLS cert mapping.
  - AuthZ: Validate RBAC roles, ABAC IP CIDR filtering, parameter clamps.
  - Rate Limiting: Validate sliding window 429 and RFC 6585 headers.
  - Audit: Validate event emission, tamper verification, and SIEM delivery.
- **Acceptance Criteria**:
  - 100% pass rate in local test runs.
