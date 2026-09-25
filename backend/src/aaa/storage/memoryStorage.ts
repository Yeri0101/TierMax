/**
 * OpenClaw Gateway AAA Suite — In-Memory Storage Adapter
 * Zero-dependency in-process implementation of AAAStorageBackend for local
 * development, testing, and single-instance deployments.
 */

import { AAAStorageBackend } from './interface';
import { HashedKeyData, RateLimitResult, AuditEvent } from '../types';

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

interface RateLimitEntry {
    timestamp: number;
    cost: number;
}

interface WalletState {
    balanceUsd: number;
    reservedUsd: number;
}

export class MemoryStorageBackend implements AAAStorageBackend {
    public readonly name = 'memory' as const;

    private readonly keyCache = new Map<string, CacheEntry<HashedKeyData>>();
    private readonly rateLimitLogs = new Map<string, RateLimitEntry[]>();
    private readonly concurrencySlots = new Map<string, number>();
    private readonly wallets = new Map<string, WalletState>();
    private readonly auditQueue: AuditEvent[] = [];

    private cleanupInterval?: NodeJS.Timeout;
    private isInitialized = false;

    public async init(): Promise<void> {
        if (this.isInitialized) return;
        this.isInitialized = true;

        // Periodic eviction for expired cache entries and old rate limit logs every 60s
        this.cleanupInterval = setInterval(() => {
            this.purgeExpired();
        }, 60000);

        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }
    }

    public async close(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        this.keyCache.clear();
        this.rateLimitLogs.clear();
        this.concurrencySlots.clear();
        this.wallets.clear();
        this.auditQueue.length = 0;
        this.isInitialized = false;
    }

    // -------------------------------------------------------------------------
    // Hashed Key Cache
    // -------------------------------------------------------------------------

    public async getHashedKey(keyPrefix: string): Promise<HashedKeyData | null> {
        const entry = this.keyCache.get(keyPrefix);
        if (!entry) return null;

        if (Date.now() > entry.expiresAt) {
            this.keyCache.delete(keyPrefix);
            return null;
        }

        return { ...entry.data };
    }

    public async setHashedKey(keyPrefix: string, data: HashedKeyData, ttlSeconds: number): Promise<void> {
        const expiresAt = Date.now() + ttlSeconds * 1000;
        this.keyCache.set(keyPrefix, {
            data: { ...data },
            expiresAt
        });
    }

    public async invalidateHashedKey(keyPrefix: string): Promise<void> {
        this.keyCache.delete(keyPrefix);
    }

    // -------------------------------------------------------------------------
    // Consumer Rate Limiting (Sliding Window Log)
    // -------------------------------------------------------------------------

    public async consumeRateLimit(
        scopeKey: string,
        cost: number,
        windowSeconds: number,
        maxLimit: number
    ): Promise<RateLimitResult> {
        const now = Date.now();
        const windowMs = windowSeconds * 1000;
        const cutoff = now - windowMs;

        let entries = this.rateLimitLogs.get(scopeKey);
        if (!entries) {
            entries = [];
            this.rateLimitLogs.set(scopeKey, entries);
        }

        // Prune entries outside the sliding window
        entries = entries.filter((e) => e.timestamp > cutoff);
        this.rateLimitLogs.set(scopeKey, entries);

        const safeCost = (typeof cost === 'number' && Number.isFinite(cost) && cost > 0) ? cost : 0;
        const currentUsage = entries.reduce((acc, curr) => acc + curr.cost, 0);

        if (currentUsage + safeCost > maxLimit) {
            // Calculate how long until enough capacity expires
            const oldestEntry = entries[0];
            const retryAfterMs = oldestEntry ? Math.max(0, oldestEntry.timestamp + windowMs - now) : windowMs;
            const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

            return {
                allowed: false,
                limit: maxLimit,
                remaining: Math.max(0, maxLimit - currentUsage),
                resetSeconds: retryAfterSeconds,
                retryAfterSeconds
            };
        }

        // Record current consumption
        entries.push({ timestamp: now, cost: safeCost });
        const remaining = Math.max(0, maxLimit - (currentUsage + safeCost));

        return {
            allowed: true,
            limit: maxLimit,
            remaining,
            resetSeconds: windowSeconds
        };
    }

    // -------------------------------------------------------------------------
    // Concurrency Tracking
    // -------------------------------------------------------------------------

    public async acquireConcurrencySlot(scopeKey: string, maxConcurrent: number): Promise<boolean> {
        const active = this.concurrencySlots.get(scopeKey) || 0;
        if (active >= maxConcurrent) {
            return false;
        }

        this.concurrencySlots.set(scopeKey, active + 1);
        return true;
    }

    public async releaseConcurrencySlot(scopeKey: string): Promise<void> {
        const active = this.concurrencySlots.get(scopeKey) || 0;
        if (active <= 1) {
            this.concurrencySlots.delete(scopeKey);
        } else {
            this.concurrencySlots.set(scopeKey, active - 1);
        }
    }

    // -------------------------------------------------------------------------
    // Quota Reservation & Settlement
    // -------------------------------------------------------------------------

    public async reserveQuota(tenantId: string, projectId: string, amountUsd: number): Promise<boolean> {
        if (typeof amountUsd !== 'number' || !Number.isFinite(amountUsd) || amountUsd <= 0) {
            return false;
        }

        const walletKey = `${tenantId}:${projectId}`;
        let wallet = this.wallets.get(walletKey);

        if (!wallet) {
            // Default wallet initialization balance: $100.00
            wallet = { balanceUsd: 100.0, reservedUsd: 0.0 };
            this.wallets.set(walletKey, wallet);
        }

        const available = Math.round((wallet.balanceUsd - wallet.reservedUsd) * 1e6) / 1e6;
        if (available < amountUsd) {
            return false;
        }

        wallet.reservedUsd = Math.round((wallet.reservedUsd + amountUsd) * 1e6) / 1e6;
        return true;
    }

    public async settleQuota(
        tenantId: string,
        projectId: string,
        actualCostUsd: number,
        reservedUsd: number
    ): Promise<void> {
        const walletKey = `${tenantId}:${projectId}`;
        const wallet = this.wallets.get(walletKey);
        if (!wallet) return;

        // Release reserved hold and deduct actual cost with non-negative bounds validation
        const safeActualCost = (typeof actualCostUsd === 'number' && Number.isFinite(actualCostUsd) && actualCostUsd > 0)
            ? actualCostUsd
            : 0;
        const safeReservedUsd = (typeof reservedUsd === 'number' && Number.isFinite(reservedUsd) && reservedUsd > 0)
            ? reservedUsd
            : 0;

        wallet.reservedUsd = Math.max(0, Math.round((wallet.reservedUsd - safeReservedUsd) * 1e6) / 1e6);
        wallet.balanceUsd = Math.max(0, Math.round((wallet.balanceUsd - safeActualCost) * 1e6) / 1e6);
    }

    // -------------------------------------------------------------------------
    // Audit Event Queue
    // -------------------------------------------------------------------------

    public async enqueueAuditEvents(events: AuditEvent[]): Promise<void> {
        this.auditQueue.push(...events);
    }

    public async flushAuditEvents(): Promise<AuditEvent[]> {
        return this.auditQueue.splice(0, this.auditQueue.length);
    }

    // -------------------------------------------------------------------------
    // Internal Maintenance
    // -------------------------------------------------------------------------

    private purgeExpired(): void {
        const now = Date.now();

        // Purge expired keys
        for (const [key, entry] of this.keyCache.entries()) {
            if (now > entry.expiresAt) {
                this.keyCache.delete(key);
            }
        }

        // Purge rate limit logs older than 5 minutes
        const maxLogAgeMs = 5 * 60 * 1000;
        const cutoff = now - maxLogAgeMs;
        for (const [key, entries] of this.rateLimitLogs.entries()) {
            const fresh = entries.filter((e) => e.timestamp > cutoff);
            if (fresh.length === 0) {
                this.rateLimitLogs.delete(key);
            } else {
                this.rateLimitLogs.set(key, fresh);
            }
        }
    }
}
