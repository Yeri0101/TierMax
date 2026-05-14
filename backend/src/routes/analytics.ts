import { Hono } from 'hono';
import { supabase } from '../db';
import { authMiddleware } from '../middleware/auth';

const analytics = new Hono();

analytics.use('*', authMiddleware);

analytics.get('/:projectId', async (c) => {
    const { projectId } = c.req.param();

    // 1. Fetch only fields needed for aggregation across ALL logs for this project
    const { data: allLogs, error: aggError } = await supabase
        .from('request_logs')
        .select('status_code, total_tokens, prompt_tokens, completion_tokens, total_cost_usd, latency_ms, provider, model, upstream_key_id')
        .eq('project_id', projectId);

    if (aggError) return c.json({ error: aggError.message }, 500);

    const upstreamKeyIds = [...new Set((allLogs || []).map((log: any) => log.upstream_key_id).filter(Boolean))];
    let { data: upstreamKeys, error: upstreamError } = upstreamKeyIds.length === 0
        ? { data: [], error: null }
        : await supabase
            .from('upstream_keys')
            .select('id, billing_type')
            .in('id', upstreamKeyIds);

    if (upstreamError?.message?.includes('billing_type')) {
        const fallback = await supabase
            .from('upstream_keys')
            .select('id')
            .in('id', upstreamKeyIds);
        upstreamKeys = (fallback.data || []).map((key: any) => ({ ...key, billing_type: 'paid' }));
        upstreamError = fallback.error;
    }

    if (upstreamError) return c.json({ error: upstreamError.message }, 500);

    const billingTypeByKeyId = new Map(
        (upstreamKeys || []).map((key: any) => [key.id, key.billing_type || 'paid'])
    );

    // 2. Fetch the most recent 100 logs for the table visualization
    const { data: recentLogs, error: logsError } = await supabase
        .from('request_logs')
        .select(`
            *,
            gateway_keys(key_name)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100);

    if (logsError) return c.json({ error: logsError.message }, 500);

    // Aggregate basic stats using ALL logs
    let totalRequests = 0;
    let successfulRequests = 0;
    let totalTokens = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCostUsd = 0;
    let savedCostUsd = 0;
    let paidTokens = 0;
    let freeTokens = 0;
    let totalLatency = 0;

    const providerUsage: Record<string, number> = {};
    const modelUsage: Record<string, number> = {};

    allLogs.forEach(log => {
        totalRequests++;
        if (log.status_code >= 200 && log.status_code < 300) {
            successfulRequests++;
        }
        totalTokens += log.total_tokens || 0;
        totalPromptTokens += log.prompt_tokens || 0;
        totalCompletionTokens += log.completion_tokens || 0;
        const logCostUsd = Number(log.total_cost_usd || 0);
        const billingType = log.upstream_key_id ? billingTypeByKeyId.get(log.upstream_key_id) || 'paid' : 'paid';
        if (billingType === 'free') {
            savedCostUsd += logCostUsd;
            freeTokens += log.total_tokens || 0;
        } else {
            totalCostUsd += logCostUsd;
            paidTokens += log.total_tokens || 0;
        }
        totalLatency += log.latency_ms || 0;

        // Group by provider
        if (log.provider) {
            providerUsage[log.provider] = (providerUsage[log.provider] || 0) + 1;
        }

        // Group by model
        if (log.model) {
            modelUsage[log.model] = (modelUsage[log.model] || 0) + 1;
        }
    });

    const averageLatency = totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0;
    const successRate = totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) : 0;

    return c.json({
        stats: {
            totalRequests,
            successRate,
            totalTokens,
            totalPromptTokens,
            totalCompletionTokens,
            totalCostUsd: Number(totalCostUsd.toFixed(6)),
            savedCostUsd: Number(savedCostUsd.toFixed(6)),
            paidTokens,
            freeTokens,
            averageLatency
        },
        providerUsage,
        modelUsage,
        recentLogs
    });
});

analytics.delete('/:projectId', async (c) => {
    const { projectId } = c.req.param();
    const { error } = await supabase.from('request_logs').delete().eq('project_id', projectId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true });
});

export default analytics;
