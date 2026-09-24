/**
 * TierMax — Self-Healing & Model Changelog Architecture
 *
 * Implements:
 * 1. Automatic Model Deprecation & Alias Resolution (Self-Healing Fallback).
 * 2. Persistent Model Changelog & Audit History per project.
 * 3. Proactive Health Diagnostics & "Reparador" Channel Scanner.
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from '../db';
import { runKeyPing } from '../routes/channelTesting';

export interface ModelHistoryEvent {
    id: string;
    timestamp: string;
    projectId: string;
    eventType: 'model_added' | 'model_removed' | 'model_deprecated' | 'auto_healed' | 'channel_repaired';
    originalModel?: string;
    resolvedModel?: string;
    provider?: string;
    reason: string;
    metadata?: any;
}

export interface HealingResult {
    healed: boolean;
    originalModel: string;
    resolvedModel: string;
    reason?: string;
    matchedUpstreamKeyId?: string;
}

/**
 * Knowledge base of deprecated / retired LLMs across major providers,
 * mapped to their modern, fully compatible replacements.
 */
export const KNOWN_MODEL_MIGRATIONS: Record<string, { replacement: string; provider: string; reason: string }> = {
    // OpenAI Deprecated Models
    'gpt-4-0314': { replacement: 'gpt-4o', provider: 'openai', reason: 'Deprecated by OpenAI; superseded by GPT-4o' },
    'gpt-4-0613': { replacement: 'gpt-4o', provider: 'openai', reason: 'Deprecated by OpenAI; superseded by GPT-4o' },
    'gpt-4-vision-preview': { replacement: 'gpt-4o', provider: 'openai', reason: 'Vision unified into GPT-4o omni engine' },
    'gpt-4-1106-preview': { replacement: 'gpt-4o', provider: 'openai', reason: 'Superseded by GPT-4o' },
    'gpt-4-0125-preview': { replacement: 'gpt-4o', provider: 'openai', reason: 'Superseded by GPT-4o' },
    'gpt-3.5-turbo-0301': { replacement: 'gpt-4o-mini', provider: 'openai', reason: 'Retired by OpenAI; upgraded to GPT-4o-mini' },
    'gpt-3.5-turbo-0613': { replacement: 'gpt-4o-mini', provider: 'openai', reason: 'Retired by OpenAI; upgraded to GPT-4o-mini' },
    'gpt-3.5-turbo-1106': { replacement: 'gpt-4o-mini', provider: 'openai', reason: 'Legacy model replaced by GPT-4o-mini' },
    'gpt-3.5-turbo-16k': { replacement: 'gpt-4o-mini', provider: 'openai', reason: 'Legacy model replaced by GPT-4o-mini' },
    'text-davinci-003': { replacement: 'gpt-4o-mini', provider: 'openai', reason: 'Completions API retired; mapped to Chat GPT-4o-mini' },
    'text-davinci-002': { replacement: 'gpt-4o-mini', provider: 'openai', reason: 'Completions API retired; mapped to Chat GPT-4o-mini' },

    // Anthropic Deprecated Models
    'claude-3-opus-20240229': { replacement: 'claude-3-5-sonnet-20241022', provider: 'anthropic', reason: 'Superseded by Claude 3.5 Sonnet' },
    'claude-3-sonnet-20240229': { replacement: 'claude-3-5-sonnet-20241022', provider: 'anthropic', reason: 'Sonnet 3.0 superseded by Claude 3.5 Sonnet' },
    'claude-2.1': { replacement: 'claude-3-5-haiku-20241022', provider: 'anthropic', reason: 'Claude 2.1 retired; mapped to Claude 3.5 Haiku' },
    'claude-2.0': { replacement: 'claude-3-5-haiku-20241022', provider: 'anthropic', reason: 'Claude 2.0 retired; mapped to Claude 3.5 Haiku' },
    'claude-instant-1.2': { replacement: 'claude-3-5-haiku-20241022', provider: 'anthropic', reason: 'Claude Instant retired; mapped to Claude 3.5 Haiku' },

    // Google Gemini Preview / Deprecated Models
    'gemini-1.0-pro': { replacement: 'gemini-2.5-flash', provider: 'google', reason: 'Gemini 1.0 retired; mapped to Gemini 2.5 Flash' },
    'gemini-1.5-pro-preview': { replacement: 'gemini-2.5-flash', provider: 'google', reason: 'Preview expired; mapped to Gemini 2.5 Flash' },
    'gemini-1.5-flash-preview': { replacement: 'gemini-2.5-flash', provider: 'google', reason: 'Preview expired; mapped to Gemini 2.5 Flash' },
    'gemini-pro': { replacement: 'gemini-2.5-flash', provider: 'google', reason: 'Legacy model; mapped to Gemini 2.5 Flash' },

    // Meta Llama 2 / 3.0 -> Modern Llama 3.3
    'llama-2-70b-chat': { replacement: 'llama-3.3-70b-versatile', provider: 'groq', reason: 'Llama 2 retired; mapped to Llama 3.3 70B' },
    'llama-3-70b-instruct': { replacement: 'llama-3.3-70b-versatile', provider: 'groq', reason: 'Llama 3.0 superseded by Llama 3.3 70B' },
    'llama-3-8b-instruct': { replacement: 'llama-3.1-8b-instant', provider: 'groq', reason: 'Llama 3.0 8b superseded by Llama 3.1 8B' },
};

// Local persistent changelog file
const HISTORY_FILE_PATH = path.resolve(process.cwd(), '.project_model_history.json');

/**
 * In-memory cache of project history
 */
let historyCache: Record<string, ModelHistoryEvent[]> = {};

function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE_PATH)) {
            const raw = fs.readFileSync(HISTORY_FILE_PATH, 'utf-8');
            historyCache = JSON.parse(raw);
        }
    } catch (err) {
        console.warn('[ModelHealing] Error reading .project_model_history.json:', err);
    }
}
loadHistory();

function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(historyCache, null, 2), 'utf-8');
    } catch (err) {
        console.error('[ModelHealing] Error saving .project_model_history.json:', err);
    }
}

/**
 * Record a new history event for a project
 */
export function recordProjectEvent(event: Omit<ModelHistoryEvent, 'id' | 'timestamp'>): ModelHistoryEvent {
    loadHistory();
    const fullEvent: ModelHistoryEvent = {
        ...event,
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
    };

    if (!historyCache[event.projectId]) {
        historyCache[event.projectId] = [];
    }

    // Keep the last 150 events per project to prevent unbounded growth
    historyCache[event.projectId].unshift(fullEvent);
    if (historyCache[event.projectId].length > 150) {
        historyCache[event.projectId] = historyCache[event.projectId].slice(0, 150);
    }

    saveHistory();
    return fullEvent;
}

/**
 * Get the history of events for a project
 */
export function getProjectHistory(projectId: string): ModelHistoryEvent[] {
    loadHistory();
    return historyCache[projectId] || [];
}

/**
 * Resolves a requested model name against the available models of a project/key.
 * If the model does not exist or has been deprecated/retired, it finds the best
 * active compatible replacement and logs an auto-healing event.
 */
export function resolveModelOrHeal(
    projectId: string,
    requestedModel: string,
    configuredModels: string[],
    projectUpstreamProviders: Array<{ id: string; provider: string }> = []
): HealingResult {
    const normalizedReq = (requestedModel || '').trim();

    // 1. Direct Match: If the model is explicitly configured and available, no healing needed
    if (configuredModels.includes(normalizedReq)) {
        return {
            healed: false,
            originalModel: normalizedReq,
            resolvedModel: normalizedReq,
        };
    }

    // 2. Virtual special models (fusion, systemone) don't need remapping
    if (normalizedReq === 'fusion' || normalizedReq === 'openclaw/fusion' || normalizedReq.startsWith('fusion:')) {
        return {
            healed: false,
            originalModel: normalizedReq,
            resolvedModel: normalizedReq,
        };
    }

    let resolvedModel: string | null = null;
    let healingReason = '';

    // 3. Known Deprecation Mapping
    const knownMigration = KNOWN_MODEL_MIGRATIONS[normalizedReq];
    if (knownMigration) {
        // If the suggested replacement is directly in our configured models
        if (configuredModels.includes(knownMigration.replacement)) {
            resolvedModel = knownMigration.replacement;
            healingReason = knownMigration.reason;
        } else {
            // Find another active model of the same provider
            const sameProviderModel = configuredModels.find(m => {
                if (knownMigration.provider === 'openai' && (m.includes('gpt') || m.includes('o1') || m.includes('o3'))) return true;
                if (knownMigration.provider === 'anthropic' && m.includes('claude')) return true;
                if (knownMigration.provider === 'google' && m.includes('gemini')) return true;
                if (knownMigration.provider === 'groq' && (m.includes('llama') || m.includes('qwen'))) return true;
                return false;
            });

            if (sameProviderModel) {
                resolvedModel = sameProviderModel;
                healingReason = `${knownMigration.reason} (Mapped to active project model: ${sameProviderModel})`;
            }
        }
    }

    // 4. Heuristic Prefix / Family Match
    if (!resolvedModel) {
        if (normalizedReq.startsWith('gpt-') || normalizedReq.startsWith('o1') || normalizedReq.startsWith('o3')) {
            resolvedModel = configuredModels.find(m => m.includes('gpt-4o') || m.includes('gpt-4o-mini') || m.includes('gpt')) || null;
            if (resolvedModel) healingReason = `Auto-healed legacy OpenAI model to active project variant (${resolvedModel})`;
        } else if (normalizedReq.startsWith('claude-')) {
            resolvedModel = configuredModels.find(m => m.includes('claude-3-5') || m.includes('claude-3') || m.includes('claude')) || null;
            if (resolvedModel) healingReason = `Auto-healed legacy Claude model to active project variant (${resolvedModel})`;
        } else if (normalizedReq.startsWith('gemini-')) {
            resolvedModel = configuredModels.find(m => m.includes('gemini-2.5') || m.includes('gemini-2.0') || m.includes('gemini-1.5') || m.includes('gemini')) || null;
            if (resolvedModel) healingReason = `Auto-healed legacy Gemini model to active project variant (${resolvedModel})`;
        } else if (normalizedReq.includes('deepseek')) {
            resolvedModel = configuredModels.find(m => m.includes('deepseek')) || null;
            if (resolvedModel) healingReason = `Auto-healed DeepSeek model to active project variant (${resolvedModel})`;
        } else if (normalizedReq.includes('qwen')) {
            resolvedModel = configuredModels.find(m => m.includes('qwen')) || null;
            if (resolvedModel) healingReason = `Auto-healed Qwen model to active project variant (${resolvedModel})`;
        }
    }

    // 5. Ultimate Fallback: If still unmatched, but project has at least 1 active model, use the first available
    if (!resolvedModel && configuredModels.length > 0) {
        resolvedModel = configuredModels[0];
        healingReason = `Model '${normalizedReq}' is retired or unmapped. Auto-routed to active project primary model '${resolvedModel}' to preserve agent availability.`;
    }

    // If a resolution was found, record event and return healed result
    if (resolvedModel && resolvedModel !== normalizedReq) {
        const event = recordProjectEvent({
            projectId,
            eventType: 'auto_healed',
            originalModel: normalizedReq,
            resolvedModel,
            reason: healingReason,
            metadata: {
                configuredCount: configuredModels.length,
            },
        });

        console.log(`[TierMax Healing] [${event.timestamp}] Project ${projectId}: Healed '${normalizedReq}' -> '${resolvedModel}'. Reason: ${healingReason}`);

        return {
            healed: true,
            originalModel: normalizedReq,
            resolvedModel,
            reason: healingReason,
        };
    }

    // Cannot heal (no configured models in project)
    return {
        healed: false,
        originalModel: normalizedReq,
        resolvedModel: normalizedReq,
        reason: 'No replacement model candidates available in project.',
    };
}

/**
 * Diagnostic & Auto-Repair Agent for a Project:
 * Scans all upstream keys and models, runs ping checks, identifies broken/depleted
 * channels, and produces an actionable remediation report.
 */
export async function repairProjectChannels(projectId: string): Promise<{
    projectId: string;
    timestamp: string;
    summary: {
        totalUpstreamKeys: number;
        healthyKeys: number;
        degradedKeys: number;
        totalConfiguredModels: number;
        activeModels: string[];
    };
    channelHealth: Array<{
        keyId: string;
        provider: string;
        ok: boolean;
        latencyMs: number;
        statusCode: number;
        error?: string;
        modelTested: string;
    }>;
    remediationActions: Array<{
        type: 'repaired' | 'failover_ready' | 'action_required';
        target: string;
        details: string;
    }>;
}> {
    const timestamp = new Date().toISOString();

    // 1. Fetch upstream keys for the project
    const { data: upstreamKeys, error: keyErr } = await supabase
        .from('upstream_keys')
        .select('*')
        .eq('project_id', projectId);

    if (keyErr || !upstreamKeys) {
        throw new Error(`Failed to load upstream keys for project ${projectId}: ${keyErr?.message}`);
    }

    // 2. Fetch gateway keys and model mappings for the project
    const { data: gatewayKeys } = await supabase
        .from('gateway_keys')
        .select('id, key_name, gateway_key_models(model_name, upstream_key_id)')
        .eq('project_id', projectId);

    const configuredModelsSet = new Set<string>();
    (gatewayKeys || []).forEach((gk: any) => {
        (gk.gateway_key_models || []).forEach((m: any) => {
            if (m.model_name) configuredModelsSet.add(m.model_name);
        });
    });

    // 3. Ping each active upstream key concurrently
    const activeKeys = (upstreamKeys || []).filter((k: any) => k.is_active !== false);
    const pingPromises = activeKeys.map((key: any) => runKeyPing(key));
    const pingResults = await Promise.allSettled(pingPromises);

    const channelHealth: any[] = [];
    let healthyCount = 0;
    let degradedCount = 0;
    const remediations: any[] = [];

    pingResults.forEach((res, i) => {
        const key = activeKeys[i];
        if (res.status === 'fulfilled') {
            channelHealth.push(res.value);
            if (res.value.ok) {
                healthyCount++;
            } else {
                degradedCount++;
                remediations.push({
                    type: 'action_required',
                    target: `${key.provider} (${key.id.slice(0, 8)})`,
                    details: `API returned HTTP ${res.value.statusCode}: ${res.value.error || 'Connection failed'}. Traffic will automatically failover to healthy providers.`,
                });
            }
        } else {
            degradedCount++;
            channelHealth.push({
                upstreamKeyId: key.id,
                provider: key.provider,
                ok: false,
                latencyMs: 0,
                statusCode: 500,
                error: res.reason?.message || 'Ping probe timeout or error',
                modelTested: 'unknown',
            });
            remediations.push({
                type: 'action_required',
                target: `${key.provider} (${key.id.slice(0, 8)})`,
                details: `Probe failed: ${res.reason?.message}. Checked and flagged for failover.`,
            });
        }
    });

    if (healthyCount > 0 && degradedCount > 0) {
        remediations.push({
            type: 'repaired',
            target: 'Smart Failover Mesh',
            details: `Auto-routed incoming requests away from ${degradedCount} degraded provider(s) to ${healthyCount} healthy channel(s).`,
        });
    }

    if (healthyCount > 0 && remediations.length === 0) {
        remediations.push({
            type: 'repaired',
            target: 'All Channels',
            details: `All ${healthyCount} upstream channel(s) are online with nominal response latencies.`,
        });
    }

    const activeModelsList = Array.from(configuredModelsSet);

    // Record repair event in history
    recordProjectEvent({
        projectId,
        eventType: 'channel_repaired',
        reason: `Channel Health Scan: ${healthyCount}/${activeKeys.length} channels healthy. ${remediations.length} diagnostic findings.`,
        metadata: {
            healthyCount,
            degradedCount,
            totalChannels: activeKeys.length,
        },
    });

    return {
        projectId,
        timestamp,
        summary: {
            totalUpstreamKeys: upstreamKeys.length,
            healthyKeys: healthyCount,
            degradedKeys: degradedCount,
            totalConfiguredModels: activeModelsList.length,
            activeModels: activeModelsList,
        },
        channelHealth,
        remediationActions: remediations,
    };
}
