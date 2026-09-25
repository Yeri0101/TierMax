/**
 * OpenClaw Gateway AAA Suite — HMAC-SHA256 Signed Webhook Exporter
 * Dispatches audit batches to customer SIEM webhooks with cryptographic signature.
 */

import crypto from 'node:crypto';
import { AuditEvent } from '../../types';
import { AAAConfig } from '../../config';

export class WebhookExporter {
    private config: AAAConfig;

    constructor(config: AAAConfig) {
        this.config = config;
    }

    /**
     * Compute HMAC-SHA256 signature for payload
     */
    public signPayload(payloadString: string, secret: string): string {
        return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
    }

    /**
     * Export events to configured webhook endpoint
     */
    public async exportEvents(events: AuditEvent[]): Promise<void> {
        if (!this.config.siemWebhookUrl || events.length === 0) return;

        const payload = JSON.stringify({
            timestamp: new Date().toISOString(),
            batchSize: events.length,
            events
        });

        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (this.config.siemWebhookSecret) {
            headers['X-OpenClaw-Signature'] = this.signPayload(payload, this.config.siemWebhookSecret);
        }

        try {
            await fetch(this.config.siemWebhookUrl, {
                method: 'POST',
                headers,
                body: payload
            });
        } catch (err) {
            console.error('[AAA WebhookExporter] Failed to dispatch webhook batch:', err);
        }
    }
}
