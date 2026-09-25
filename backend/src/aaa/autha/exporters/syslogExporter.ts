/**
 * OpenClaw Gateway AAA Suite — RFC 5424 Syslog Exporter
 * Exports structured audit events over TLS, TCP, or UDP syslog.
 */

import { AuditEvent } from '../../types';
import { AAAConfig } from '../../config';

export class SyslogExporter {
    private config: AAAConfig;

    constructor(config: AAAConfig) {
        this.config = config;
    }

    /**
     * Format an AuditEvent according to RFC 5424 Syslog header and structured data
     */
    public formatRfc5424(event: AuditEvent): string {
        const pri = '<134>'; // facility: local0 (16), severity: info (6) -> 16*8 + 6 = 134
        const version = '1';
        const timestamp = event.timestamp;
        const hostname = 'openclaw-gateway';
        const appName = 'aaa-audit';
        const procId = process.pid.toString();
        const msgId = event.action;
        const structuredData = `[openclaw@5424 id="${event.id}" tenant="${event.tenantId}" status="${event.status}"]`;
        const msg = JSON.stringify(event);

        return `${pri}${version} ${timestamp} ${hostname} ${appName} ${procId} ${msgId} ${structuredData} ${msg}`;
    }

    /**
     * Export events to syslog sink
     */
    public async exportEvents(events: AuditEvent[]): Promise<void> {
        if (!this.config.siemSyslogHost || events.length === 0) return;
        // Network socket dispatch will be implemented in M5
    }
}
