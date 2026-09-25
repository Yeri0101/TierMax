# Milestone 5: Immutable Audit Ledger & SIEM Export (AuthA Part 2)

- **Branch**: `feature/aaa-05-autha-audit-siem`
- **Dependencies**: Milestone 1, Milestone 3
- **Target Completion**: Week 5

## Objective
Implement immutable security audit logging adhering to CloudEvents v1.0 and RFC 5424 specifications, tamper-evident SHA-256 hash chaining, an asynchronous in-memory batching buffer, and pluggable SIEM export pipelines (Syslog, OpenTelemetry OTLP, Webhooks).

## Task Breakdown

### Task AAA-M5-01: Immutable Security Audit Ledger
- **Inputs**: `backend/src/aaa/types.ts`, `backend/migrations/20260925000200_aaa_audit_and_quotas.sql`
- **Outputs**: `backend/src/aaa/autha/auditLogger.ts`
- **Implementation**:
  - Format audit events with time-sortable UUIDv7 IDs, ISO-8601 timestamps, actor, action, resource, clientInfo, severity.
  - Compute `prevHash` pointer to previous record for cryptographic tamper verification.
  - Insert records into `audit_events` table.
- **Acceptance Criteria**:
  - Audit records cannot be updated or deleted without breaking the hash chain.

### Task AAA-M5-02: Asynchronous Audit Buffer Queue
- **Inputs**: `backend/src/aaa/autha/auditLogger.ts`
- **Outputs**: `backend/src/aaa/autha/auditQueue.ts`
- **Implementation**:
  - Non-blocking ring buffer queue with batch flushing (e.g., 50 items or 1,000ms).
  - Backpressure handling under extreme load.
  - Flush all pending events on process shutdown (`SIGTERM`, `SIGINT`).
- **Acceptance Criteria**:
  - Dispatch introduces < 1ms overhead to gateway hot-path.

### Task AAA-M5-03: Pluggable SIEM Exporters
- **Inputs**: `backend/src/aaa/config.ts`, `backend/src/aaa/types.ts`
- **Outputs**:
  - `backend/src/aaa/autha/exporters/syslogExporter.ts`
  - `backend/src/aaa/autha/exporters/otlpExporter.ts`
  - `backend/src/aaa/autha/exporters/webhookExporter.ts`
- **Implementation**:
  - Syslog RFC 5424 exporter over TLS/TCP/UDP.
  - OpenTelemetry structured log exporter (OTLP HTTP/Protobuf).
  - Webhook exporter with HMAC-SHA256 signature and retry backoff.
- **Acceptance Criteria**:
  - Audit logs stream reliably to enterprise SIEM platforms without impacting request latency.
