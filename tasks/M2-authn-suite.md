# Milestone 2: Enterprise Authentication (AuthN) Suite

- **Branch**: `feature/aaa-02-authn-keys-oidc-mtls`
- **Dependencies**: Milestone 1 (`feature/aaa-01-core-storage`)
- **Target Completion**: Week 2

## Objective
Implement cryptographic API key hashing, zero-downtime plaintext migration, federated OIDC/OAuth2 token validation with dynamic JWKS discovery, mTLS client certificate extraction, and the unified `authnMiddleware`.

## Task Breakdown

### Task AAA-M2-01: Hashed API Key Manager
- **Inputs**: `backend/src/aaa/types.ts`, `backend/src/aaa/storage/interface.ts`
- **Outputs**: `backend/src/aaa/authn/keyManager.ts`
- **Implementation**:
  - Key format: `oc_<env>_<key_id>_<secret>`.
  - Hashing: SHA-256 with constant-time verification (`crypto.timingSafeEqual`).
  - Cache validated keys in `AAAStorageBackend` (TTL 120s).
  - Support key rotation with grace period.
- **Acceptance Criteria**:
  - Raw secret is returned exactly once at creation and never persisted.
  - Verification succeeds with valid keys and fails immediately with invalid/revoked keys.

### Task AAA-M2-02: Plaintext Key In-Place Migration Utility
- **Inputs**: `backend/src/db/sqliteAdapter.ts`, `backend/src/routes/gatewayKeys.ts`
- **Outputs**: `backend/src/aaa/authn/keyMigration.ts`
- **Implementation**:
  - Scan `gateway_keys` with NULL `secret_hash`.
  - Generate deterministic prefix and SHA-256 hash.
  - Update rows in a transaction with rollback protection.
- **Acceptance Criteria**:
  - Existing clients connect uninterrupted while keys are securely hashed.

### Task AAA-M2-03: Federated OIDC & JWT Verifier
- **Inputs**: `backend/src/aaa/config.ts`, `backend/src/aaa/types.ts`
- **Outputs**: `backend/src/aaa/authn/oidcValidator.ts`
- **Implementation**:
  - Fetch and cache OIDC discovery and JWKS public keys.
  - Verify RS256/ES256 signatures and standard claims (`iss`, `aud`, `exp`).
  - Map enterprise claims (groups, roles) to `AuthIdentity`.
- **Acceptance Criteria**:
  - Expired, tampered, or untrusted tokens are rejected with HTTP 401.

### Task AAA-M2-04: Mutual TLS (mTLS) Extractor
- **Inputs**: `backend/src/aaa/config.ts`, `backend/src/aaa/types.ts`
- **Outputs**: `backend/src/aaa/authn/mtlsExtractor.ts`
- **Implementation**:
  - Extract client certificate from Node TLS socket or RFC-compliant ingress headers (XFCC).
  - Extract SAN/CN and SHA-256 certificate fingerprint.
  - Map certificate fingerprints to tenant service accounts.
- **Acceptance Criteria**:
  - Validates client certificates in direct and reverse-proxy modes.

### Task AAA-M2-05: Unified AuthN Middleware
- **Inputs**: `keyManager.ts`, `oidcValidator.ts`, `mtlsExtractor.ts`
- **Outputs**: `backend/src/aaa/authn/authnMiddleware.ts`
- **Implementation**:
  - Extract credentials from `Authorization`, `x-api-key`, `anthropic-api-key`, and mTLS.
  - Bind `AuthContext` to Hono context (`c.set('authContext', ctx)`).
- **Acceptance Criteria**:
  - Injects verified `AuthContext` accessible throughout the request lifecycle.
