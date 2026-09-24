import { supabase } from '../db';
import { canPassCircuit, recordCircuitSuccess, recordCircuitFailure } from './circuitBreaker';
import { dispatchAlert } from './alertDispatcher';

/**
 * OpenClaw Gateway — Background Health Prober
 * 
 * Periodically verifies upstream keys via lightweight probes.
 * Preemptively detects dead keys, quota outages, and expired tokens
 * before users experience latency hangs.
 */

let isProbing = false;

export async function probeUpstreamHealth(): Promise<{ probed: number; healthy: number; failed: number }> {
    if (isProbing) return { probed: 0, healthy: 0, failed: 0 };
    isProbing = true;

    let probed = 0;
    let healthy = 0;
    let failed = 0;

    try {
        const { data: keys, error } = await supabase
            .from('upstream_keys')
            .select('id, provider, api_key');

        if (error || !keys) {
            isProbing = false;
            return { probed, healthy, failed };
        }

        // Limit probe concurrency to 5 parallel requests
        for (const key of keys) {
            probed++;
            const provider = key.provider || 'unknown';

            // Skip probing offline/custom or unsupported probe providers
            if (['zettacore', 'brave'].includes(provider)) continue;

            const isOk = await probeSingleKey(key);
            if (isOk) {
                healthy++;
                recordCircuitSuccess(key.id);
            } else {
                failed++;
                const { tripped } = recordCircuitFailure(key.id, provider, 'Background health probe failed');
                if (tripped) {
                    dispatchAlert({
                        event: 'circuit_trip',
                        title: `Key Tripped: ${provider.toUpperCase()}`,
                        message: `Upstream key ${key.id.substring(0, 8)} (${provider}) failed health probe and has been placed in cooldown quarantine.`,
                        level: 'warning',
                        metadata: { key_id: key.id, provider }
                    });
                }
            }
        }
    } catch (err: any) {
        console.error('[HealthProber] Run error:', err.message);
    } finally {
        isProbing = false;
    }

    return { probed, healthy, failed };
}

async function probeSingleKey(key: any): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4s strict probe timeout

    try {
        let probeUrl = '';
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key.api_key}`
        };

        if (key.provider === 'groq') {
            probeUrl = 'https://api.groq.com/openai/v1/models';
        } else if (key.provider === 'mistral') {
            probeUrl = 'https://api.mistral.ai/v1/models';
        } else if (key.provider === 'deepseek') {
            probeUrl = 'https://api.deepseek.com/models';
        } else if (key.provider === 'openrouter') {
            probeUrl = 'https://openrouter.ai/api/v1/auth/key';
        } else if (key.provider === 'mimo') {
            probeUrl = 'https://api.xiaomimimo.com/v1/models';
        } else if (key.provider === 'ollama' || key.provider === 'local') {
            probeUrl = `${key.base_url || 'http://localhost:11434'}/api/tags`;
            delete headers.Authorization;
        } else {
            // For other providers, assume healthy if active
            clearTimeout(timeout);
            return true;
        }

        const res = await fetch(probeUrl, {
            method: 'GET',
            headers,
            signal: controller.signal
        });

        clearTimeout(timeout);
        return res.ok || res.status === 200 || res.status === 404; // 404 on models still indicates server is reachable
    } catch {
        clearTimeout(timeout);
        return false;
    }
}
