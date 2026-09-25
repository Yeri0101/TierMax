/**
 * OpenClaw Gateway AAA Suite — Immutable Audit Logger
 * Formats structured audit records with optional cryptographic SHA-256 hash chaining.
 */

import crypto from 'node:crypto';
import { AuditEvent, AuditSeverity, AuditStatus, ActorType } from '../types';
import { AAAStorageBackend } from '../storage/interface';

/**
 * Recursively sort object keys for deterministic canonical JSON serialization
 */
function canonicalize(value: unknown): unknown {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
        const val = (value as Record<string, unknown>)[key];
        if (val !== undefined) {
            result[key] = canonicalize(val);
        }
    }
    return result;
}

export class AuditLogger {
    private storage: AAAStorageBackend;
    private lastEventHash: string | undefined;

    constructor(storage: AAAStorageBackend) {
        this.storage = storage;
    }

    /**
     * Compute SHA-256 hash of an audit event for cryptographic chaining.
     * Enforces canonical deterministic serialization of all fields including
     * clientInfo, severity, and metadata to prevent undetectable tampering.
     */
    public static computeEventHash(event: Omit<AuditEvent, 'prevHash'>, prevHash?: string): string {
        const canonicalPayload = canonicalize({
            action: event.action,
            actor: event.actor,
            clientInfo: event.clientInfo,
            id: event.id,
            metadata: event.metadata ?? {},
            prevHash: prevHash || 'GENESIS',
            resource: event.resource,
            severity: event.severity || 'INFO',
            status: event.status || 'SUCCESS',
            tenantId: event.tenantId,
            timestamp: event.timestamp
        });
        const payload = JSON.stringify(canonicalPayload);
        return crypto.createHash('sha256').update(payload).digest('hex');
    }

    /**
     * Create and record a new audit event
     */
    public async recordEvent(params: {
        tenantId: string;
        actor: { type: ActorType; id: string; name: string };
        action: string;
        resource: { type: string; id: string };
        clientInfo: { ip: string; userAgent: string };
        status?: AuditStatus;
        severity?: AuditSeverity;
        metadata?: Record<string, unknown>;
    }): Promise<AuditEvent> {
        const id = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        const partialEvent: Omit<AuditEvent, 'prevHash'> = {
            id,
            timestamp,
            tenantId: params.tenantId,
            actor: params.actor,
            action: params.action,
            resource: params.resource,
            clientInfo: params.clientInfo,
            status: params.status || 'SUCCESS',
            severity: params.severity || 'INFO',
            metadata: params.metadata
        };

        const prevHash = this.lastEventHash;
        const currentHash = AuditLogger.computeEventHash(partialEvent, prevHash);
        this.lastEventHash = currentHash;

        const event: AuditEvent = {
            ...partialEvent,
            prevHash
        };

        await this.storage.enqueueAuditEvents([event]);
        return event;
    }
}
