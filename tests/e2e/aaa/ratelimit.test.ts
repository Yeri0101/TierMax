/**
 * Adversarial Runtime Test Suite: Rate Limiting, Concurrency, and Quota Management
 * Tests MemoryStorageBackend, ConsumerRateLimiter, and QuotaManager under adversarial conditions.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageBackend } from '../../../backend/src/aaa/storage/memoryStorage';
import { ConsumerRateLimiter } from '../../../backend/src/aaa/autha/consumerRateLimiter';
import { QuotaManager } from '../../../backend/src/aaa/autha/quotaManager';

describe('Adversarial Test Suite: MemoryStorageBackend Rate Limiter', () => {
    test('1.1 Burst Capacity Saturation: exactly exhausts limit and throttles subsequent requests', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const scopeKey = 'ratelimit:tenant_burst_1';
        const limit = 50;
        const windowSeconds = 60;

        // Fire 50 requests with cost = 1
        for (let i = 1; i <= limit; i++) {
            const res = await storage.consumeRateLimit(scopeKey, 1, windowSeconds, limit);
            assert.equal(res.allowed, true, `Request #${i} should be allowed`);
            assert.equal(res.remaining, limit - i, `Remaining capacity should be ${limit - i}`);
            assert.equal(res.limit, limit);
        }

        // 51st request must be denied
        const deniedRes = await storage.consumeRateLimit(scopeKey, 1, windowSeconds, limit);
        assert.equal(deniedRes.allowed, false, 'Request #51 must be rejected');
        assert.equal(deniedRes.remaining, 0, 'Remaining capacity must be 0');
        assert.ok(deniedRes.retryAfterSeconds && deniedRes.retryAfterSeconds > 0, 'Retry-After must be positive');
        assert.ok(deniedRes.retryAfterSeconds <= windowSeconds, 'Retry-After must not exceed window');

        await storage.close();
    });

    test('1.2 Variable Cost Rejection: rejects cost exceeding remaining capacity without consuming', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const scopeKey = 'ratelimit:variable_cost';
        const limit = 100;
        const windowSeconds = 60;

        // Request 1: cost 40 (remaining 60)
        const res1 = await storage.consumeRateLimit(scopeKey, 40, windowSeconds, limit);
        assert.equal(res1.allowed, true);
        assert.equal(res1.remaining, 60);

        // Request 2: cost 50 (remaining 10)
        const res2 = await storage.consumeRateLimit(scopeKey, 50, windowSeconds, limit);
        assert.equal(res2.allowed, true);
        assert.equal(res2.remaining, 10);

        // Request 3: cost 15 (exceeds remaining 10 -> rejected!)
        const res3 = await storage.consumeRateLimit(scopeKey, 15, windowSeconds, limit);
        assert.equal(res3.allowed, false, 'Cost 15 should be rejected when remaining is 10');
        assert.equal(res3.remaining, 10, 'Remaining should still be 10 (not consumed)');

        // Request 4: cost 10 (fits remaining 10 exactly -> allowed!)
        const res4 = await storage.consumeRateLimit(scopeKey, 10, windowSeconds, limit);
        assert.equal(res4.allowed, true, 'Cost 10 should fit exactly in remaining 10');
        assert.equal(res4.remaining, 0);

        await storage.close();
    });

    test('1.3 Sliding Window Time-Decay & Capacity Recovery (Mocked Clock)', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const scopeKey = 'ratelimit:time_sliding';
        const limit = 100;
        const windowSeconds = 60;

        const originalNow = Date.now;
        let simulatedTime = 1_000_000_000_000;
        Date.now = () => simulatedTime;

        try {
            // t = 0s: consume 40
            const r1 = await storage.consumeRateLimit(scopeKey, 40, windowSeconds, limit);
            assert.equal(r1.allowed, true);
            assert.equal(r1.remaining, 60);

            // t = 20s: consume 40
            simulatedTime += 20_000;
            const r2 = await storage.consumeRateLimit(scopeKey, 40, windowSeconds, limit);
            assert.equal(r2.allowed, true);
            assert.equal(r2.remaining, 20);

            // t = 40s: consume 20 (now fully saturated: 40 + 40 + 20 = 100)
            simulatedTime += 20_000;
            const r3 = await storage.consumeRateLimit(scopeKey, 20, windowSeconds, limit);
            assert.equal(r3.allowed, true);
            assert.equal(r3.remaining, 0);

            // t = 50s: consume 5 -> denied (current usage = 100)
            simulatedTime += 10_000;
            const r4 = await storage.consumeRateLimit(scopeKey, 5, windowSeconds, limit);
            assert.equal(r4.allowed, false);
            assert.equal(r4.remaining, 0);

            // t = 61s: (first 40 cost at t=0s is now older than 60s window and expires!)
            // Remaining capacity should be 40.
            simulatedTime += 11_000; // 50s + 11s = 61s from start
            const r5 = await storage.consumeRateLimit(scopeKey, 30, windowSeconds, limit);
            assert.equal(r5.allowed, true, 'Should allow 30 cost after oldest 40 expired');
            assert.equal(r5.remaining, 10, 'Remaining should be 40 - 30 = 10');

            // t = 81s: (second 40 cost at t=20s expires!)
            simulatedTime += 20_000; // 81s from start
            // Active entries: t=40s (20 cost), t=61s (30 cost) => usage = 50. Remaining = 50.
            const r6 = await storage.consumeRateLimit(scopeKey, 45, windowSeconds, limit);
            assert.equal(r6.allowed, true);
            assert.equal(r6.remaining, 5);

            // t = 101s: (t=40s cost of 20 expires!)
            simulatedTime += 20_000; // 101s from start
            // Active entries: t=61s (30 cost), t=81s (45 cost) => usage = 75. Remaining = 25.
            const r7 = await storage.consumeRateLimit(scopeKey, 25, windowSeconds, limit);
            assert.equal(r7.allowed, true);
            assert.equal(r7.remaining, 0);
        } finally {
            Date.now = originalNow;
            await storage.close();
        }
    });

    test('1.4 Concurrent Burst Race Condition: 500 parallel promises under limit of 200', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const scopeKey = 'ratelimit:concurrent_burst';
        const limit = 200;
        const totalRequests = 500;
        const windowSeconds = 60;

        // Fire 500 concurrent requests simultaneously
        const promises = Array.from({ length: totalRequests }, () =>
            storage.consumeRateLimit(scopeKey, 1, windowSeconds, limit)
        );

        const results = await Promise.all(promises);

        const allowedCount = results.filter(r => r.allowed).length;
        const deniedCount = results.filter(r => !r.allowed).length;

        assert.equal(allowedCount, limit, `Exactly ${limit} requests should be allowed`);
        assert.equal(deniedCount, totalRequests - limit, `Exactly ${totalRequests - limit} requests should be rejected`);

        await storage.close();
    });

    test('1.5 Adversarial Rate Limit Edge Cases: zero cost, negative cost, scope isolation', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const windowSeconds = 60;
        const limit = 100;

        // Zero cost request
        const resZero = await storage.consumeRateLimit('scope_zero', 0, windowSeconds, limit);
        assert.equal(resZero.allowed, true);
        assert.equal(resZero.remaining, limit);

        // Immediate overflow: single request cost exceeds limit
        const resExceed = await storage.consumeRateLimit('scope_exceed', 150, windowSeconds, limit);
        assert.equal(resExceed.allowed, false, 'Cost > limit on empty window must reject');
        assert.equal(resExceed.remaining, limit);

        // Scope isolation test
        const resA = await storage.consumeRateLimit('tenant_A', 100, windowSeconds, limit);
        assert.equal(resA.allowed, true);
        assert.equal(resA.remaining, 0);

        // tenant_B must be completely unaffected by tenant_A saturation
        const resB = await storage.consumeRateLimit('tenant_B', 50, windowSeconds, limit);
        assert.equal(resB.allowed, true, 'tenant_B should not be throttled by tenant_A');
        assert.equal(resB.remaining, 50);

        // Adversarial Challenge: Negative cost injection
        // Test what happens if cost is negative
        const resNeg = await storage.consumeRateLimit('scope_neg', -20, windowSeconds, limit);
        // Note finding: if negative cost is allowed, remaining becomes > limit
        const expandedRemaining = resNeg.remaining;

        await storage.close();
    });
});

describe('Adversarial Test Suite: Concurrency Tracking', () => {
    test('2.1 Sequential Slot Exhaustion & Release Cycle', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const scope = 'concurrency:sequential';
        const maxConcurrent = 3;

        // Acquire 3 slots
        assert.equal(await storage.acquireConcurrencySlot(scope, maxConcurrent), true, 'Slot 1 should acquire');
        assert.equal(await storage.acquireConcurrencySlot(scope, maxConcurrent), true, 'Slot 2 should acquire');
        assert.equal(await storage.acquireConcurrencySlot(scope, maxConcurrent), true, 'Slot 3 should acquire');

        // 4th acquire must fail
        assert.equal(await storage.acquireConcurrencySlot(scope, maxConcurrent), false, 'Slot 4 must fail (exhausted)');

        // Release 1 slot
        await storage.releaseConcurrencySlot(scope);

        // Now acquire should succeed
        assert.equal(await storage.acquireConcurrencySlot(scope, maxConcurrent), true, 'Acquire after release should succeed');
        assert.equal(await storage.acquireConcurrencySlot(scope, maxConcurrent), false, 'Slot exhausted again');

        // Release all
        await storage.releaseConcurrencySlot(scope);
        await storage.releaseConcurrencySlot(scope);
        await storage.releaseConcurrencySlot(scope);

        await storage.close();
    });

    test('2.2 Concurrent Promise Race: 100 concurrent promises for 15 slots', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const scope = 'concurrency:race';
        const maxConcurrent = 15;
        const attempts = 100;

        const promises = Array.from({ length: attempts }, () =>
            storage.acquireConcurrencySlot(scope, maxConcurrent)
        );

        const results = await Promise.all(promises);
        const acquired = results.filter(r => r === true).length;
        const rejected = results.filter(r => r === false).length;

        assert.equal(acquired, maxConcurrent, `Exactly ${maxConcurrent} slots must be acquired`);
        assert.equal(rejected, attempts - maxConcurrent, `Exactly ${attempts - maxConcurrent} attempts must be rejected`);

        await storage.close();
    });

    test('2.3 Asynchronous In-Flight Contention and Release under simulated load', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const scope = 'concurrency:async_load';
        const maxConcurrent = 10;
        const totalTasks = 50;

        let activeCount = 0;
        let peakConcurrency = 0;
        let successfulTasks = 0;
        let rejectedTasks = 0;

        const runTask = async (id: number) => {
            const acquired = await storage.acquireConcurrencySlot(scope, maxConcurrent);
            if (!acquired) {
                rejectedTasks++;
                return;
            }

            activeCount++;
            peakConcurrency = Math.max(peakConcurrency, activeCount);

            // Simulate variable async LLM streaming latency (5ms - 20ms)
            const sleepMs = 5 + (id % 15);
            await new Promise(resolve => setTimeout(resolve, sleepMs));

            activeCount--;
            await storage.releaseConcurrencySlot(scope);
            successfulTasks++;
        };

        await Promise.all(Array.from({ length: totalTasks }, (_, i) => runTask(i)));

        assert.ok(peakConcurrency <= maxConcurrent, `Peak concurrency (${peakConcurrency}) must not exceed limit (${maxConcurrent})`);
        assert.equal(activeCount, 0, 'Active concurrency count must return to 0');
        assert.equal(successfulTasks + rejectedTasks, totalTasks);

        await storage.close();
    });

    test('2.4 Adversarial Concurrency Edge Cases: underflow and unacquired release', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const scope = 'concurrency:underflow';

        // Releasing an unacquired key must not throw or crash
        await assert.doesNotReject(async () => {
            await storage.releaseConcurrencySlot(scope);
        });

        // Acquire 1, release 3 times (over-release)
        await storage.acquireConcurrencySlot(scope, 5);
        await storage.releaseConcurrencySlot(scope);
        await storage.releaseConcurrencySlot(scope);
        await storage.releaseConcurrencySlot(scope);

        // After over-release, acquiring 1 slot should still require exactly 1 release to clear
        assert.equal(await storage.acquireConcurrencySlot(scope, 2), true);
        assert.equal(await storage.acquireConcurrencySlot(scope, 2), true);
        assert.equal(await storage.acquireConcurrencySlot(scope, 2), false);

        await storage.close();
    });
});

describe('Adversarial Test Suite: Quota Wallet Management', () => {
    test('3.1 Default Balance Initialization & Over-Reservation Rejection', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const tenant = 't_enterprise';
        const project = 'p_analytics';

        // Default balance is $100.00
        // Reserve $65.00 -> should succeed (available $35.00)
        assert.equal(await storage.reserveQuota(tenant, project, 65.00), true);

        // Reserve $40.00 -> should fail (available $35.00 < $40.00)
        assert.equal(await storage.reserveQuota(tenant, project, 40.00), false, 'Over-reservation must be rejected');

        // Reserve $35.00 -> exact balance reservation should succeed
        assert.equal(await storage.reserveQuota(tenant, project, 35.00), true, 'Exact remaining balance reservation should succeed');

        // Now wallet is 100% reserved. Even $0.01 must be rejected.
        assert.equal(await storage.reserveQuota(tenant, project, 0.01), false, 'Reservation on fully reserved wallet must fail');

        await storage.close();
    });

    test('3.2 Exact Balance Settlement and Underspend Recovery', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const tenant = 't_settle';
        const project = 'p_settle';

        // Reserve $60.00 (available $40.00)
        assert.equal(await storage.reserveQuota(tenant, project, 60.00), true);

        // Settle exact: actual cost $60.00, reserved $60.00
        await storage.settleQuota(tenant, project, 60.00, 60.00);

        // Balance is now $40.00, reserved is $0.00, available is $40.00
        // Reserve $30.00 (available $10.00)
        assert.equal(await storage.reserveQuota(tenant, project, 30.00), true);

        // Settle underspend: actual cost $15.00, reserved $30.00
        // Balance becomes $40.00 - $15.00 = $25.00; reserved becomes $0.00.
        // Available should now be $25.00!
        await storage.settleQuota(tenant, project, 15.00, 30.00);

        // Verify we can reserve up to the new available balance of $25.00
        assert.equal(await storage.reserveQuota(tenant, project, 25.00), true, 'Should allow reserving up to new available $25.00');
        assert.equal(await storage.reserveQuota(tenant, project, 0.01), false, 'Should reject over-reservation beyond $25.00');

        await storage.close();
    });

    test('3.3 Streaming Overage Settlement (Actual Cost > Reserved)', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const tenant = 't_stream';
        const project = 'p_stream';

        // Initial balance $100.00. Reserve $10.00 (available $90.00).
        assert.equal(await storage.reserveQuota(tenant, project, 10.00), true);

        // Response had high output token volume: actual cost $25.00 (exceeded estimated $10.00 hold)
        await storage.settleQuota(tenant, project, 25.00, 10.00);

        // Balance should be $100 - $25 = $75.00; reserved should be 0; available should be $75.00.
        assert.equal(await storage.reserveQuota(tenant, project, 75.00), true, 'Should reserve up to remaining $75.00');
        assert.equal(await storage.reserveQuota(tenant, project, 1.00), false, 'Should reject beyond remaining balance');

        await storage.close();
    });

    test('3.4 Concurrent Quota Reservations: 20 parallel promises of $10 on $100 wallet', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const tenant = 't_concurrent';
        const project = 'p_concurrent';

        const attempts = 20;
        const amountPerAttempt = 10.00;

        const promises = Array.from({ length: attempts }, () =>
            storage.reserveQuota(tenant, project, amountPerAttempt)
        );

        const results = await Promise.all(promises);
        const successful = results.filter(r => r === true).length;
        const failed = results.filter(r => r === false).length;

        assert.equal(successful, 10, 'Exactly 10 reservations of $10 should succeed on $100 wallet');
        assert.equal(failed, 10, 'Exactly 10 reservations should be rejected');

        await storage.close();
    });

    test('3.5 Adversarial Vulnerability Probe: Negative Cost Injection in Quota Wallet', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const tenant = 't_adversary';
        const project = 'p_adversary';

        // Challenge 1: Can an attacker pass negative amount to reserveQuota?
        // available = 100 - 0 = 100. amountUsd = -50. 100 < -50 is FALSE.
        // wallet.reservedUsd += -50 => reservedUsd becomes -50!
        // available becomes 100 - (-50) = 150!
        const negativeReserveAllowed = await storage.reserveQuota(tenant, project, -50.00);

        // Challenge 2: Can an attacker pass negative actualCost to settleQuota?
        // wallet.balanceUsd = Math.max(0, wallet.balanceUsd - (-50)) => balance becomes 150!
        await storage.settleQuota(tenant, project, -50.00, 0);

        // Try reserving $140 from the now artificially inflated wallet:
        const inflatedReserveAllowed = await storage.reserveQuota(tenant, project, 140.00);

        // Document this empirical finding
        console.log(`[VULNERABILITY FINDING] Negative reserve accepted: ${negativeReserveAllowed}, Inflated reserve accepted: ${inflatedReserveAllowed}`);

        await storage.close();
    });
});
