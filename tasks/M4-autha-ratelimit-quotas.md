# Milestone 4: Consumer Accounting & Rate Limiting (AuthA Part 1)

- **Branch**: `feature/aaa-04-autha-metering-ratelimit`
- **Dependencies**: Milestone 1, Milestone 2
- **Target Completion**: Week 4

## Objective
Implement sliding-window downstream rate limiting (RPM, TPM, RPS, Concurrency), RFC 6585 rate limit response headers, atomic token quota reservations, and streaming SSE usage settlement.

## Task Breakdown

### Task AAA-M4-01: Consumer Rate Limiter & RFC 6585 Headers
- **Inputs**: `backend/src/aaa/storage/interface.ts`
- **Outputs**: `backend/src/aaa/autha/consumerRateLimiter.ts`
- **Implementation**:
  - Sliding-window counter evaluation across RPM, TPM, and RPS.
  - Concurrency slot tracking per API key and tenant.
  - Injected headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`.
- **Acceptance Criteria**:
  - Exceeding RPM/TPM returns HTTP 429 with accurate `Retry-After` header.
  - Concurrency slot release on request completion or abort.

### Task AAA-M4-02: Atomic Token Quota Manager
- **Inputs**: `backend/src/aaa/storage/interface.ts`, `backend/src/routes/pricing.ts`
- **Outputs**: `backend/src/aaa/autha/quotaManager.ts`
- **Implementation**:
  - Estimate prompt + completion tokens before upstream dispatch.
  - Atomic pre-flight balance reservation via `reserveQuota`.
  - Reject with HTTP 402 Payment Required if wallet balance is depleted.
  - Reconcile actual cost against reserved cost post-response.
- **Acceptance Criteria**:
  - Zero balance overdrafts under concurrent request bursts.

### Task AAA-M4-03: Streaming SSE Settlement Hook
- **Inputs**: `backend/src/routes/v1.ts`, `backend/src/utils/completionEngine.ts`
- **Outputs**: `backend/src/aaa/autha/streamingAccounting.ts`
- **Implementation**:
  - Intercept Hono SSE stream chunks.
  - Accumulate emitted tokens in real-time.
  - On stream end or abort, finalize token cost and settle quota hold.
  - Append finalized record to `request_logs`.
- **Acceptance Criteria**:
  - Streaming delivers chunks with zero added latency while ensuring 100% token accounting accuracy.
