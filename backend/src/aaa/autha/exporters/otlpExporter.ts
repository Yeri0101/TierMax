/**
 * OpenClaw Gateway AAA Suite — OpenTelemetry (OTel) Exporter
 * Exports audit events as structured OTLP JSON log records.
 */

import { AuditEvent } from '../../types';
import { AAAConfig } from '../../config';

export class OtlpExporter {
    private config: AAAConfig;

    constructor(config: AAAConfig) {
        this.config = config;
    }

    /**
     * Map AuditEvent to OTLP LogRecord format
     */
    public toOtlpRecord(event: AuditEvent): Record<string, unknown> {
        return {
            timeUnixNano: (new Date(event.timestamp).getTime() * 1_000_000).toString(),
            severityText: event.severity,
            body: { stringValue: event.action },
            attributes: [
                { key: 'tenant.id', value: { stringValue: event.tenantId } },
                { key: 'actor.id', value: { stringValue: event.actor.id } },
                { key: 'actor.type', value: { stringValue: event.actor.type } },
                { key: 'resource.id', value: { stringValue: event.resource.id } },
                { key: 'resource.type', value: { stringValue: event.resource.type } },
                { key: 'client.ip', value: { stringValue: event.clientInfo.ip } },
                { key: 'status', value: { stringValue: event.status } }
            ]
        };
    }

    public async exportEvents(events: AuditEvent[]): Promise<void> {
        if (this.config.siemExporterType !== 'otlp' || events.length === 0) return;
        // OTLP HTTP post dispatch in M5
    }
}
