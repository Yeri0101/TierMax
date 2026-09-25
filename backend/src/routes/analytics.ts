import { Hono } from 'hono';
import { supabase } from '../db';
import { authMiddleware } from '../middleware/auth';
import { getCacheStats } from '../utils/semanticCache';

const analytics = new Hono();

analytics.use('*', authMiddleware);

analytics.get('/cache-stats', (c) => {
    return c.json(getCacheStats());
});

analytics.get('/global', async (c) => {
    try {
        const projectId = c.req.query('projectId') || '';
        const billingType = c.req.query('billingType') || '';
        const status = c.req.query('status') || '';
        const provider = c.req.query('provider') || '';
        const model = c.req.query('model') || '';
        const search = (c.req.query('search') || '').toLowerCase().trim();
        const limit = Math.min(Number(c.req.query('limit')) || 250, 1000);
        const offset = Math.max(Number(c.req.query('offset')) || 0, 0);

        // 1. Fetch metadata in parallel: projects, upstream_keys, gateway_keys
        const [projectsRes, upstreamKeysRes, gatewayKeysRes] = await Promise.all([
            supabase.from('projects').select('id, name'),
            supabase.from('upstream_keys').select('id, provider, billing_type, project_id'),
            supabase.from('gateway_keys').select('id, key_name, project_id')
        ]);

        const projectsData = projectsRes.data || [];
        const upstreamKeys = upstreamKeysRes.data || [];
        const gatewayKeys = gatewayKeysRes.data || [];

        const projectNameMap = new Map<string, string>(projectsData.map((p: any) => [p.id, p.name]));
        const upstreamKeyMap = new Map<string, any>(upstreamKeys.map((k: any) => [k.id, k]));
        const gatewayKeyNameMap = new Map<string, string>(gatewayKeys.map((k: any) => [k.id, k.key_name]));

        // 2. Fetch recent logs up to 2500 for analytics overview & table
        let query = supabase
            .from('request_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(2500);

        if (projectId) {
            query = query.eq('project_id', projectId);
        }

        const { data: logs, error: logsError } = await query;
        if (logsError) return c.json({ error: logsError.message }, 500);

        // 3. Enriched logs with resolved project names, upstream project names, and billing types
        const enrichedLogs = (logs || []).map((log: any) => {
            const uKey = log.upstream_key_id ? upstreamKeyMap.get(log.upstream_key_id) : null;
            const bType = uKey?.billing_type || (log.total_cost_usd > 0 ? 'paid' : 'free');
            const upstreamProjId = uKey?.project_id || null;
            const upstreamProjName = upstreamProjId ? (projectNameMap.get(upstreamProjId) || 'Canal Upstream') : null;
            const clientProjName = log.project_id ? (projectNameMap.get(log.project_id) || 'Proyecto') : 'Proyecto';
            const gwKeyName = log.gateway_key_id ? gatewayKeyNameMap.get(log.gateway_key_id) || null : null;

            return {
                ...log,
                billing_type: bType,
                project_name: clientProjName,
                upstream_project_id: upstreamProjId,
                upstream_project_name: upstreamProjName,
                gateway_key_name: gwKeyName,
            };
        });

        // 4. Compute Global Stats (over all fetched logs)
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
        let latencyCount = 0;

        const providerUsage: Record<string, { requests: number; tokens: number; cost: number }> = {};
        const modelUsage: Record<string, { requests: number; tokens: number; cost: number }> = {};
        const projectUsage: Record<string, { requests: number; tokens: number; cost: number; name: string }> = {};

        enrichedLogs.forEach((log: any) => {
            totalRequests++;
            const isSuccess = log.status_code >= 200 && log.status_code < 400;
            if (isSuccess) {
                successfulRequests++;
            }
            totalTokens += log.total_tokens || 0;
            totalPromptTokens += log.prompt_tokens || 0;
            totalCompletionTokens += log.completion_tokens || 0;
            const logCostUsd = Number(log.total_cost_usd || 0);

            if (log.billing_type === 'free') {
                savedCostUsd += logCostUsd;
                freeTokens += log.total_tokens || 0;
            } else {
                totalCostUsd += logCostUsd;
                paidTokens += log.total_tokens || 0;
            }

            if (log.latency_ms != null && log.latency_ms > 0) {
                totalLatency += log.latency_ms;
                latencyCount++;
            }

            const prov = log.provider || 'unknown';
            if (!providerUsage[prov]) providerUsage[prov] = { requests: 0, tokens: 0, cost: 0 };
            providerUsage[prov].requests++;
            providerUsage[prov].tokens += log.total_tokens || 0;
            providerUsage[prov].cost += logCostUsd;

            const mod = log.model || 'unknown';
            if (!modelUsage[mod]) modelUsage[mod] = { requests: 0, tokens: 0, cost: 0 };
            modelUsage[mod].requests++;
            modelUsage[mod].tokens += log.total_tokens || 0;
            modelUsage[mod].cost += logCostUsd;

            const pId = log.project_id || 'unknown';
            if (!projectUsage[pId]) {
                projectUsage[pId] = { requests: 0, tokens: 0, cost: 0, name: log.project_name };
            }
            projectUsage[pId].requests++;
            projectUsage[pId].tokens += log.total_tokens || 0;
            projectUsage[pId].cost += logCostUsd;
        });

        const averageLatency = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;
        const successRate = totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) : 0;

        // 5. Apply filters for the paginated table view
        let filteredLogs: any[] = enrichedLogs;
        if (billingType) {
            filteredLogs = filteredLogs.filter((l: any) => l.billing_type === billingType);
        }
        if (status === 'success') {
            filteredLogs = filteredLogs.filter((l: any) => l.status_code >= 200 && l.status_code < 400);
        } else if (status === 'error') {
            filteredLogs = filteredLogs.filter((l: any) => (l.status_code >= 400 || l.status_code === 0 || l.error_message != null));
        }
        if (provider) {
            filteredLogs = filteredLogs.filter((l: any) => (l.provider || '').toLowerCase() === provider.toLowerCase());
        }
        if (model) {
            filteredLogs = filteredLogs.filter((l: any) => (l.model || '').toLowerCase().includes(model.toLowerCase()));
        }
        if (search) {
            filteredLogs = filteredLogs.filter((l: any) => {
                const s = search;
                return (
                    (l.model || '').toLowerCase().includes(s) ||
                    (l.provider || '').toLowerCase().includes(s) ||
                    (l.project_name || '').toLowerCase().includes(s) ||
                    (l.upstream_project_name || '').toLowerCase().includes(s) ||
                    (l.gateway_key_name || '').toLowerCase().includes(s) ||
                    (l.error_message || '').toLowerCase().includes(s)
                );
            });
        }

        const totalFilteredCount = filteredLogs.length;
        const paginatedLogs = filteredLogs.slice(offset, offset + limit);

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
                averageLatency,
            },
            providerUsage,
            modelUsage,
            projectUsage,
            totalFilteredCount,
            totalRecords: totalRequests,
            recentLogs: paginatedLogs,
            projects: projectsData,
        });
    } catch (err: any) {
        return c.json({ error: err.message || 'Failed to fetch global analytics' }, 500);
    }
});

analytics.delete('/global', async (c) => {
    try {
        const { error } = await supabase.from('request_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) return c.json({ error: error.message }, 500);
        return c.json({ success: true });
    } catch (err: any) {
        return c.json({ error: err.message || 'Failed to clear global logs' }, 500);
    }
});

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
    let latencyCount = 0;

    const providerUsage: Record<string, number> = {};
    const modelUsage: Record<string, number> = {};

    (allLogs || []).forEach((log: any) => {
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
        if (log.latency_ms != null && log.latency_ms > 0) {
            totalLatency += log.latency_ms;
            latencyCount++;
        }

        // Group by provider
        if (log.provider) {
            providerUsage[log.provider] = (providerUsage[log.provider] || 0) + 1;
        }

        // Group by model
        if (log.model) {
            modelUsage[log.model] = (modelUsage[log.model] || 0) + 1;
        }
    });

    const averageLatency = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;
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
