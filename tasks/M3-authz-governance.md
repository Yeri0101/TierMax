# Milestone 3: Dynamic Authorization (AuthZ) & Governance

- **Branch**: `feature/aaa-03-authz-rbac-abac-routes`
- **Dependencies**: Milestone 2 (`feature/aaa-02-authn-keys-oidc-mtls`)
- **Target Completion**: Week 3

## Objective
Implement enterprise RBAC roles and permissions, contextual ABAC policy evaluation (CIDR, time windows, parameter ceilings), model governance guardrails, and declarative route authorization middleware.

## Task Breakdown

### Task AAA-M3-01: RBAC Permission Taxonomy & Role Matrix
- **Inputs**: `backend/src/aaa/types.ts`
- **Outputs**: `backend/src/aaa/authz/permissions.ts`
- **Implementation**:
  - Define roles: `SuperAdmin`, `OrgAdmin`, `ProjectAdmin`, `Developer`, `Auditor`, `BillingAdmin`.
  - Define action permissions: `llm:chat:invoke`, `keys:create`, `keys:revoke`, `policies:write`, `audit:read`.
  - Support hierarchical role inheritance and wildcard scopes (`*`).
- **Acceptance Criteria**:
  - Role hierarchy correctly grants child permissions to parent roles.

### Task AAA-M3-02: Contextual ABAC Policy Engine
- **Inputs**: `backend/src/aaa/types.ts`, `backend/src/aaa/authz/permissions.ts`
- **Outputs**: `backend/src/aaa/authz/policyEngine.ts`
- **Implementation**:
  - Parse declarative policies in JSON or YAML format.
  - Evaluate IP CIDR whitelist/blacklist subnets (IPv4 & IPv6).
  - Evaluate time-of-day UTC windows and environment restrictions.
  - Return structured `PolicyDecision` (allowed, reason, clampedParameters).
- **Acceptance Criteria**:
  - Disallowed CIDRs or out-of-schedule requests are rejected with 403 Forbidden.

### Task AAA-M3-03: Model Governance & Parameter Clamps
- **Inputs**: `backend/src/aaa/types.ts`, `backend/src/utils/completionEngine.ts`
- **Outputs**: `backend/src/aaa/authz/modelGovernance.ts`
- **Implementation**:
  - Model allowlist/denylist with wildcard globbing (`claude-3-5*`, `gpt-4o*`).
  - Parameter clamping for `max_tokens` and `temperature`.
  - Provider isolation guardrails (prevent confidential data from free-tier upstreams).
- **Acceptance Criteria**:
  - Exceeding parameter ceilings clamped automatically or rejected per policy.

### Task AAA-M3-04: Unified AuthZ Middleware
- **Inputs**: `policyEngine.ts`, `modelGovernance.ts`
- **Outputs**: `backend/src/aaa/authz/authzMiddleware.ts`
- **Implementation**:
  - Extract route action and target resource from request.
  - Execute policy evaluation.
  - Apply clamped parameters to Hono request body.
  - Emit audit event on HTTP 403 rejection.
- **Acceptance Criteria**:
  - All protected routes enforce RBAC and ABAC rules consistently.
