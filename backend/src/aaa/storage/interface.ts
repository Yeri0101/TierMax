/**
 * OpenClaw Gateway AAA Suite — Unified Storage Backend Contract
 * Interface for pluggable caching, rate limiting, concurrency tracking,
 * token quota reservation, and audit event buffering.
 */

import { RateLimitResult, HashedKeyData, AuditEvent } from '../types';

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
