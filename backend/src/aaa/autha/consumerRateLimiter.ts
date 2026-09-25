/**
 * OpenClaw Gateway AAA Suite — Consumer Rate Limiter & Concurrency Manager
 * Evaluates sliding window RPM/TPM and concurrency slots, setting standard RFC 6585 headers.
 */

import { AAAStorageBackend } from '../storage/interface';
import { RateLimitResult } from '../types';

export class ConsumerRateLimiter {
    private storage: AAAStorageBackend;

    constructor(storage: AAAStorageBackend) {
        this.storage = storage;
    }

    /**
     * Consume rate limit for a client key or tenant
     */
    public async checkRateLimit(
        scopeKey: string,
        cost = 1,
        windowSeconds = 60,
        maxLimit = 120
    ): Promise<RateLimitResult> {
        return this.storage.consumeRateLimit(scopeKey, cost, windowSeconds, maxLimit);
    }

    /**
     * Acquire an active in-flight concurrency slot
     */
    public async acquireConcurrency(scopeKey: string, maxConcurrent = 10): Promise<boolean> {
        return this.storage.acquireConcurrencySlot(scopeKey, maxConcurrent);
    }

    /**
     * Release an in-flight concurrency slot
     */
    public async releaseConcurrency(scopeKey: string): Promise<void> {
        return this.storage.releaseConcurrencySlot(scopeKey);
    }

    /**
     * Format RFC 6585 and IETF standard rate limit headers
     */
    public static formatHeaders(result: RateLimitResult): Record<string, string> {
        const headers: Record<string, string> = {
            'RateLimit-Limit': result.limit.toString(),
            'RateLimit-Remaining': result.remaining.toString(),
            'RateLimit-Reset': result.resetSeconds.toString()
        };

        if (!result.allowed && result.retryAfterSeconds) {
            headers['Retry-After'] = result.retryAfterSeconds.toString();
        }

        return headers;
    }
}
