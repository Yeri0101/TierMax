/**
 * Adversarial Runtime Test Suite: Immutable Audit Logger & Cryptographic Hash Chaining
 * Tests AuditLogger event generation, hash chain integrity, and tamper detection.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogger } from '../../../backend/src/aaa/autha/auditLogger';
import { MemoryStorageBackend } from '../../../backend/src/aaa/storage/memoryStorage';
import { AuditEvent } from '../../../backend/src/aaa/types';

/**
 * Independent Chain Verification Oracle
 * Traverses an array of audit events and verifies that each event's prevHash
 * matches the cryptographic SHA-256 hash of its predecessor.
 */
function verifyAuditChain(events: AuditEvent[]): {
    valid: boolean;
    brokenIndex?: number;
    reason?: string;
} {
    if (events.length === 0) return { valid: true };

    for (let i = 0; i < events.length; i++) {
        const currentEvent = events[i];

        if (i === 0) {
            // Genesis event: prevHash should be undefined
            if (currentEvent.prevHash !== undefined) {
                return {
                    valid: false,
                    brokenIndex: 0,
                    reason: `Genesis event must have undefined prevHash, got: ${currentEvent.prevHash}`
                };
            }
        } else {
            const previousEvent = events[i - 1];
            // Compute expected hash of the previous event
            const { prevHash: _, ...previousPartial } = previousEvent;
            const expectedHash = AuditLogger.computeEventHash(previousPartial, previousEvent.prevHash);

            if (currentEvent.prevHash !== expectedHash) {
                return {
                    valid: false,
                    brokenIndex: i,
                    reason: `Chain broken at event [${i}] (ID: ${currentEvent.id}): prevHash "${currentEvent.prevHash}" does not match computed hash of event [${i - 1}] "${expectedHash}"`
                };
            }
        }
    }

    return { valid: true };
}

describe('Adversarial Test Suite: AuditLogger Event Generation & Hash Chaining', () => {
    test('1.1 Sequential Event Recording & Cryptographic Chaining', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const logger = new AuditLogger(storage);

        const eventCount = 10;
        const recorded: AuditEvent[] = [];

        for (let i = 0; i < eventCount; i++) {
            const event = await logger.recordEvent({
                tenantId: `tenant_${i % 2}`,
                actor: { type: 'api_key', id: `actor_${i}`, name: `Actor ${i}` },
                action: i === 0 ? 'SYSTEM_BOOT' : `ACTION_${i}`,
                resource: { type: 'gateway_key', id: `res_${i}` },
                clientInfo: { ip: `10.0.0.${i}`, userAgent: 'test-agent' },
                status: i % 3 === 0 ? 'DENIED' : 'SUCCESS',
                severity: i % 4 === 0 ? 'WARNING' : 'INFO',
                metadata: { step: i, flag: `val_${i}` }
            });
            recorded.push(event);
        }

        // Verify storage flushed queue contains all 10 events
        const flushed = await storage.flushAuditEvents();
        assert.equal(flushed.length, eventCount);

        // Genesis event verification
        assert.equal(flushed[0].prevHash, undefined, 'Genesis event prevHash must be undefined');

        // Every subsequent event must point to hash of previous event
        for (let i = 1; i < flushed.length; i++) {
            const prev = flushed[i - 1];
            const curr = flushed[i];
            const { prevHash: _, ...prevPartial } = prev;
            const expectedHash = AuditLogger.computeEventHash(prevPartial, prev.prevHash);
            assert.equal(curr.prevHash, expectedHash, `Event [${i}] prevHash must match hash of event [${i - 1}]`);
        }

        // Independent oracle must confirm chain validity
        const verification = verifyAuditChain(flushed);
        assert.equal(verification.valid, true, 'Untouched chain must pass verification');

        await storage.close();
    });

    test('1.2 Tamper Detection: Core Field Alteration (Action / Status / Actor / Resource)', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const logger = new AuditLogger(storage);

        for (let i = 0; i < 5; i++) {
            await logger.recordEvent({
                tenantId: 't_security',
                actor: { type: 'user', id: `user_${i}`, name: `User ${i}` },
                action: `USER_OP_${i}`,
                resource: { type: 'model', id: 'gpt-4o' },
                clientInfo: { ip: '192.168.1.1', userAgent: 'Mozilla' },
                status: 'SUCCESS',
                severity: 'INFO'
            });
        }

        const events = await storage.flushAuditEvents();

        // 1. Tamper with Action of Event #2: change USER_OP_2 to ADMIN_PRIVILEGE_ESCALATE
        const tamperedActionEvents: AuditEvent[] = JSON.parse(JSON.stringify(events));
        tamperedActionEvents[2].action = 'ADMIN_PRIVILEGE_ESCALATE';
        const actionResult = verifyAuditChain(tamperedActionEvents);
        assert.equal(actionResult.valid, false, 'Action tampering must be detected');
        assert.equal(actionResult.brokenIndex, 3, 'Chain must break at link pointing to tampered event');

        // 2. Tamper with Status of Event #1: change SUCCESS to DENIED
        const tamperedStatusEvents: AuditEvent[] = JSON.parse(JSON.stringify(events));
        tamperedStatusEvents[1].status = 'DENIED';
        const statusResult = verifyAuditChain(tamperedStatusEvents);
        assert.equal(statusResult.valid, false, 'Status tampering must be detected');
        assert.equal(statusResult.brokenIndex, 2);

        // 3. Tamper with Actor ID of Event #3
        const tamperedActorEvents: AuditEvent[] = JSON.parse(JSON.stringify(events));
        tamperedActorEvents[3].actor.id = 'imposter_id';
        const actorResult = verifyAuditChain(tamperedActorEvents);
        assert.equal(actorResult.valid, false, 'Actor tampering must be detected');
        assert.equal(actorResult.brokenIndex, 4);

        // 4. Tamper with Resource ID of Event #0 (Genesis event)
        const tamperedResourceEvents: AuditEvent[] = JSON.parse(JSON.stringify(events));
        tamperedResourceEvents[0].resource.id = 'tampered_resource';
        const genesisResult = verifyAuditChain(tamperedResourceEvents);
        assert.equal(genesisResult.valid, false, 'Genesis event tampering must break chain at event 1');
        assert.equal(genesisResult.brokenIndex, 1);

        await storage.close();
    });

    test('1.3 Tamper Detection: Event Deletion and Reordering Break Hash Chain', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const logger = new AuditLogger(storage);

        for (let i = 0; i < 6; i++) {
            await logger.recordEvent({
                tenantId: 't_chain',
                actor: { type: 'system', id: 'sys', name: 'System' },
                action: `TX_${i}`,
                resource: { type: 'record', id: `rec_${i}` },
                clientInfo: { ip: '127.0.0.1', userAgent: 'test' }
            });
        }

        const events = await storage.flushAuditEvents();

        // 1. Delete Event #2 from middle of chain
        const deletedEvents: AuditEvent[] = JSON.parse(JSON.stringify(events));
        deletedEvents.splice(2, 1); // remove event #2
        const deleteResult = verifyAuditChain(deletedEvents);
        assert.equal(deleteResult.valid, false, 'Event deletion must break chain');
        assert.equal(deleteResult.brokenIndex, 2, 'Chain must break at the position of deleted event');

        // 2. Swap Event #2 and Event #3
        const swappedEvents: AuditEvent[] = JSON.parse(JSON.stringify(events));
        const temp = swappedEvents[2];
        swappedEvents[2] = swappedEvents[3];
        swappedEvents[3] = temp;
        const swapResult = verifyAuditChain(swappedEvents);
        assert.equal(swapResult.valid, false, 'Event reordering must break chain');

        await storage.close();
    });

    test('1.4 CRITICAL ADVERSARIAL FINDING: Tampering Historical Event Metadata is NOT Detected', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const logger = new AuditLogger(storage);

        // Record events with sensitive metadata
        await logger.recordEvent({
            tenantId: 't_compliance',
            actor: { type: 'user', id: 'auditor_1', name: 'Auditor' },
            action: 'POLICY_EVALUATED',
            resource: { type: 'policy', id: 'pol_strict' },
            clientInfo: { ip: '203.0.113.50', userAgent: 'Chrome' },
            metadata: {
                originalQuery: 'SELECT * FROM users',
                costUsd: 45.50,
                tamperFlag: 'ORIGINAL_INTEGRITY'
            }
        });

        await logger.recordEvent({
            tenantId: 't_compliance',
            actor: { type: 'user', id: 'auditor_2', name: 'Auditor 2' },
            action: 'REPORT_GENERATED',
            resource: { type: 'report', id: 'rep_monthly' },
            clientInfo: { ip: '203.0.113.51', userAgent: 'Chrome' },
            metadata: { generatedAt: '2026-09-25T00:00:00Z' }
        });

        const events = await storage.flushAuditEvents();

        // Adversarial Attack: Attacker modifies metadata of historical event #0
        // e.g. changes costUsd from 45.50 to 0.00 and alters originalQuery
        const tamperedMetadataEvents: AuditEvent[] = JSON.parse(JSON.stringify(events));
        tamperedMetadataEvents[0].metadata = {
            originalQuery: 'BENIGN_SELECT_NOTHING',
            costUsd: 0.00,
            tamperFlag: 'TAMPERED_BY_ATTACKER'
        };

        // Run chain verification oracle:
        const chainResult = verifyAuditChain(tamperedMetadataEvents);

        // Verify cryptographic tamper detection:
        // AuditLogger.computeEventHash deterministically canonicalizes and hashes
        // id, timestamp, tenantId, actor, action, resource, status, clientInfo, severity, metadata, and prevHash.
        // Therefore, any modification to metadata breaks the hash chain and is detected!
        assert.equal(chainResult.valid, false, 'Cryptographic chain verification MUST detect metadata tampering');
        assert.equal(chainResult.brokenIndex, 1, 'Chain must break at the successor event of the tampered event');

        await storage.close();
    });

    test('1.5 Cryptographic Tamper Detection: Tampering ClientInfo and Severity Breaks Chain', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();
        const logger = new AuditLogger(storage);

        await logger.recordEvent({
            tenantId: 't_siem',
            actor: { type: 'api_key', id: 'key_compromised', name: 'Exfiltrator' },
            action: 'DATA_EXFILTRATION_DETECTED',
            resource: { type: 'data_store', id: 'customer_pii' },
            clientInfo: { ip: '198.51.100.222', userAgent: 'sqlmap/1.5' },
            severity: 'CRITICAL',
            status: 'DENIED'
        });

        await logger.recordEvent({
            tenantId: 't_siem',
            actor: { type: 'system', id: 'soc_bot', name: 'SOC Bot' },
            action: 'INCIDENT_TICKET_OPENED',
            resource: { type: 'incident', id: 'inc_999' },
            clientInfo: { ip: '10.0.0.1', userAgent: 'internal-service' },
            severity: 'INFO',
            status: 'SUCCESS'
        });

        const events = await storage.flushAuditEvents();

        // Attack: Attacker alters attacker IP to an innocent IP and downgrades CRITICAL to INFO
        const tamperedEvents: AuditEvent[] = JSON.parse(JSON.stringify(events));
        tamperedEvents[0].clientInfo.ip = '127.0.0.1'; // Spoofed IP
        tamperedEvents[0].clientInfo.userAgent = 'Legitimate_App/1.0';
        tamperedEvents[0].severity = 'INFO'; // Downgraded severity

        const result = verifyAuditChain(tamperedEvents);

        // Verification must detect clientInfo and severity tampering and break the hash chain
        assert.equal(result.valid, false, 'Cryptographic chain verification MUST detect clientInfo and severity tampering');
        assert.equal(result.brokenIndex, 1, 'Chain must break at event [1] when event [0] is tampered');

        await storage.close();
    });
});
