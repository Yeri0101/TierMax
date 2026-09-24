/**
 * OpenClaw Gateway — High-Resilience Circuit Breaker
 * 
 * Prevents cascade latencies when an upstream provider or key degrades.
 * 
 * States:
 * - CLOSED: Normal healthy operation. All requests pass through.
 * - OPEN: Key is failing. All requests bypass this key immediately (0ms failover).
 * - HALF_OPEN: Trial period after cooldown. Allows a single canary request to test recovery.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitRecord {
    keyId: string;
    provider: string;
    state: CircuitState;
    consecutiveFailures: number;
    lastFailureTime: number;
    cooldownUntil: number;
    totalTrips: number;
    lastErrorReason?: string;
}

const FAILURE_THRESHOLD = 2; // Trip after 2 consecutive severe failures
const DEFAULT_COOLDOWN_MS = 60_000; // 60 seconds quarantine

const circuits = new Map<string, CircuitRecord>();

/**
 * Checks whether the upstream key is allowed to receive traffic.
 */
export function canPassCircuit(keyId: string): boolean {
    const record = circuits.get(keyId);
    if (!record || record.state === 'CLOSED') {
        return true;
    }

    const now = Date.now();
    if (record.state === 'OPEN') {
        if (now >= record.cooldownUntil) {
            record.state = 'HALF_OPEN';
            return true; // Allow trial canary request
        }
        return false; // Still in quarantine
    }

    if (record.state === 'HALF_OPEN') {
        return true;
    }

    return true;
}

/**
 * Records a successful response, resetting the circuit to CLOSED.
 */
export function recordCircuitSuccess(keyId: string): void {
    const record = circuits.get(keyId);
    if (!record) return;

    if (record.state === 'HALF_OPEN' || record.consecutiveFailures > 0) {
        const ts = new Date().toISOString();
        console.log(`[${ts}] [CircuitBreaker] Key ${keyId.substring(0, 8)} (${record.provider}) RECOVERED -> CLOSED.`);
    }

    record.state = 'CLOSED';
    record.consecutiveFailures = 0;
    record.lastErrorReason = undefined;
}

/**
 * Records an upstream failure (429, 5xx, or network abort).
 */
export function recordCircuitFailure(keyId: string, provider: string, reason: string): { tripped: boolean; cooldownMs: number } {
    let record = circuits.get(keyId);
    const now = Date.now();

    if (!record) {
        record = {
            keyId,
            provider,
            state: 'CLOSED',
            consecutiveFailures: 0,
            lastFailureTime: now,
            cooldownUntil: 0,
            totalTrips: 0,
        };
        circuits.set(keyId, record);
    }

    record.consecutiveFailures++;
    record.lastFailureTime = now;
    record.lastErrorReason = reason;

    // Trip if threshold exceeded or if already in trial HALF_OPEN state
    if (record.consecutiveFailures >= FAILURE_THRESHOLD || record.state === 'HALF_OPEN') {
        record.state = 'OPEN';
        record.cooldownUntil = now + DEFAULT_COOLDOWN_MS;
        record.totalTrips++;
        const ts = new Date().toISOString();
        console.warn(`[${ts}] [CircuitBreaker] ⚠️ TRIPPED -> OPEN for key ${keyId.substring(0, 8)} (${provider}). Reason: "${reason}". Cooldown: 60s.`);
        return { tripped: true, cooldownMs: DEFAULT_COOLDOWN_MS };
    }

    return { tripped: false, cooldownMs: 0 };
}

/**
 * Returns diagnostic snapshot of all circuits.
 */
export function getCircuitDiagnostics(): CircuitRecord[] {
    return Array.from(circuits.values());
}
