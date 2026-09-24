import { Hono } from 'hono';
import { supabase } from '../db';
import { authMiddleware } from '../middleware/auth';
import { PUTER_MODELS } from '../utils/puterClient';

const upstreamKeys = new Hono();

upstreamKeys.use('*', authMiddleware);

import { providerStates, resetAllProvidersStatus, resetProviderStatus, pauseProvider } from '../utils/limitTracker';
import { getAllRateLimitStates, updateCustomLimits } from '../utils/freeTierGuardian';

upstreamKeys.get('/health', async (c) => {
    return c.json({
        providers: providerStates,
        guardian: getAllRateLimitStates(),
    });
});

// List upstream keys — includes a masked key_preview (first 4 + last 4 chars) for identification without exposing the full key
upstreamKeys.get('/', async (c) => {
    let { data, error } = await supabase
        .from('upstream_keys')
        .select('id, project_id, provider, created_at, api_key, billing_type, max_context_tokens, max_output_tokens, projects(name)')
        .order('created_at', { ascending: false });

    if (error?.message?.includes('billing_type')) {
        const fallback = await supabase
            .from('upstream_keys')
            .select('id, project_id, provider, created_at, api_key, max_context_tokens, max_output_tokens, projects(name)')
            .order('created_at', { ascending: false });
        data = (fallback.data || []).map((row: any) => ({ ...row, billing_type: 'paid' }));
        error = fallback.error;
    }

    if (error) return c.json({ error: error.message }, 500);

    const sanitized = (data || []).map((row: any) => {
        const key: string = row.api_key || '';
        const key_preview = key.length > 8
            ? `${key.slice(0, 4)}...${key.slice(-4)}`
            : `${key.slice(0, 2)}...`;
        const { api_key: _removed, ...rest } = row;
        return { ...rest, key_preview };
    });

    return c.json(sanitized);
});

upstreamKeys.post('/', async (c) => {
    const { project_id, provider, api_key, billing_type } = await c.req.json();
    const normalizedApiKey = typeof api_key === 'string' ? api_key.trim() : '';
    const normalizedBillingType = billing_type === 'free' ? 'free' : 'paid';

    if (!project_id || !provider || !normalizedApiKey) {
        return c.json({ error: 'project_id, provider and api_key are required' }, 400);
    }

    const { data: existingKey, error: existingKeyError } = await supabase
        .from('upstream_keys')
        .select('id')
        .eq('api_key', normalizedApiKey)
        .limit(1)
        .maybeSingle();

    if (existingKeyError) return c.json({ error: existingKeyError.message }, 500);
    if (existingKey) return c.json({ error: 'This provider API key already exists' }, 409);

    const { data, error } = await supabase
        .from('upstream_keys')
        .insert([{ project_id, provider, api_key: normalizedApiKey, billing_type: normalizedBillingType }])
        .select('id, project_id, provider, billing_type, created_at')
        .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 201);
});

upstreamKeys.patch('/project/:projectId/billing-type', async (c) => {
    const { projectId } = c.req.param();
    const body = await c.req.json();
    const billing_type = body.billing_type === 'free' ? 'free' : 'paid';

    const { data, error } = await supabase
        .from('upstream_keys')
        .update({ billing_type })
        .eq('project_id', projectId)
        .select('id, project_id, provider, billing_type');

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true, billing_type, count: data?.length || 0, providers: data || [] });
});

upstreamKeys.patch('/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const updates: Record<string, any> = {};

    if (body.api_key !== undefined) {
        const normalizedApiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
        if (!normalizedApiKey) return c.json({ error: 'api_key cannot be empty' }, 400);

        const { data: existingKey, error: existingKeyError } = await supabase
            .from('upstream_keys')
            .select('id')
            .eq('api_key', normalizedApiKey)
            .neq('id', id)
            .limit(1)
            .maybeSingle();

        if (existingKeyError) return c.json({ error: existingKeyError.message }, 500);
        if (existingKey) return c.json({ error: 'This provider API key already exists' }, 409);

        updates.api_key = normalizedApiKey;
    }

    if (body.billing_type !== undefined) {
        updates.billing_type = body.billing_type === 'free' ? 'free' : 'paid';
    }

    if (body.rpm_limit !== undefined || body.tpm_limit !== undefined || body.rpd_limit !== undefined || body.tpd_limit !== undefined) {
        updateCustomLimits(id, {
            rpm: body.rpm_limit,
            tpm: body.tpm_limit,
            rpd: body.rpd_limit,
            tpd: body.tpd_limit,
        });
    }

    if (Object.keys(updates).length === 0 && body.rpm_limit === undefined && body.tpm_limit === undefined && body.rpd_limit === undefined) {
        return c.json({ error: 'No changes provided' }, 400);
    }

    const { data, error } = await supabase
        .from('upstream_keys')
        .update(updates)
        .eq('id', id)
        .select('id, project_id, provider, billing_type, created_at')
        .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
});

upstreamKeys.delete('/:id', async (c) => {
    const { id } = c.req.param();
    const { error } = await supabase.from('upstream_keys').delete().eq('id', id);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true });
});

// PATCH /:id/context-limit — set or clear max_context_tokens for this upstream key
upstreamKeys.patch('/:id/context-limit', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    // Send null to remove the limit entirely
    const max_context_tokens = body.max_context_tokens === null
        ? null
        : (Number(body.max_context_tokens) || null);
    const { data, error } = await supabase
        .from('upstream_keys')
        .update({ max_context_tokens })
        .eq('id', id)
        .select('id, provider, max_context_tokens')
        .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
});

upstreamKeys.post('/reset-all', async (c) => {
    resetAllProvidersStatus();
    return c.json({ success: true });
});

// PATCH /:id/output-token-limit — set or clear max_output_tokens for this upstream key
upstreamKeys.patch('/:id/output-token-limit', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    // Send null to remove the limit entirely
    const max_output_tokens = body.max_output_tokens === null
        ? null
        : (Number(body.max_output_tokens) || null);
    const { data, error } = await supabase
        .from('upstream_keys')
        .update({ max_output_tokens })
        .eq('id', id)
        .select('id, provider, max_output_tokens')
        .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
});

// PATCH /output-token-limit-all — set or clear max_output_tokens for ALL upstream keys globally
upstreamKeys.patch('/output-token-limit-all', async (c) => {
    const body = await c.req.json();
    const max_output_tokens = body.max_output_tokens === null
        ? null
        : (Number(body.max_output_tokens) || null);
    const { error } = await supabase
        .from('upstream_keys')
        .update({ max_output_tokens })
        .not('id', 'is', null); // update all rows
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true, max_output_tokens });
});

upstreamKeys.post('/:id/reset', async (c) => {
    const { id } = c.req.param();
    resetProviderStatus(id);
    return c.json({ success: true });
});

upstreamKeys.post('/:id/pause', async (c) => {
    const { id } = c.req.param();
    pauseProvider(id);
    return c.json({ success: true });
});

// A route to fetch available models for a given Upstream Key
upstreamKeys.get('/:id/models', async (c) => {
    const { id } = c.req.param();

    // 1. Fetch the key from db
    const { data: keyData, error } = await supabase
        .from('upstream_keys')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !keyData) return c.json({ error: 'Key not found' }, 404);

    try {
        // 2. Query provider API for models
        let url = '';
        if (keyData.provider === 'openai') url = 'https://api.openai.com/v1/models';
        else if (keyData.provider === 'groq') {
            try {
                const groqRes = await fetch('https://api.groq.com/openai/v1/models', {
                    headers: { 'Authorization': `Bearer ${keyData.api_key}` }
                });
                if (groqRes.ok) {
                    const groqData = await groqRes.json();
                    const liveModels: any[] = (groqData.data || []).map((m: any) => ({ id: m.id }));
                    const requiredGroq = [
                        'qwen/qwen3.8-27b',
                        'deepseek-r1-distill-llama-70b',
                        'llama-3.3-70b-versatile',
                        'qwen/qwen3.6-27b',
                        'openai/gpt-oss-120b',
                        'whisper-large-v3',
                    ];
                    for (const req of requiredGroq) {
                        if (!liveModels.some((m: any) => m.id === req)) {
                            liveModels.unshift({ id: req });
                        }
                    }
                    return c.json({ models: liveModels });
                }
            } catch (err: any) {
                console.warn(`[Models] Groq API error (${err.message}) — using curated fallback list`);
            }
            return c.json({
                models: [
                    { id: 'qwen/qwen3.8-27b' },
                    { id: 'deepseek-r1-distill-llama-70b' },
                    { id: 'llama-3.3-70b-versatile' },
                    { id: 'qwen/qwen3.6-27b' },
                    { id: 'openai/gpt-oss-120b' },
                    { id: 'groq/compound' },
                    { id: 'whisper-large-v3' },
                ]
            });
        }
        else if (keyData.provider === 'openrouter') url = 'https://openrouter.ai/api/v1/models';
        else if (keyData.provider === 'mimo') url = 'https://api.xiaomimimo.com/v1/models';
        else if (keyData.provider === 'cerebras') url = 'https://api.cerebras.ai/v1/models';
        else if (keyData.provider === 'mistral') {
            // Try Mistral API first; fall back to curated list if the key is invalid or rate-limited
            try {
                const mistralRes = await fetch('https://api.mistral.ai/v1/models', {
                    headers: { 'Authorization': `Bearer ${keyData.api_key}` }
                });
                if (mistralRes.ok) {
                    const mistralData = await mistralRes.json();
                    const models = mistralData.data || [];
                    if (models.length > 0) {
                        return c.json({ models });
                    }
                }
                console.warn(`[Models] Mistral API returned ${mistralRes.status} — using curated fallback list`);
            } catch (fetchErr: any) {
                console.warn(`[Models] Mistral API fetch failed (${fetchErr.message}) — using curated fallback list`);
            }
            // Fallback: curated list of popular Mistral models
            return c.json({
                models: [
                    // Premier models
                    { id: 'mistral-large-latest' },
                    { id: 'mistral-large-2411' },
                    // Medium / general purpose
                    { id: 'mistral-medium-latest' },
                    { id: 'mistral-small-latest' },
                    { id: 'mistral-small-2503' },
                    // Specialized models
                    { id: 'codestral-latest' },
                    { id: 'codestral-2501' },
                    { id: 'mistral-embed' },
                    // Open-weight models
                    { id: 'open-mistral-nemo' },
                    { id: 'open-mistral-7b' },
                    { id: 'open-mixtral-8x7b' },
                    { id: 'open-mixtral-8x22b' },
                    // Pixtral (multimodal)
                    { id: 'pixtral-large-latest' },
                    { id: 'pixtral-12b-2409' },
                    // Moderation
                    { id: 'mistral-moderation-latest' },
                ]
            });
        }
        else if (keyData.provider === 'google' || keyData.provider === 'vertex' || keyData.provider === 'vertexai') {
            const googleRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keyData.api_key}`);
            if (!googleRes.ok) {
                const err = await googleRes.json().catch(() => ({}));
                throw new Error(`Google API returned ${googleRes.status}: ${err.error?.message || 'Unknown error'}`);
            }
            const googleData = await googleRes.json();
            console.log("GOOGLE RESPONSE DATA:", JSON.stringify(googleData, null, 2).substring(0, 300));
            const mappedModels = (googleData.models || [])
                .map((m: any) => ({
                    id: m.name.replace('models/', '')
                }));
            return c.json({ models: mappedModels });
        }
        else if (keyData.provider === 'puter') {
            // Puter doesn't have a /models endpoint — return our curated list
            return c.json({ models: PUTER_MODELS });
        }
        else if (keyData.provider === 'kie') {
            // Kie doesn't expose a /models endpoint — return a curated list of supported models
            return c.json({
                models: [
                    // Kie specific tags
                    { id: 'gpt-5-2' }, // New model per user doc: gpt-5-2
                    { id: 'gpt-5-2-pro' },
                    { id: 'gpt-5-2-chat-latest' },
                    { id: 'gemini-3-flash' },
                    { id: 'gemini-2.5-flash' },
                    { id: 'gemini-2.5-pro' },
                    { id: 'gemini-2.0-flash' },
                    { id: 'gemini-2.0-pro-exp' },
                    { id: 'gemini-1.5-pro' },
                    { id: 'gemini-1.5-flash' },

                    // GPT / Open AI
                    { id: 'gpt-4o' },
                    { id: 'gpt-4o-mini' },
                    { id: 'o1' },
                    { id: 'o3-mini' },

                    // Anthropic Claude
                    { id: 'claude-3-7-sonnet-20250219' },
                    { id: 'claude-3-5-sonnet-20241022' },
                    { id: 'claude-3-5-haiku-20241022' },

                    // Open Source / Others
                    { id: 'deepseek-chat' }, // v3
                    { id: 'deepseek-reasoner' }, // r1
                    { id: 'llama-3.3-70b-versatile' },
                    { id: 'llama-3.1-8b-instant' }
                ]
            });
        }
        else if (keyData.provider === 'nvidia') {
            // NVIDIA NIM — try to list models via the OpenAI-compatible /models endpoint
            try {
                const nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${keyData.api_key}` }
                });
                if (nvidiaRes.ok) {
                    const nvidiaData = await nvidiaRes.json();
                    const models: any[] = (nvidiaData.data || []).map((m: any) => ({ id: m.id }));
                    const requiredNvidia = [
                        'moonshotai/kimi-k3',
                        'minimaxai/minimax-m3',
                        'meta/llama-3.3-70b-instruct',
                        'deepseek-ai/deepseek-v4-flash-0731',
                        'google/gemma-4-31b-it',
                    ];
                    for (const req of requiredNvidia) {
                        if (!models.some((m: any) => m.id === req)) {
                            models.unshift({ id: req });
                        }
                    }
                    if (models.length > 0) return c.json({ models });
                }
                console.warn(`[Models] NVIDIA API returned ${nvidiaRes.status} — using curated fallback list`);
            } catch (fetchErr: any) {
                console.warn(`[Models] NVIDIA API fetch failed (${fetchErr.message}) — using curated fallback list`);
            }
            // Curated list of popular NVIDIA NIM models
            return c.json({
                models: [
                    { id: 'moonshotai/kimi-k3' },
                    { id: 'minimaxai/minimax-m3' },
                    { id: 'meta/llama-3.3-70b-instruct' },
                    { id: 'deepseek-ai/deepseek-v4-flash-0731' },
                    { id: 'google/gemma-4-31b-it' },
                    { id: 'moonshotai/kimi-k2.6' },
                    { id: 'nvidia/llama-3.1-nemotron-70b-instruct' },
                    { id: 'deepseek-ai/deepseek-r1' },
                    { id: 'deepseek-ai/deepseek-v3' },
                    { id: 'qwen/qwen3-235b-a22b' },
                ]
            });
        }
        else if (keyData.provider === 'vercel') {
            // Vercel AI Gateway — full curated list including Chinese providers
            return c.json({
                models: [
                    // ── OpenAI ──
                    { id: 'openai/gpt-4o' },
                    { id: 'openai/gpt-4o-mini' },
                    { id: 'openai/o1' },
                    { id: 'openai/o3-mini' },
                    // ── Anthropic ──
                    { id: 'anthropic/claude-3-7-sonnet-20250219' },
                    { id: 'anthropic/claude-3-5-sonnet-20241022' },
                    { id: 'anthropic/claude-3-5-haiku-20241022' },
                    // ── Google ──
                    { id: 'google/gemini-2.0-flash-001' },
                    { id: 'google/gemini-1.5-pro-002' },
                    { id: 'google/gemini-1.5-flash-002' },
                    // ── xAI Grok ──
                    { id: 'xai/grok-2-1212' },
                    { id: 'xai/grok-beta' },
                    // ── Meta Llama ──
                    { id: 'meta-llama/llama-3.3-70b-instruct' },
                    { id: 'meta-llama/llama-3.1-405b-instruct' },
                    // ── Mistral ──
                    { id: 'mistral/mistral-large-latest' },
                    { id: 'mistral/mistral-small-latest' },
                    // ── DeepSeek ──
                    { id: 'deepseek/deepseek-chat' },
                    { id: 'deepseek/deepseek-reasoner' },
                    // ── MoonShot / Kimi (China) ──
                    { id: 'moonshotai/kimi-k2.5' },
                    { id: 'moonshotai/kimi-k1.5' },
                    // ── MiniMax (China) ──
                    { id: 'minimax/minimax-m2.5' },
                    { id: 'minimax/minimax-m2' },
                    // ── Alibaba / Qwen (China) ──
                    { id: 'alibaba/qwen-max' },
                    { id: 'alibaba/qwen-plus' },
                    { id: 'alibaba/qwen-turbo' },
                    // ── Groq ──
                    { id: 'groq/llama-3.3-70b-versatile' },
                    { id: 'groq/llama-3.1-8b-instant' },
                    // ── Cerebras ──
                    { id: 'cerebras/llama3.3-70b' },
                    { id: 'cerebras/llama3.1-8b' },
                    // ── Perplexity ──
                    { id: 'perplexity/sonar-pro' },
                    { id: 'perplexity/sonar' },
                    // ── Cohere ──
                    { id: 'cohere/command-r-plus' },
                    { id: 'cohere/command-r' },
                ]
            });
        }
        else if (keyData.provider === 'zettacore') {
            return c.json({
                models: [
                    { id: 'arena-claude-opus-4-6' },
                    { id: 'arena-gpt-4o' },
                    { id: 'gemini-web' },
                    { id: 'chatgpt-web' },
                    { id: 'qwen-web' }
                ]
            });
        }
        else if (keyData.provider === 'minimax') {
            return c.json({
                models: [
                    { id: 'MiniMax-Text-01' },
                    { id: 'abab6.5s-chat' },
                    { id: 'abab6.5-chat' },
                    { id: 'abab6.5g-chat' },
                    { id: 'abab5.5s-chat' },
                    { id: 'abab5.5-chat' },
                ]
            });
        }
        else if (keyData.provider === 'moonshot') {
            // MoonShot AI (Kimi) — OpenAI-compatible
            return c.json({
                models: [
                    { id: 'moonshot-v1-8k' },
                    { id: 'moonshot-v1-32k' },
                    { id: 'moonshot-v1-128k' },
                    { id: 'kimi-latest' },
                    { id: 'kimi-thinking-preview' },
                ]
            });
        }
        else if (keyData.provider === 'deepseek') {
            // Try the live /models endpoint first; fall back to curated list if unavailable
            try {
                const dsRes = await fetch('https://api.deepseek.com/models', {
                    headers: { 'Authorization': `Bearer ${keyData.api_key}` }
                });
                if (dsRes.ok) {
                    const dsData = await dsRes.json();
                    const models = dsData.data || [];
                    if (models.length > 0) {
                        return c.json({ models });
                    }
                }
                console.warn(`[Models] DeepSeek API returned ${dsRes.status} — using curated fallback list`);
            } catch (fetchErr: any) {
                console.warn(`[Models] DeepSeek API fetch failed (${fetchErr.message}) — using curated fallback list`);
            }
            // Curated fallback — official DeepSeek models (2026)
            // Source: https://api-docs.deepseek.com/api/list-models
            return c.json({
                models: [
                    { id: 'deepseek-chat' },
                    { id: 'deepseek-coder' },
                    { id: 'deepseek-reasoner' },
                    { id: 'deepseek-v4-flash' },
                    { id: 'deepseek-v4-pro' },
                ]
            });
        }
        else return c.json({ models: [] }); // default fallback

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${keyData.api_key}`
            }
        });

        if (!response.ok) {
            throw new Error(`Provider returned ${response.status}`);
        }

        const result = await response.json();
        return c.json({ models: result.data || [] });
    } catch (err: any) {
        console.error('Error fetching models for key', id, 'Provider:', keyData.provider, err);
        return c.json({ error: err.message }, 500);
    }
});

upstreamKeys.post('/:id/test', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));
    const prompt = body.prompt || 'Ping';
    const preferredModel: string | undefined = body.model;

    try {
        const { data: keyData, error } = await supabase
            .from('upstream_keys')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !keyData) return c.json({ status: 404, error: 'Key not found' });

        let url = '';
        let headers: Record<string, string> = { 'Content-Type': 'application/json' };
        let model = '';
        let payload: any = {};

        if (['openai', 'openrouter', 'groq', 'cerebras', 'mistral', 'nvidia', 'vercel', 'minimax', 'moonshot', 'deepseek', 'kie', 'zettacore', 'mimo'].includes(keyData.provider)) {
            if (keyData.provider === 'openai') { url = 'https://api.openai.com/v1/chat/completions'; model = 'gpt-3.5-turbo'; }
            else if (keyData.provider === 'groq') { url = 'https://api.groq.com/openai/v1/chat/completions'; model = 'qwen/qwen3.8-27b'; }
            else if (keyData.provider === 'openrouter') { url = 'https://openrouter.ai/api/v1/chat/completions'; model = 'google/gemini-2.5-flash-preview'; }
            else if (keyData.provider === 'cerebras') { url = 'https://api.cerebras.ai/v1/chat/completions'; model = 'llama3.1-8b'; }
            else if (keyData.provider === 'mistral') { url = 'https://api.mistral.ai/v1/chat/completions'; model = 'mistral-small-latest'; }
            else if (keyData.provider === 'nvidia') { url = 'https://integrate.api.nvidia.com/v1/chat/completions'; model = 'moonshotai/kimi-k3'; }
            else if (keyData.provider === 'minimax') { url = 'https://api.minimax.chat/v1/chat/completions'; model = 'minimax-text-01'; }
            else if (keyData.provider === 'moonshot') { url = 'https://api.moonshot.cn/v1/chat/completions'; model = 'moonshot-v1-8k'; }
            else if (keyData.provider === 'deepseek') { url = 'https://api.deepseek.com/chat/completions'; model = 'deepseek-chat'; }

            else if (keyData.provider === 'mimo') { url = 'https://api.xiaomimimo.com/v1/chat/completions'; model = 'mimo-v2-pro'; }
            else if (keyData.provider === 'vercel') { url = 'https://ai-gateway.vercel.sh/v1/chat/completions'; model = 'gpt-3.5-turbo'; }
            else if (keyData.provider === 'kie') { url = 'https://api.kie.ai/gemini-1.5-flash/v1/chat/completions'; model = 'gemini-1.5-flash'; }
            else if (keyData.provider === 'zettacore') { url = 'http://localhost:8000/v1/chat/completions'; model = 'arena-claude-opus-4-6'; }

            headers['Authorization'] = `Bearer ${keyData.api_key}`;
            if (preferredModel) model = preferredModel;
            payload = {
                model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 20
            };
        } else if (keyData.provider === 'google' || keyData.provider === 'vertex') {
            url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
            headers['Authorization'] = `Bearer ${keyData.api_key}`;
            model = preferredModel || 'gemini-2.0-flash';
            payload = {
                model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 20
            };
        } else if (keyData.provider === 'anthropic') {
            url = 'https://api.anthropic.com/v1/messages';
            model = 'claude-3-haiku-20240307';
            headers['x-api-key'] = keyData.api_key;
            headers['anthropic-version'] = '2023-06-01';
            payload = {
                model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 20
            };
        } else if (keyData.provider === 'puter') {
            return c.json({ status: 200, data: { status: 'Puter SDK Health OK (Simulated)' } });
        } else {
            return c.json({ status: 400, error: 'Unsupported provider for direct test' });
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => null);

        // Always return HTTP 200 to the frontend so fetchApi never throws.
        // The actual provider status is embedded in the JSON body.
        if (!response.ok) {
            return c.json({ status: response.status, error: data || response.statusText });
        }

        return c.json({ status: response.status, data });
    } catch (err: any) {
        return c.json({ status: 500, error: err.message });
    }
});

export default upstreamKeys;
