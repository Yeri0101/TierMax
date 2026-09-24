/**
 * OpenClaw Gateway — Proactive Alert Dispatcher
 * 
 * Supports notifications to:
 * - Discord Webhooks (DISCORD_WEBHOOK_URL)
 * - Telegram Bot (TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID)
 * - Generic JSON Webhook (ALERT_WEBHOOK_URL)
 */

export interface AlertPayload {
    event: 'circuit_trip' | 'budget_warning' | 'quota_exhausted' | 'provider_down';
    title: string;
    message: string;
    level: 'info' | 'warning' | 'critical';
    metadata?: Record<string, any>;
}

// Throttle identical alerts to avoid spamming webhooks (1 alert per event key every 5 mins)
const alertThrottle = new Map<string, number>();
const THROTTLE_MS = 5 * 60_000;

export async function dispatchAlert(payload: AlertPayload): Promise<void> {
    const throttleKey = `${payload.event}:${payload.title}`;
    const now = Date.now();
    const lastSent = alertThrottle.get(throttleKey);
    if (lastSent && now - lastSent < THROTTLE_MS) {
        return; // Suppress duplicate alert within window
    }
    alertThrottle.set(throttleKey, now);

    const ts = new Date().toISOString();
    console.log(`[${ts}] [AlertDispatcher] 📢 Dispatching ${payload.level.toUpperCase()} alert: ${payload.title}`);

    const tasks: Promise<any>[] = [];

    // 1. Discord Webhook
    const discordUrl = process.env.DISCORD_WEBHOOK_URL;
    if (discordUrl) {
        const color = payload.level === 'critical' ? 0xff0000 : payload.level === 'warning' ? 0xffaa00 : 0x00ff88;
        tasks.push(
            fetch(discordUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: `[OpenClaw Alert] ${payload.title}`,
                        description: payload.message,
                        color,
                        timestamp: ts,
                        fields: payload.metadata ? Object.entries(payload.metadata).map(([k, v]) => ({ name: k, value: String(v), inline: true })) : []
                    }]
                })
            }).catch(err => console.error('[AlertDispatcher] Discord dispatch failed:', err.message))
        );
    }

    // 2. Telegram Bot
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChatId = process.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChatId) {
        const icon = payload.level === 'critical' ? '🚨' : payload.level === 'warning' ? '⚠️' : 'ℹ️';
        const text = `${icon} *OpenClaw Gateway Alert*\n*${payload.title}*\n${payload.message}\n_Time: ${ts}_`;
        tasks.push(
            fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: tgChatId,
                    text,
                    parse_mode: 'Markdown'
                })
            }).catch(err => console.error('[AlertDispatcher] Telegram dispatch failed:', err.message))
        );
    }

    // 3. Generic Alert Webhook
    const genericWebhook = process.env.ALERT_WEBHOOK_URL;
    if (genericWebhook) {
        tasks.push(
            fetch(genericWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...payload,
                    timestamp: ts,
                    source: 'openclaw-gateway'
                })
            }).catch(err => console.error('[AlertDispatcher] Webhook dispatch failed:', err.message))
        );
    }

    await Promise.allSettled(tasks);
}
