/**
 * OpenClaw Gateway AAA Suite — Top-Level Entrypoint & Singleton Registry
 * Central orchestrator for Authentication, Authorization, Accounting, and Storage.
 */

import { AAAConfig, loadAAAConfig } from './config';
import { AAAStorageBackend } from './storage/interface';
import { MemoryStorageBackend } from './storage/memoryStorage';
import { KeyManager } from './authn/keyManager';
import { OIDCValidator } from './authn/oidcValidator';
import { MTLSExtractor } from './authn/mtlsExtractor';
import { PolicyEngine } from './authz/policyEngine';
import { ConsumerRateLimiter } from './autha/consumerRateLimiter';
import { QuotaManager } from './autha/quotaManager';
import { AuditLogger } from './autha/auditLogger';

// Re-export all submodules and contracts
export * from './types';
export * from './config';
export * from './storage/interface';
export * from './storage/memoryStorage';
export * from './authn/keyManager';
export * from './authn/keyMigration';
export * from './authn/oidcValidator';
export * from './authn/mtlsExtractor';
export * from './authn/authnMiddleware';
export * from './authz/permissions';
export * from './authz/policyEngine';
export * from './authz/modelGovernance';
export * from './authz/authzMiddleware';
export * from './autha/consumerRateLimiter';
export * from './autha/quotaManager';
export * from './autha/auditLogger';
export * from './autha/exporters/syslogExporter';
export * from './autha/exporters/otlpExporter';
export * from './autha/exporters/webhookExporter';
export * from './routes/index';

export class AAASuite {
    private static instance?: AAASuite;

    public readonly config: AAAConfig;
    public readonly storage: AAAStorageBackend;
    public readonly oidcValidator: OIDCValidator;
    public readonly mtlsExtractor: MTLSExtractor;
    public readonly policyEngine: PolicyEngine;
    public readonly rateLimiter: ConsumerRateLimiter;
    public readonly quotaManager: QuotaManager;
    public readonly auditLogger: AuditLogger;

    private constructor(config?: AAAConfig, storage?: AAAStorageBackend) {
        this.config = config || loadAAAConfig();
        this.storage = storage || new MemoryStorageBackend();
        this.oidcValidator = new OIDCValidator(this.config);
        this.mtlsExtractor = new MTLSExtractor(this.config);
        this.policyEngine = new PolicyEngine();
        this.rateLimiter = new ConsumerRateLimiter(this.storage);
        this.quotaManager = new QuotaManager(this.storage);
        this.auditLogger = new AuditLogger(this.storage);
    }

    public static getInstance(): AAASuite {
        if (!AAASuite.instance) {
            AAASuite.instance = new AAASuite();
        }
        return AAASuite.instance;
    }

    public async init(): Promise<void> {
        await this.storage.init();
    }

    public async close(): Promise<void> {
        await this.storage.close();
    }
}
