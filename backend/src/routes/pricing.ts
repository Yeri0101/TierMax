import { Hono } from 'hono';
import { supabase } from '../db';
import { authMiddleware } from '../middleware/auth';

const pricing = new Hono();

pricing.use('*', authMiddleware);

const LITELLM_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const LITELLM_SYNC_USER_AGENT = 'OpenClawGateway/1.0 (+https://github.com/BerriAI/litellm-pricing-sync)';

type LiteLlmPricingEntry = {
    input_cost_per_token?: number;
    output_cost_per_token?: number;
    litellm_provider?: string;
    max_input_tokens?: number;
    max_output_tokens?: number;
    max_tokens?: number;
    mode?: string;
};

function toPricePerMillion(value: unknown): number | null {
    const perToken = Number(value);
    if (!Number.isFinite(perToken) || perToken < 0) return null;
    return Number((perToken * 1_000_000).toFixed(6));
}

function providerForLiteLlmEntry(modelName: string, entry: LiteLlmPricingEntry): string {
    if (typeof entry.litellm_provider === 'string' && entry.litellm_provider.trim()) {
        return entry.litellm_provider.trim();
    }
    const slashIndex = modelName.indexOf('/');
    return slashIndex > 0 ? modelName.slice(0, slashIndex) : '*';
}

pricing.get('/', async (c) => {
    const { data, error } = await supabase
        .from('model_pricing')
        .select('*')
        .order('provider', { ascending: true })
        .order('model_name', { ascending: true });

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
});

pricing.post('/', async (c) => {
    const body = await c.req.json();
    const provider = typeof body.provider === 'string' && body.provider.trim() ? body.provider.trim() : '*';
    const model_name = typeof body.model_name === 'string' ? body.model_name.trim() : '';
    const input_price_per_1m = Number(body.input_price_per_1m ?? 0);
    const output_price_per_1m = Number(body.output_price_per_1m ?? 0);
    const is_active = body.is_active !== false;

    if (!model_name) return c.json({ error: 'model_name is required' }, 400);
    if (input_price_per_1m < 0 || output_price_per_1m < 0) {
        return c.json({ error: 'Prices must be >= 0' }, 400);
    }

    const payload = {
        provider,
        model_name,
        input_price_per_1m,
        output_price_per_1m,
        is_active,
        source: 'manual',
        is_manual_override: true,
        updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from('model_pricing')
        .upsert(payload, { onConflict: 'provider,model_name' })
        .select()
        .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 201);
});

pricing.patch('/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
    };

    if (body.provider !== undefined) updates.provider = typeof body.provider === 'string' && body.provider.trim() ? body.provider.trim() : '*';
    if (body.model_name !== undefined) updates.model_name = body.model_name;
    if (body.input_price_per_1m !== undefined) updates.input_price_per_1m = Number(body.input_price_per_1m);
    if (body.output_price_per_1m !== undefined) updates.output_price_per_1m = Number(body.output_price_per_1m);
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
    updates.source = 'manual';
    updates.is_manual_override = true;

    const { data, error } = await supabase
        .from('model_pricing')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
});

pricing.post('/sync-litellm', async (c) => {
    const startedAt = new Date().toISOString();
    const response = await fetch(LITELLM_PRICING_URL, {
        headers: {
            Accept: 'application/json',
            'User-Agent': LITELLM_SYNC_USER_AGENT,
        },
    });

    if (!response.ok) {
        return c.json({
            error: `LiteLLM pricing fetch failed with ${response.status} ${response.statusText}`,
        }, 502);
    }

    const pricingData = await response.json() as Record<string, LiteLlmPricingEntry>;
    const rows = Object.entries(pricingData)
        .flatMap(([model_name, entry]) => {
            if (!entry || typeof entry !== 'object') return [];
            const input_price_per_1m = toPricePerMillion(entry.input_cost_per_token);
            const output_price_per_1m = toPricePerMillion(entry.output_cost_per_token);
            if (input_price_per_1m == null || output_price_per_1m == null) return [];

            return [{
                provider: providerForLiteLlmEntry(model_name, entry),
                model_name,
                input_price_per_1m,
                output_price_per_1m,
                is_active: true,
                source: 'litellm',
                is_manual_override: false,
                litellm_provider: entry.litellm_provider ?? null,
                max_input_tokens: Number.isFinite(Number(entry.max_input_tokens)) ? Number(entry.max_input_tokens) : null,
                max_output_tokens: Number.isFinite(Number(entry.max_output_tokens)) ? Number(entry.max_output_tokens) : null,
                mode: typeof entry.mode === 'string' ? entry.mode : null,
                synced_at: startedAt,
                updated_at: startedAt,
            }];
        });

    if (rows.length === 0) {
        return c.json({ error: 'LiteLLM pricing JSON did not contain syncable pricing rows' }, 502);
    }

    const { data: manualRows, error: manualError } = await supabase
        .from('model_pricing')
        .select('provider, model_name')
        .eq('is_manual_override', true);

    if (manualError) return c.json({ error: manualError.message }, 500);

    const manualKeys = new Set((manualRows || []).map((row: any) => `${row.provider}::${row.model_name}`));
    const syncRows = rows.filter((row) => !manualKeys.has(`${row.provider}::${row.model_name}`));

    const chunkSize = 500;
    let synced = 0;
    for (let i = 0; i < syncRows.length; i += chunkSize) {
        const chunk = syncRows.slice(i, i + chunkSize);
        const { error } = await supabase
            .from('model_pricing')
            .upsert(chunk, { onConflict: 'provider,model_name' });

        if (error) return c.json({ error: error.message }, 500);
        synced += chunk.length;
    }

    return c.json({
        success: true,
        source: 'litellm',
        fetched: Object.keys(pricingData).length,
        syncable: rows.length,
        skipped_manual_overrides: rows.length - syncRows.length,
        synced,
        synced_at: startedAt,
    });
});

pricing.delete('/:id', async (c) => {
    const { id } = c.req.param();
    const { error } = await supabase.from('model_pricing').delete().eq('id', id);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true });
});

export default pricing;
