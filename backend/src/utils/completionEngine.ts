import { stream } from 'hono/streaming';
import { supabase } from '../db';
import { providerStates, updateProviderCalls, markProviderError, checkAndRecoverProvider } from './limitTracker';
import { callPuterAI, callPuterAIStream } from './puterClient';
import { buildCacheKey, getCached, setCached } from './semanticCache';
import { isProviderSlow, recordLatency, markProviderSlow, LATENCY_ABORT_TIMEOUT_MS } from './latencyGuard';
import { classifyRequest, filterCandidatesByTier, estimateTokenCount } from './smartRouter';
import {
    checkRateLimitCapacity,
    recordRateLimitConsumption,
    ingestRateLimitHeaders,
    markRateLimitExceeded,
    getOrCreateKeyState
} from './freeTierGuardian';
import { consultSystemOne } from './engineBridge';
import { resolveModelOrHeal, HealingResult } from './modelHealing';

export type UsageBreakdown = {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
};

export type PricingMatch = {
    provider: string;
    model_name: string;
    input_price_per_1m: number;
    output_price_per_1m: number;
};

export interface CompletionEngineOptions {
    body: any;
    gatewayKey: any;
    c?: any;
    returnRawStream?: boolean;
    isInternalCall?: boolean;
}

export interface CompletionEngineResult {
    ok: boolean;
    data?: any;
    rawResponse?: Response;
    status: number;
    error?: any;
    provider?: string | null;
    upstreamKeyId?: string | null;
    routingTier?: string;
    isCacheHit?: boolean;
}

// In-memory counter for round-robin load balancing
export const modelCounters: Record<string, number> = {};

export function normalizeUsage(usage: any, fallbackPromptTokens = 0): UsageBreakdown {
    const prompt_tokens = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? fallbackPromptTokens ?? 0) || 0;
    const completion_tokens = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0) || 0;
    const total_tokens = Number(usage?.total_tokens ?? (prompt_tokens + completion_tokens)) || 0;

    return {
        prompt_tokens,
        completion_tokens,
        total_tokens: Math.max(total_tokens, prompt_tokens + completion_tokens),
    };
}

export async function insertRequestLog(entry: {
    project_id: string;
    gateway_key_id: string;
    upstream_key_id: string | null;
    provider: string | null;
    model: string;
    status_code: number;
    latency_ms: number;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    input_cost_usd?: number;
    output_cost_usd?: number;
    total_cost_usd?: number;
    pricing_provider?: string | null;
    pricing_model_name?: string | null;
    pricing_input_per_1m?: number | null;
    pricing_output_per_1m?: number | null;
    error_message?: string | null;
}) {
    const { error: logErr } = await supabase.from('request_logs').insert([entry]);
    if (logErr) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] Logging failed:`, logErr);
    }
}

export async function getPricingForModel(model: string, provider: string | null): Promise<PricingMatch | null> {
    const { data, error } = await supabase
        .from('model_pricing')
        .select('provider, model_name, input_price_per_1m, output_price_per_1m, is_active')
        .eq('model_name', model)
        .eq('is_active', true)
        .in('provider', provider ? [provider, '*'] : ['*']);

    if (error) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] Pricing lookup failed:`, error);
        return null;
    }

    if (!data || data.length === 0) return null;

    const exact = provider ? data.find((row: any) => row.provider === provider) : null;
    const fallback = data.find((row: any) => row.provider === '*');
    const match = exact || fallback;
    if (!match) return null;

    return {
        provider: match.provider,
        model_name: match.model_name,
        input_price_per_1m: Number(match.input_price_per_1m || 0),
        output_price_per_1m: Number(match.output_price_per_1m || 0),
    };
}

function roundUsd(value: number): number {
    return Number(value.toFixed(8));
}

export async function buildCostFields(model: string, provider: string | null, promptTokens: number, completionTokens: number) {
    const pricing = await getPricingForModel(model, provider);
    if (!pricing) {
        return {
            input_cost_usd: 0,
            output_cost_usd: 0,
            total_cost_usd: 0,
            pricing_provider: null,
            pricing_model_name: null,
            pricing_input_per_1m: null,
            pricing_output_per_1m: null,
        };
    }

    const input_cost_usd = roundUsd((promptTokens / 1_000_000) * pricing.input_price_per_1m);
    const output_cost_usd = roundUsd((completionTokens / 1_000_000) * pricing.output_price_per_1m);
    const total_cost_usd = roundUsd(input_cost_usd + output_cost_usd);

    return {
        input_cost_usd,
        output_cost_usd,
        total_cost_usd,
        pricing_provider: pricing.provider,
        pricing_model_name: pricing.model_name,
        pricing_input_per_1m: pricing.input_price_per_1m,
        pricing_output_per_1m: pricing.output_price_per_1m,
    };
}

/**
 * Main completion execution engine.
 * Handles candidate resolution, routing tier filtering, round-robin selection,
 * fallback retry loop, prompt restructuring, latency guard, and provider normalizations.
 */
export async function executeCompletionEngine(options: CompletionEngineOptions): Promise<any> {
    const { body, gatewayKey, c, returnRawStream = false, isInternalCall = false } = options;
    const allowedModels = gatewayKey.gateway_key_models || [];
    let requestedModel: string = body.model || '';

    if (isInternalCall && !returnRawStream) {
        body.stream = false;
    }

    // Check if the gateway key is allowed to use this model
    let allowed = allowedModels.filter((m: any) => m.model_name === requestedModel);

    // Cross-project resolution for internal calls (Virtual Consensus Fusion)
    if (allowed.length === 0 && isInternalCall) {
        // 1. Direct model lookup across all projects
        const { data: globalMatches } = await supabase
            .from('gateway_key_models')
            .select('upstream_key_id, model_name, upstream_model_name')
            .eq('model_name', requestedModel);

        if (globalMatches && globalMatches.length > 0) {
            allowed = globalMatches;
        } else {
            // 2. Provider-heuristic lookup across all upstream_keys in the gateway
            const { data: allUpstreams } = await supabase
                .from('upstream_keys')
                .select('id, provider');

            let matchingGlobal: any[] = [];
            const reqLower = requestedModel.toLowerCase();
            if (reqLower.includes('mimo')) {
                matchingGlobal = (allUpstreams || []).filter((k: any) => k.provider === 'mimo');
            } else if (reqLower.includes('deepseek')) {
                matchingGlobal = (allUpstreams || []).filter((k: any) => k.provider === 'deepseek');
            } else if (reqLower.includes('gemini') || reqLower.includes('google')) {
                matchingGlobal = (allUpstreams || []).filter((k: any) => k.provider === 'google' || k.provider === 'vertex');
            } else if (reqLower.includes('groq') || reqLower.includes('llama')) {
                matchingGlobal = (allUpstreams || []).filter((k: any) => k.provider === 'groq');
            } else if (reqLower.includes('qwen') || reqLower.includes('cerebras')) {
                matchingGlobal = (allUpstreams || []).filter((k: any) => k.provider === 'cerebras' || k.provider === 'groq');
            } else if (reqLower.includes('mistral') || reqLower.includes('codestral')) {
                matchingGlobal = (allUpstreams || []).filter((k: any) => k.provider === 'mistral');
            } else if (reqLower.includes('claude')) {
                matchingGlobal = (allUpstreams || []).filter((k: any) => k.provider === 'puter');
            }

            if (matchingGlobal.length === 0) {
                // Fallback to openrouter
                matchingGlobal = (allUpstreams || []).filter((k: any) => k.provider === 'openrouter');
            }

            if (matchingGlobal.length > 0) {
                allowed = matchingGlobal.map((k: any) => ({
                    upstream_key_id: k.id,
                    model_name: requestedModel,
                    upstream_model_name: null,
                }));
            }
        }
    }

    let isHealed = false;
    let healingInfo: HealingResult | null = null;

    // --- Self-Healing Auto-Remap Engine ---
    // If model is not explicitly configured on this key (e.g. deprecated or retired by OpenAI/Anthropic),
    // automatically find the best active replacement in this project to prevent agent failure.
    if (allowed.length === 0) {
        const configuredProjectModels: string[] = (allowedModels || [])
            .map((m: any) => m.model_name)
            .filter(Boolean);

        const { data: projectKeys } = await supabase
            .from('upstream_keys')
            .select('id, provider')
            .eq('project_id', gatewayKey.project_id);

        const projectProviders = (projectKeys || []).map((k: any) => ({ id: k.id, provider: k.provider }));

        const { data: allKeyModels } = await supabase
            .from('gateway_keys')
            .select('gateway_key_models(model_name)')
            .eq('project_id', gatewayKey.project_id);

        (allKeyModels || []).forEach((gk: any) => {
            (gk.gateway_key_models || []).forEach((m: any) => {
                if (m.model_name && !configuredProjectModels.includes(m.model_name)) {
                    configuredProjectModels.push(m.model_name);
                }
            });
        });

        const healResult = resolveModelOrHeal(
            gatewayKey.project_id,
            requestedModel,
            configuredProjectModels,
            projectProviders
        );

        if (healResult.healed) {
            isHealed = true;
            healingInfo = healResult;
            console.log(`[CompletionEngine] Self-Healing engaged for project ${gatewayKey.project_id}: '${requestedModel}' -> '${healResult.resolvedModel}'`);
            requestedModel = healResult.resolvedModel;
            body.model = requestedModel;

            // Re-bind allowed models using healed model
            allowed = allowedModels.filter((m: any) => m.model_name === requestedModel);
            if (allowed.length === 0 && projectKeys && projectKeys.length > 0) {
                allowed = projectKeys.map((k: any) => ({
                    upstream_key_id: k.id,
                    model_name: requestedModel,
                    upstream_model_name: null,
                }));
            }
        } else if (projectKeys && projectKeys.length > 0) {
            // Heuristic matching for specific families if not explicitly healed
            let matchingKeys: any[] = [];
            if (requestedModel.includes('deepseek')) {
                matchingKeys = projectKeys.filter((k: any) => k.provider === 'deepseek' || k.provider === 'groq' || k.provider === 'openrouter');
            } else if (requestedModel.includes('qwen')) {
                matchingKeys = projectKeys.filter((k: any) => k.provider === 'groq' || k.provider === 'cerebras' || k.provider === 'openrouter');
            } else if (requestedModel.includes('kimi') || requestedModel.includes('moonshot')) {
                matchingKeys = projectKeys.filter((k: any) => k.provider === 'nvidia' || k.provider === 'moonshot' || k.provider === 'openrouter');
            } else if (requestedModel.includes('minimax')) {
                matchingKeys = projectKeys.filter((k: any) => k.provider === 'nvidia' || k.provider === 'minimax' || k.provider === 'openrouter');
            }

            if (matchingKeys.length > 0) {
                allowed = matchingKeys.map((k: any) => ({
                    upstream_key_id: k.id,
                    model_name: requestedModel,
                    upstream_model_name: null,
                }));
            }
        }
    }

    if (allowed.length === 0) {
        const errObj = { error: { message: `Model ${requestedModel} is not available for this API key.`, type: "invalid_request_error" } };
        if (c && !isInternalCall && !returnRawStream) {
            return c.json(errObj, 403);
        }
        return { ok: false, status: 403, error: errObj.error };
    }

    // Filter out keys marked as error, rate_limited, or currently slow from our tracker
    const healthyAllowed = allowed.filter((m: any) => {
        return checkAndRecoverProvider(m.upstream_key_id) === 'healthy'
            && !isProviderSlow(m.upstream_key_id);
    });

    // Fallback to all mappings if everything is unhealthy/slow, EXCEPT explicitly paused ones
    let candidates = healthyAllowed.length > 0
        ? healthyAllowed
        : allowed.filter((m: any) => checkAndRecoverProvider(m.upstream_key_id) !== 'paused');

    if (candidates.length === 0) {
        const errObj = { error: { message: `Gateway: Model ${requestedModel} is not available. All configured providers are exhausted, broken, or paused.`, type: "server_error" } };
        if (c && !isInternalCall && !returnRawStream) {
            return c.json(errObj, 503);
        }
        return { ok: false, status: 503, error: errObj.error };
    }

    // --- SOAT: Semantic Cache Check ---
    const cacheKey = !body.stream ? buildCacheKey(requestedModel, body.messages) : null;
    if (cacheKey) {
        const cached = getCached(cacheKey);
        if (cached) {
            const ts = new Date().toISOString();
            console.log(`[${ts}] [SemanticCache] HIT for model=${requestedModel} key=${cacheKey.substring(0, 12)}…`);
            if (c && !isInternalCall && !returnRawStream) {
                c.header('X-Cache', 'HIT');
                return c.json(cached, 200);
            }
            return { ok: true, data: cached, status: 200, isCacheHit: true };
        }
    }

    // --- SOAT: Atlas Smart Router — 3-Tier Classification ---
    const candidateUpstreamIds = candidates.map((m: any) => m.upstream_key_id);
    const { data: providerMeta } = await supabase
        .from('upstream_keys')
        .select('id, provider, billing_type')
        .in('id', candidateUpstreamIds);

    const providerMap: Record<string, string> = {};
    const billingMap: Record<string, string> = {};
    (providerMeta || []).forEach((row: any) => {
        providerMap[row.id] = row.provider;
        billingMap[row.id] = row.billing_type || 'free';
    });

    const enrichedCandidates = candidates.map((m: any) => ({
        ...m,
        provider: providerMap[m.upstream_key_id] || 'unknown',
        billing_type: billingMap[m.upstream_key_id] || 'free',
    }));

    const estimatedTok = estimateTokenCount(body.messages || []);
    const jevDecision = await consultSystemOne({
        messages: body.messages || [],
        tools: body.tools || [],
        model: requestedModel,
        candidateCount: enrichedCandidates.length,
        hasNearLimitKeys: enrichedCandidates.some((m: any) => {
            const st = getOrCreateKeyState(m.upstream_key_id, m.provider);
            return st.status === 'near_limit' || st.status === 'throttled';
        }),
    });
    const routingTier = jevDecision.tier;
    candidates = filterCandidatesByTier(routingTier, enrichedCandidates);

    // Free Tier Priority Engine: Separate free tier keys and paid/premium keys.
    // Free keys are rotated via round-robin; paid keys are placed strictly as secondary fallbacks!
    const freeCandidates = candidates.filter((cand: any) => cand.billing_type === 'free');
    const paidCandidates = candidates.filter((cand: any) => cand.billing_type !== 'free');

    const counterKey = `${gatewayKey.id}:${requestedModel}`;
    if (typeof modelCounters[counterKey] === 'undefined') {
        modelCounters[counterKey] = 0;
    }

    if (freeCandidates.length > 0) {
        const freeStartIndex = modelCounters[counterKey] % freeCandidates.length;
        modelCounters[counterKey]++;
        const rotatedFree = freeCandidates.map((_: any, i: number) => freeCandidates[(freeStartIndex + i) % freeCandidates.length]);
        candidates = [...rotatedFree, ...paidCandidates];
    } else if (paidCandidates.length > 0) {
        const paidStartIndex = modelCounters[counterKey] % paidCandidates.length;
        modelCounters[counterKey]++;
        candidates = paidCandidates.map((_: any, i: number) => paidCandidates[(paidStartIndex + i) % paidCandidates.length]);
    }

    const tsRouter = new Date().toISOString();
    console.log(`[${tsRouter}] [DualEngine] tier=${routingTier} engine=${jevDecision.decisionSource} confidence=${jevDecision.confidenceScore}% estimatedTokens=${estimatedTok} candidatesAfterFilter=${candidates.length}/${enrichedCandidates.length} (free=${freeCandidates.length}, paid=${paidCandidates.length})`);

    if (c) {
        c.header('X-TierMax-Engine', jevDecision.decisionSource);
        c.header('X-TierMax-Tier', routingTier);
        c.header('X-TierMax-Confidence', `${jevDecision.confidenceScore}`);
    }

    if (candidates.length === 0) {
        const errObj = { error: { message: `Model ${requestedModel} is not available.`, type: "invalid_request_error" } };
        if (c && !isInternalCall && !returnRawStream) {
            return c.json(errObj, 403);
        }
        return { ok: false, status: 403, error: errObj.error };
    }

    const startTime = Date.now();
    let finalResponse: any = null;
    let finalStatus = 500;
    let finalTokens = 0;
    let finalPromptTokens = 0;
    let finalCompletionTokens = 0;
    let usedUpstreamKeyId: string | null = null;
    let usedProvider: string | null = null;
    let finalErrorMsg: string | null = null;
    let finalErrorData: any = null;
    const estimatedPromptTokens = estimateTokenCount(body.messages || []);

    // Fallback Loop: Tries free candidates first, then paid candidates only if free fails
    for (let attempt = 0; attempt < candidates.length; attempt++) {
        const selectedMapping = candidates[attempt];

        usedUpstreamKeyId = selectedMapping.upstream_key_id;

        const { data: upstream, error } = await supabase
            .from('upstream_keys')
            .select('*')
            .eq('id', selectedMapping.upstream_key_id)
            .single();

        if (error || !upstream) {
            const timestamp = new Date().toISOString();
            console.error(`[${timestamp}] Upstream provider not found or misconfigured for id: ${selectedMapping.upstream_key_id}`);
            continue;
        }

        usedProvider = upstream.provider;
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [Load Balancer] Attempt ${attempt + 1}: Using upstream key ${upstream.id} for model ${requestedModel} (${usedProvider})`);

        // FreeTierGuardian: Proactive rate-limit check to avoid 429 errors
        const guardianCheck = checkRateLimitCapacity(
            upstream.id,
            upstream.provider,
            upstream.billing_type || 'free',
            estimatedPromptTokens,
            {
                rpm: upstream.rpm_limit,
                tpm: upstream.tpm_limit,
                rpd: upstream.rpd_limit,
                tpd: upstream.tpd_limit,
            }
        );

        if (!guardianCheck.canProceedImmediately) {
            if (guardianCheck.state.status === 'daily_exhausted') {
                const hasAlternative = candidates.some((c: any) => c.upstream_key_id !== upstream.id);
                if (hasAlternative) {
                    console.log(`[FreeTierGuardian] Skipping key ${upstream.id} (${upstream.provider}): Daily free tier limit reached, rotating to alternative.`);
                    continue;
                }
                console.warn(`[FreeTierGuardian] Key ${upstream.id} (${upstream.provider}) reached daily soft limit, but no alternative available; proceeding with request.`);
            }
            if (guardianCheck.shouldWaitMs > 0 && guardianCheck.shouldWaitMs <= 6000) {
                console.log(`[FreeTierGuardian] Applying smooth rate delay of ${guardianCheck.shouldWaitMs}ms for ${upstream.provider} to prevent 429`);
                await new Promise(res => setTimeout(res, guardianCheck.shouldWaitMs));
            } else if (candidates.length > 1) {
                console.log(`[FreeTierGuardian] Key ${upstream.id} near limit window (${guardianCheck.reason}), rotating to next candidate`);
                continue;
            }
        }

        let baseUrl = '';
        if (upstream.provider === 'openai') baseUrl = 'https://api.openai.com/v1/chat/completions';
        else if (upstream.provider === 'groq') baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
        else if (upstream.provider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
        else if (upstream.provider === 'cerebras') baseUrl = 'https://api.cerebras.ai/v1/chat/completions';
        else if (upstream.provider === 'google' || upstream.provider === 'vertex') baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
        else if (upstream.provider === 'mistral') baseUrl = 'https://api.mistral.ai/v1/chat/completions';
        else if (upstream.provider === 'nvidia') baseUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
        else if (upstream.provider === 'vercel') baseUrl = 'https://ai-gateway.vercel.sh/v1/chat/completions';
        else if (upstream.provider === 'minimax') baseUrl = 'https://api.minimax.chat/v1/chat/completions';
        else if (upstream.provider === 'moonshot') baseUrl = 'https://api.moonshot.cn/v1/chat/completions';
        else if (upstream.provider === 'deepseek') baseUrl = 'https://api.deepseek.com/chat/completions';
        else if (upstream.provider === 'mimo') baseUrl = 'https://api.xiaomimimo.com/v1/chat/completions';
        else if (upstream.provider === 'kie') baseUrl = `https://api.kie.ai/${encodeURIComponent(requestedModel)}/v1/chat/completions`;
        else if (upstream.provider === 'zettacore') baseUrl = 'http://localhost:8000/v1/chat/completions';
        else if (upstream.provider === 'puter') {
            try {
                if (body.stream && !returnRawStream) {
                    finalStatus = 200;
                    finalPromptTokens = estimatedPromptTokens;
                    finalCompletionTokens = 0;
                    finalTokens = Math.max(500, finalPromptTokens + finalCompletionTokens);
                    updateProviderCalls(upstream.id, finalTokens);
                    recordRateLimitConsumption(upstream.id, finalTokens);
                    const latencyMs = Date.now() - startTime;
                    const costFields = await buildCostFields(requestedModel, 'puter', finalPromptTokens, finalCompletionTokens);
                    insertRequestLog({
                        project_id: gatewayKey.project_id,
                        gateway_key_id: gatewayKey.id,
                        upstream_key_id: upstream.id,
                        provider: 'puter',
                        model: requestedModel,
                        status_code: 200,
                        latency_ms: latencyMs,
                        total_tokens: finalTokens,
                        prompt_tokens: finalPromptTokens,
                        completion_tokens: finalCompletionTokens,
                        ...costFields,
                    }).catch(() => { });

                    if (c) {
                        c.header('Content-Type', 'text/event-stream');
                        c.header('Cache-Control', 'no-cache');
                        c.header('Connection', 'keep-alive');

                        return stream(c, async (s) => {
                            try {
                                const gen = callPuterAIStream(upstream.api_key, body.messages, {
                                    model: requestedModel,
                                    max_tokens: body.max_tokens,
                                    temperature: body.temperature,
                                });
                                for await (const chunk of gen) {
                                    await s.write(new TextEncoder().encode(chunk));
                                }
                            } catch (err: any) {
                                console.error(`[Puter] Stream error: ${err.message}`);
                                markProviderError(upstream.id, 'error', err.message);
                            }
                        });
                    }
                } else {
                    const data = await callPuterAI(upstream.api_key, body.messages, {
                        model: requestedModel,
                        max_tokens: body.max_tokens,
                        temperature: body.temperature,
                    });

                    finalStatus = 200;
                    const usage = normalizeUsage(data.usage, estimatedPromptTokens);
                    finalPromptTokens = usage.prompt_tokens;
                    finalCompletionTokens = usage.completion_tokens;
                    finalTokens = usage.total_tokens;
                    updateProviderCalls(upstream.id, finalTokens);
                    recordRateLimitConsumption(upstream.id, finalTokens);

                    data._openclaw_metadata = { provider: 'puter', upstream_key_id: upstream.id };
                    finalResponse = data;
                    break;
                }
            } catch (puterErr: any) {
                console.error(`[Puter] Error: ${puterErr.message}`);
                markProviderError(upstream.id, 'error', puterErr.message);
                finalStatus = 500;
                finalErrorMsg = puterErr.message;
                continue;
            }
        }

        if (!baseUrl) {
            console.error(`Unknown provider ${upstream.provider}`);
            continue;
        }

        const forwardBody = JSON.parse(JSON.stringify(body));

        if (selectedMapping.upstream_model_name) {
            forwardBody.model = selectedMapping.upstream_model_name;
        }

        // SOAT: Prompt Anchor (consolidate system prompts at [0])
        if (Array.isArray(forwardBody.messages) && forwardBody.messages.length > 0) {
            const systemMsgs: any[] = [];
            const otherMsgs: any[] = [];

            for (const msg of forwardBody.messages) {
                if (msg.role === 'system') systemMsgs.push(msg);
                else otherMsgs.push(msg);
            }

            if (systemMsgs.length > 0) {
                const mergedContent = systemMsgs
                    .map((m: any) => {
                        if (typeof m.content === 'string') return m.content.trim();
                        if (Array.isArray(m.content)) {
                            return m.content.map((b: any) => (typeof b === 'string' ? b : b?.text ?? '')).join('').trim();
                        }
                        return '';
                    })
                    .filter(Boolean)
                    .join('\n\n');

                forwardBody.messages = [
                    { role: 'system', content: mergedContent },
                    ...otherMsgs,
                ];
                if (c) c.header('X-Prompt-Restructured', 'true');
            }
        }

        // Token Cap
        const premiumKey = process.env.SOAT_PREMIUM_BYPASS_KEY || '';
        const isPremiumProject = premiumKey.length > 0 && typeof gatewayKey?.id === 'string' && gatewayKey.id === premiumKey;

        if (!isPremiumProject && upstream.provider !== 'google' && upstream.provider !== 'vertex') {
            const envDefault = process.env.SOAT_DEFAULT_MAX_TOKENS ? Number(process.env.SOAT_DEFAULT_MAX_TOKENS) : 16000;
            const effectiveCap = (upstream.max_output_tokens && upstream.max_output_tokens > 0)
                ? upstream.max_output_tokens
                : envDefault;
            if (forwardBody.max_tokens && forwardBody.max_tokens > effectiveCap) {
                forwardBody.max_tokens = effectiveCap;
            }
        }

        // Context Trim Guard
        if (upstream.max_context_tokens && Array.isArray(forwardBody.messages)) {
            const limit = upstream.max_context_tokens;
            let estimated = estimateTokenCount(forwardBody.messages);
            if (estimated > limit) {
                const systemMsgs = forwardBody.messages.filter((m: any) => m.role === 'system');
                const nonSystem = forwardBody.messages.filter((m: any) => m.role !== 'system');
                const lastUserIdx = nonSystem.map((m: any) => m.role).lastIndexOf('user');
                let trimIdx = 0;
                while (estimated > limit && trimIdx < lastUserIdx) {
                    const removed = nonSystem.splice(0, 1);
                    estimated -= Math.ceil((JSON.stringify(removed[0]).length) / 3);
                    trimIdx++;
                }
                forwardBody.messages = [...systemMsgs, ...nonSystem];
            }
        }

        // Google / Vertex normalization
        if (upstream.provider === 'google' || upstream.provider === 'vertex' || (upstream.provider === 'kie' && requestedModel.includes('gemini'))) {
            if (forwardBody.max_completion_tokens && !forwardBody.max_tokens) {
                forwardBody.max_tokens = forwardBody.max_completion_tokens;
            }
            delete forwardBody.store;
            delete forwardBody.stream_options;
            delete forwardBody.max_completion_tokens;

            if (Array.isArray(forwardBody.messages)) {
                forwardBody.messages = forwardBody.messages.map((msg: any) => {
                    let content = msg.content;
                    if (Array.isArray(content)) {
                        content = content.map((b: any) => typeof b === 'string' ? b : b?.text ?? '').join('');
                    }
                    if (msg.role === 'tool') return { role: 'user', content: content ?? '' };
                    if (msg.role === 'assistant' && (content === null || content === undefined)) content = '';
                    return { ...msg, content };
                });
            }
        }

        // Cerebras normalization
        if (upstream.provider === 'cerebras') {
            delete forwardBody.store;
            delete forwardBody.stream_options;
            delete forwardBody.parallel_tool_calls;
            delete forwardBody.tools;
            delete forwardBody.tool_choice;

            if (Array.isArray(forwardBody.messages)) {
                forwardBody.messages = forwardBody.messages
                    .map((msg: any) => {
                        let content = msg.content;
                        if (Array.isArray(content)) {
                            content = content.map((b: any) => typeof b === 'string' ? b : b?.text ?? '').join('');
                        }
                        if (msg.role === 'tool') return { role: 'user', content: `[Tool result]: ${content ?? ''}` };
                        if (msg.role === 'assistant' && msg.tool_calls) {
                            const toolNames = (msg.tool_calls as any[]).map((tc: any) => tc.function?.name ?? tc.id).join(', ');
                            return { role: 'assistant', content: content || `[Called tools: ${toolNames}]` };
                        }
                        return { ...msg, content: content ?? '' };
                    })
                    .filter((msg: any) => !(msg.role === 'assistant' && msg.content === ''));
            }
        }

        try {
            const abortController = new AbortController();
            const abortTimer = setTimeout(() => abortController.abort(), LATENCY_ABORT_TIMEOUT_MS);

            const fetchStartMs = Date.now();
            let response: Response;
            try {
                response = await fetch(baseUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${upstream.api_key}`,
                        ...(upstream.provider === 'openrouter' ? { 'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'OpenClaw Gateway' } : {})
                    },
                    body: JSON.stringify(forwardBody),
                    signal: abortController.signal,
                });
            } finally {
                clearTimeout(abortTimer);
            }

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const isRateLimit = response.status === 429;
                const errMsg = errData.error?.message || response.statusText;
                markProviderError(upstream.id, isRateLimit ? 'rate_limited' : 'error', errMsg);

                if (isRateLimit) {
                    const retryAfter = response.headers.get('retry-after');
                    markRateLimitExceeded(upstream.id, retryAfter ? parseInt(retryAfter, 10) : undefined);
                }

                finalStatus = response.status;
                finalErrorMsg = errMsg;
                finalErrorData = errData;

                const isRequestTooLarge = errData?.error?.code === 'request_too_large' || response.status === 413;
                const isModelNotFound = response.status === 404 || 
                    (response.status === 400 && (
                        errMsg?.toLowerCase().includes('model') || 
                        errMsg?.toLowerCase().includes('deprecated') || 
                        errMsg?.toLowerCase().includes('not exist') ||
                        errData?.error?.code === 'model_not_found'
                    ));

                if (isRateLimit || response.status >= 500 || isRequestTooLarge || isModelNotFound) {
                    continue;
                } else {
                    break;
                }
            }

            // Ingest rate limit headers from successful upstream response
            ingestRateLimitHeaders(upstream.id, response.headers);

            // Kie fake 200 interception
            const contentType = response.headers.get('content-type') || '';
            if (upstream.provider === 'kie' && contentType.includes('application/json')) {
                const clonedResponse = response.clone();
                const jsonBody = await clonedResponse.json().catch(() => ({}));
                if (jsonBody.code === 500 || jsonBody.code === 422 || jsonBody.error) {
                    const errMsg = jsonBody.msg || jsonBody.error?.message || 'Fake 200 Server Error';
                    markProviderError(upstream.id, 'error', errMsg);
                    finalStatus = 500;
                    finalErrorMsg = errMsg;
                    finalErrorData = jsonBody;
                    continue;
                }
            }

            // Handle Streaming
            if (body.stream && response.body) {
                finalStatus = 200;
                finalPromptTokens = estimatedPromptTokens;
                finalCompletionTokens = 0;
                finalTokens = Math.max(500, finalPromptTokens + finalCompletionTokens);
                updateProviderCalls(upstream.id, finalTokens);
                recordRateLimitConsumption(upstream.id, finalTokens);

                const latencyMs = Date.now() - startTime;
                const costFields = await buildCostFields(requestedModel, usedProvider, finalPromptTokens, finalCompletionTokens);
                insertRequestLog({
                    project_id: gatewayKey.project_id,
                    gateway_key_id: gatewayKey.id,
                    upstream_key_id: usedUpstreamKeyId,
                    provider: usedProvider,
                    model: requestedModel,
                    status_code: finalStatus,
                    latency_ms: latencyMs,
                    total_tokens: finalTokens,
                    prompt_tokens: finalPromptTokens,
                    completion_tokens: finalCompletionTokens,
                    ...costFields,
                }).catch(() => { });

                if (returnRawStream) {
                    return {
                        ok: true,
                        rawResponse: response,
                        status: 200,
                        provider: usedProvider,
                        upstreamKeyId: usedUpstreamKeyId,
                        routingTier,
                    };
                }

                if (c) {
                    c.header('Content-Type', 'text/event-stream');
                    c.header('Cache-Control', 'no-cache');
                    c.header('Connection', 'keep-alive');
                    if (isHealed && healingInfo) {
                        c.header('X-TierMax-Healed', 'true');
                        c.header('X-TierMax-Original-Model', healingInfo.originalModel);
                        c.header('X-TierMax-Resolved-Model', healingInfo.resolvedModel);
                        if (healingInfo.reason) {
                            c.header('X-TierMax-Healing-Reason', encodeURIComponent(healingInfo.reason));
                        }
                    }

                    return stream(c, async (s) => {
                        const reader = response.body!.getReader();
                        s.onAbort(() => reader.cancel().catch(() => { }));

                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                await s.write(value);
                            }
                        } catch (err: any) {
                            try {
                                const errEvent = `data: ${JSON.stringify({ error: { message: `Stream terminated (${usedProvider}): ${err.message}`, type: 'stream_error' } })}\n\ndata: [DONE]\n\n`;
                                await s.write(new TextEncoder().encode(errEvent));
                            } catch { }
                        }
                    });
                }
            }

            // Handle non-streaming
            const data = await response.json();
            finalStatus = 200;
            const usage = normalizeUsage(data.usage, estimatedPromptTokens);
            finalPromptTokens = usage.prompt_tokens;
            finalCompletionTokens = usage.completion_tokens;
            finalTokens = usage.total_tokens;
            updateProviderCalls(upstream.id, finalTokens);
            recordRateLimitConsumption(upstream.id, finalTokens);
            recordLatency(upstream.id, Date.now() - fetchStartMs);

            data._openclaw_metadata = {
                provider: upstream.provider,
                upstream_key_id: upstream.id
            };

            if (cacheKey) {
                setCached(cacheKey, data);
            }

            finalResponse = data;
            break;

        } catch (fetchErr: any) {
            finalStatus = 500;
            finalErrorMsg = fetchErr.message;
            if ((fetchErr as Error).name === 'AbortError') {
                markProviderSlow(upstream.id);
            } else {
                markProviderError(upstream.id, 'error', fetchErr.message);
            }
            continue;
        }
    }

    const latencyMs = Date.now() - startTime;
    const costFields = await buildCostFields(requestedModel, usedProvider, finalPromptTokens, finalCompletionTokens);
    insertRequestLog({
        project_id: gatewayKey.project_id,
        gateway_key_id: gatewayKey.id,
        upstream_key_id: usedUpstreamKeyId,
        provider: usedProvider,
        model: requestedModel,
        status_code: finalStatus,
        latency_ms: latencyMs,
        total_tokens: finalTokens,
        prompt_tokens: finalPromptTokens,
        completion_tokens: finalCompletionTokens,
        ...costFields,
        error_message: finalErrorMsg
    }).catch(() => { });

    if (finalResponse) {
        if (isHealed && healingInfo) {
            finalResponse._openclaw_healing = {
                healed: true,
                original_model: healingInfo.originalModel,
                resolved_model: healingInfo.resolvedModel,
                reason: healingInfo.reason,
            };
        }
        if (c && !isInternalCall && !returnRawStream) {
            c.header('X-Cache', 'MISS');
            c.header('X-Router-Tier', routingTier);
            if (isHealed && healingInfo) {
                c.header('X-TierMax-Healed', 'true');
                c.header('X-TierMax-Original-Model', healingInfo.originalModel);
                c.header('X-TierMax-Resolved-Model', healingInfo.resolvedModel);
                if (healingInfo.reason) {
                    c.header('X-TierMax-Healing-Reason', encodeURIComponent(healingInfo.reason));
                }
            }
            return c.json(finalResponse, finalStatus as any);
        }
        return {
            ok: true,
            data: finalResponse,
            status: finalStatus,
            provider: usedProvider,
            upstreamKeyId: usedUpstreamKeyId,
            routingTier,
            isHealed,
            healingInfo,
        };
    } else {
        const errRes = finalErrorData && finalErrorData.error ? finalErrorData : { error: { message: finalErrorMsg || "All upstream candidates failed", type: "api_error" } };
        errRes._openclaw_metadata = {
            provider: usedProvider,
            upstream_key_id: usedUpstreamKeyId
        };
        if (c && !isInternalCall && !returnRawStream) {
            return c.json(errRes, finalStatus as any);
        }
        return {
            ok: false,
            error: errRes.error || errRes,
            status: finalStatus,
            provider: usedProvider,
            upstreamKeyId: usedUpstreamKeyId,
        };
    }
}
