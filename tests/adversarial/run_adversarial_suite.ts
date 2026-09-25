/**
 * Master Adversarial Runtime Stress Harness Runner
 * Runs the complete suite of adversarial tests across MemoryStorageBackend,
 * KeyManager, and AuditLogger, capturing execution performance, edge-case behavior,
 * and empirical contract defects.
 */

import crypto from 'node:crypto';
import { MemoryStorageBackend } from '../../backend/src/aaa/storage/memoryStorage';
import { KeyManager } from '../../backend/src/aaa/authn/keyManager';
import { AuditLogger } from '../../backend/src/aaa/autha/auditLogger';
import { AuditEvent } from '../../backend/src/aaa/types';

interface TestResult {
    name: string;
    passed: boolean;
    durationMs: number;
    details?: string;
    vulnerabilityDetected?: boolean;
    vulnerabilityNote?: string;
}

const results: TestResult[] = [];

async function runSection(name: string, fn: (recordVuln: (note: string) => void) => Promise<void>) {
    const start = performance.now();
    let vulnDetected = false;
    let vulnNote = '';

    const recordVuln = (note: string) => {
        vulnDetected = true;
        vulnNote = note;
    };

    try {
        await fn(recordVuln);
        const durationMs = performance.now() - start;
        results.push({
            name,
            passed: true,
            durationMs,
            vulnerabilityDetected: vulnDetected,
            vulnerabilityNote: vulnNote
        });
        console.log(`  ✔ [PASS] ${name} (${durationMs.toFixed(2)}ms)`);
        if (vulnDetected) {
            console.log(`    ⚠ VULNERABILITY: ${vulnNote}`);
        }
    } catch (err: any) {
        const durationMs = performance.now() - start;
        results.push({ name, passed: false, durationMs, details: err.message });
        console.error(`  ✖ [FAIL] ${name} (${durationMs.toFixed(2)}ms):`, err.message);
    }
}

async function main() {
    console.log('===================================================================');
    console.log(' OpenClaw Gateway AAA Suite — Adversarial Runtime Stress Harness');
    console.log('===================================================================\n');

    // -------------------------------------------------------------------------
    // 1. MemoryStorageBackend: Rate Limiting & Concurrency
    // -------------------------------------------------------------------------
    console.log('▶ [1/3] MemoryStorageBackend Stress & Edge Cases:');

    await runSection('Sliding-window rapid burst saturation (100 reqs, limit 100)', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const scope = 'harness:burst_100';

        for (let i = 0; i < 100; i++) {
            const res = await storage.consumeRateLimit(scope, 1, 60, 100);
            if (!res.allowed) throw new Error(`Request #${i + 1} was prematurely rejected`);
        }

        const denied = await storage.consumeRateLimit(scope, 1, 60, 100);
        if (denied.allowed) throw new Error('101st request should be rejected');
        if (denied.remaining !== 0) throw new Error(`Remaining should be 0, got ${denied.remaining}`);
        await storage.close();
    });

    await runSection('High-concurrency Promise.all storm (1,000 promises for 250 capacity)', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const scope = 'harness:storm_1000';
        const limit = 250;

        const promises = Array.from({ length: 1000 }, () =>
            storage.consumeRateLimit(scope, 1, 60, limit)
        );

        const outcomes = await Promise.all(promises);
        const allowed = outcomes.filter(o => o.allowed).length;
        const rejected = outcomes.filter(o => !o.allowed).length;

        if (allowed !== limit) throw new Error(`Expected exactly ${limit} allowed, got ${allowed}`);
        if (rejected !== 750) throw new Error(`Expected exactly 750 rejected, got ${rejected}`);
        await storage.close();
    });

    await runSection('Concurrency slot contention (200 promises contending for 20 slots)', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const scope = 'harness:concurrency_20';
        const slots = 20;

        const promises = Array.from({ length: 200 }, () =>
            storage.acquireConcurrencySlot(scope, slots)
        );

        const outcomes = await Promise.all(promises);
        const acquired = outcomes.filter(o => o === true).length;
        if (acquired !== slots) throw new Error(`Expected exactly ${slots} acquired, got ${acquired}`);

        // Release 5 slots and acquire 5 more
        for (let i = 0; i < 5; i++) await storage.releaseConcurrencySlot(scope);
        for (let i = 0; i < 5; i++) {
            const reacquired = await storage.acquireConcurrencySlot(scope, slots);
            if (!reacquired) throw new Error(`Slot reacquire #${i + 1} failed`);
        }
        await storage.close();
    });

    await runSection('Quota wallet: Over-reservation, exact balance, and settlement integrity', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const t = 't_harness';
        const p = 'p_harness';

        // Initial $100. Reserve $80.
        if (!await storage.reserveQuota(t, p, 80.00)) throw new Error('Failed to reserve $80');
        // Overdraw attempt $25 (available $20)
        if (await storage.reserveQuota(t, p, 25.00)) throw new Error('Overdraw $25 should be rejected');
        // Exact remaining reserve $20
        if (!await storage.reserveQuota(t, p, 20.00)) throw new Error('Exact reserve $20 should succeed');
        // Settle $80 hold with $50 actual (saving $30)
        await storage.settleQuota(t, p, 50.00, 80.00);
        // Settle $20 hold with $20 actual
        await storage.settleQuota(t, p, 20.00, 20.00);
        // Available balance is now $100 - $70 = $30. Reserve $30.
        if (!await storage.reserveQuota(t, p, 30.00)) throw new Error('Failed to reserve freed $30');
        if (await storage.reserveQuota(t, p, 0.01)) throw new Error('Should reject beyond $30');
        await storage.close();
    });

    await runSection('Quota wallet flaw check: Negative cost balance inflation probe', async (recordVuln) => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const t = 't_neg';
        const p = 'p_neg';

        // Attempting negative reservation
        const negRes = await storage.reserveQuota(t, p, -100.00);
        if (negRes) {
            recordVuln('reserveQuota accepts negative amount (-$100.00), artificially minting quota');
        }
        await storage.close();
    });

    // -------------------------------------------------------------------------
    // 2. KeyManager: Format, Constant-Time Verification, Bit-Flipping Fuzzing
    // -------------------------------------------------------------------------
    console.log('\n▶ [2/3] KeyManager Format & Tamper Resistance:');

    await runSection('Format compliance & crypto entropy across 1,000 keys', async () => {
        const regex = /^oc_[a-z]+_[0-9a-f]{8}_[0-9a-f]{48}$/;
        for (let i = 0; i < 1000; i++) {
            const { rawKey, keyData } = KeyManager.generateApiKey({
                tenantId: `t_${i}`,
                projectId: `p_${i}`,
                name: `Key_${i}`,
                env: 'live'
            });
            if (!regex.test(rawKey)) throw new Error(`Key ${rawKey} failed regex check`);
            const prefix = `oc_live_${rawKey.split('_')[2]}`;
            if (keyData.keyPrefix !== prefix) {
                throw new Error(`Prefix mismatch: ${keyData.keyPrefix} !== ${prefix}`);
            }
        }
    });

    await runSection('Systematic 48-bit secret mutation fuzzing (100% rejection rate)', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const { rawKey, keyData } = KeyManager.generateApiKey({
            tenantId: 't_fuzz',
            projectId: 'p_fuzz',
            name: 'Fuzz Key'
        });
        await storage.setHashedKey(keyData.keyPrefix, keyData, 300);

        const parsed = KeyManager.parseApiKey(rawKey)!;
        const secret = parsed.secret;

        for (let i = 0; i < secret.length; i++) {
            const tamperedChar = secret[i] === '0' ? '1' : '0';
            const tamperedKey = `${parsed.prefix}_${secret.substring(0, i)}${tamperedChar}${secret.substring(i + 1)}`;
            const res = await KeyManager.verifyApiKey(tamperedKey, storage);
            if (res !== null) throw new Error(`Tampered key at index ${i} was incorrectly accepted!`);
        }
        await storage.close();
    });

    await runSection('KeyManager defect probe: Environment names containing underscores', async (recordVuln) => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const { rawKey, keyData } = KeyManager.generateApiKey({
            tenantId: 't_env',
            projectId: 'p_env',
            name: 'Env Key',
            env: 'staging_eu'
        });
        await storage.setHashedKey(keyData.keyPrefix, keyData, 300);

        const verified = await KeyManager.verifyApiKey(rawKey, storage);
        if (verified === null) {
            recordVuln('KeyManager cannot verify valid keys when env has underscores (e.g. "staging_eu")');
        }
        await storage.close();
    });

    // -------------------------------------------------------------------------
    // 3. AuditLogger: Hash Chaining & Cryptographic Tamper Detection
    // -------------------------------------------------------------------------
    console.log('\n▶ [3/3] AuditLogger Hash Chaining & Cryptographic Tamper Detection:');

    await runSection('Sequential audit event hash chaining (50 chained events)', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const logger = new AuditLogger(storage);

        for (let i = 0; i < 50; i++) {
            await logger.recordEvent({
                tenantId: 't_audit',
                actor: { type: 'api_key', id: `k_${i}`, name: `Key ${i}` },
                action: `AUTHZ_CHECK_${i}`,
                resource: { type: 'model', id: 'claude-3-5-sonnet' },
                clientInfo: { ip: `10.10.10.${i}`, userAgent: 'gateway-client' }
            });
        }

        const events = await storage.flushAuditEvents();
        if (events.length !== 50) throw new Error(`Expected 50 events, flushed ${events.length}`);

        for (let i = 1; i < events.length; i++) {
            const { prevHash: _, ...prevPartial } = events[i - 1];
            const expectedHash = AuditLogger.computeEventHash(prevPartial, events[i - 1].prevHash);
            if (events[i].prevHash !== expectedHash) {
                throw new Error(`Hash chain broken between event ${i - 1} and ${i}`);
            }
        }
        await storage.close();
    });

    await runSection('Tamper detection: Alteration of historical event action, status, actor', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const logger = new AuditLogger(storage);

        for (let i = 0; i < 5; i++) {
            await logger.recordEvent({
                tenantId: 't_audit',
                actor: { type: 'user', id: `u_${i}`, name: `User ${i}` },
                action: `OP_${i}`,
                resource: { type: 'res', id: `r_${i}` },
                clientInfo: { ip: '1.2.3.4', userAgent: 'test' }
            });
        }

        const events = await storage.flushAuditEvents();
        // Modify event #2 action
        events[2].action = 'MALICIOUS_OP';
        const { prevHash: _, ...prevPartial } = events[2];
        const recomputedHash = AuditLogger.computeEventHash(prevPartial, events[2].prevHash);
        if (events[3].prevHash === recomputedHash) {
            throw new Error('Chain failed to detect action modification');
        }
        await storage.close();
    });

    await runSection('Tamper detection flaw check: Historical event metadata modification', async (recordVuln) => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const logger = new AuditLogger(storage);

        await logger.recordEvent({
            tenantId: 't_meta',
            actor: { type: 'user', id: 'u_1', name: 'User 1' },
            action: 'LLM_PROMPT',
            resource: { type: 'model', id: 'gpt-4o' },
            clientInfo: { ip: '1.2.3.4', userAgent: 'curl' },
            metadata: { originalPrompt: 'harmless question', costUsd: 0.05 }
        });

        await logger.recordEvent({
            tenantId: 't_meta',
            actor: { type: 'user', id: 'u_2', name: 'User 2' },
            action: 'LLM_RESPONSE',
            resource: { type: 'model', id: 'gpt-4o' },
            clientInfo: { ip: '1.2.3.4', userAgent: 'curl' }
        });

        const events = await storage.flushAuditEvents();

        // Attacker alters metadata of event #0
        events[0].metadata = { originalPrompt: 'CONFIDENTIAL EXFILTRATION', costUsd: 0.00 };

        const { prevHash: _, ...prevPartial } = events[0];
        const recomputedHash = AuditLogger.computeEventHash(prevPartial, events[0].prevHash);

        if (events[1].prevHash === recomputedHash) {
            recordVuln('AuditLogger.computeEventHash omits `metadata`, allowing historical metadata tampering without breaking the hash chain');
        }
        await storage.close();
    });

    console.log('\n===================================================================');
    console.log(` Summary: ${results.filter(r => r.passed).length}/${results.length} test sections executed cleanly.`);
    const vulns = results.filter(r => r.vulnerabilityDetected);
    console.log(` Vulnerabilities / Logic Flaws Discovered: ${vulns.length}`);
    for (const v of vulns) {
        console.log(`   - [${v.name}]: ${v.vulnerabilityNote}`);
    }
    console.log('===================================================================');
}

main().catch(console.error);
