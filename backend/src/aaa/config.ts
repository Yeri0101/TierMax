/**
 * OpenClaw Gateway AAA Suite — Configuration Loader & Defaults
 */

export interface AAAConfig {
    // Storage
    storageBackend: 'memory' | 'redis' | 'sql' | 'hybrid';
    redisUrl: string;
    redisKeyPrefix: string;

    // OIDC / Enterprise SSO
    oidcEnabled: boolean;
    oidcIssuerUrl: string;
    oidcAudience: string;
    oidcJwksCacheTtlSeconds: number;

    // Mutual TLS (mTLS)
    mtlsEnabled: boolean;
    mtlsMode: 'socket' | 'header';
    mtlsHeaderName: string;
    mtlsCertFingerprintHeader: string;

    // Consumer Rate Limiting Defaults
    defaultConsumerRpm: number;
    defaultConsumerTpm: number;
    defaultMaxConcurrency: number;

    // Audit Logging & SIEM Exporters
    auditLogEnabled: boolean;
    auditLogTamperChain: boolean;
    siemExporterType: 'none' | 'syslog' | 'otlp' | 'webhook' | 'multi';
    siemSyslogHost?: string;
    siemSyslogPort?: number;
    siemSyslogProtocol?: 'tcp' | 'udp' | 'tls';
    siemWebhookUrl?: string;
    siemWebhookSecret?: string;
}

export function loadAAAConfig(): AAAConfig {
    const backendEnv = process.env.AAA_STORAGE_BACKEND?.toLowerCase();
    const storageBackend: AAAConfig['storageBackend'] =
        backendEnv === 'redis' || backendEnv === 'sql' || backendEnv === 'hybrid'
            ? backendEnv
            : 'memory';

    const siemEnv = process.env.SIEM_EXPORTER_TYPE?.toLowerCase();
    const siemExporterType: AAAConfig['siemExporterType'] =
        siemEnv === 'syslog' || siemEnv === 'otlp' || siemEnv === 'webhook' || siemEnv === 'multi'
            ? siemEnv
            : 'none';

    return {
        storageBackend,
        redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
        redisKeyPrefix: process.env.REDIS_KEY_PREFIX || 'openclaw:aaa:',

        oidcEnabled: process.env.OIDC_ENABLED === 'true',
        oidcIssuerUrl: process.env.OIDC_ISSUER_URL || '',
        oidcAudience: process.env.OIDC_AUDIENCE || 'openclaw-gateway',
        oidcJwksCacheTtlSeconds: parseInt(process.env.OIDC_JWKS_CACHE_TTL_SEC || '3600', 10),

        mtlsEnabled: process.env.MTLS_ENABLED === 'true',
        mtlsMode: process.env.MTLS_MODE === 'socket' ? 'socket' : 'header',
        mtlsHeaderName: process.env.MTLS_HEADER_NAME || 'x-forwarded-client-cert',
        mtlsCertFingerprintHeader: process.env.MTLS_CERT_FINGERPRINT_HEADER || 'x-client-cert-sha256',

        defaultConsumerRpm: parseInt(process.env.DEFAULT_CONSUMER_RPM || '120', 10),
        defaultConsumerTpm: parseInt(process.env.DEFAULT_CONSUMER_TPM || '100000', 10),
        defaultMaxConcurrency: parseInt(process.env.DEFAULT_MAX_CONCURRENCY || '10', 10),

        auditLogEnabled: process.env.AUDIT_LOG_ENABLED !== 'false',
        auditLogTamperChain: process.env.AUDIT_LOG_TAMPER_CHAIN !== 'false',
        siemExporterType,
        siemSyslogHost: process.env.SIEM_SYSLOG_HOST,
        siemSyslogPort: process.env.SIEM_SYSLOG_PORT ? parseInt(process.env.SIEM_SYSLOG_PORT, 10) : 514,
        siemSyslogProtocol: (process.env.SIEM_SYSLOG_PROTOCOL as 'tcp' | 'udp' | 'tls') || 'tls',
        siemWebhookUrl: process.env.SIEM_WEBHOOK_URL,
        siemWebhookSecret: process.env.SIEM_WEBHOOK_SECRET
    };
}
