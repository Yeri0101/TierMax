import { Context, Next } from 'hono';
import { supabase } from '../db';

interface CachedGatewayKey {
    data: any;
    expiresAt: number;
}

const keyCache = new Map<string, CachedGatewayKey>();
const KEY_CACHE_TTL_MS = 60_000; // 60s TTL cache

export function invalidateGatewayKeyCache(token?: string): void {
    if (token) {
        keyCache.delete(token);
    } else {
        keyCache.clear();
    }
}

export const gatewayAuth = async (c: Context, next: Next) => {
    let token = '';
    const xApiKey = c.req.header('x-api-key') || c.req.header('anthropic-api-key');
    const authHeader = c.req.header('Authorization');

    if (xApiKey) {
        token = xApiKey.trim();
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1]?.trim();
    }

    const isAnthropicReq = !!xApiKey || c.req.path.includes('/messages');

    if (!token) {
        if (isAnthropicReq) {
            return c.json({
                type: "error",
                error: {
                    type: "authentication_error",
                    message: "Missing API key. Provide via 'x-api-key' or 'Authorization: Bearer <key>'"
                }
            }, 401);
        }
        return c.json({ error: { message: "Invalid Authorization header", type: "invalid_request_error" } }, 401);
    }

    // High-performance hot-path: check in-memory cache first
    let keyData: any = null;
    const cached = keyCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
        keyData = cached.data;
    } else {
        // Cache miss: Lookup the token in gateway_keys
        const { data, error } = await supabase
            .from('gateway_keys')
            .select('*, gateway_key_models(upstream_key_id, model_name, upstream_model_name)')
            .eq('api_key', token)
            .single();

        if (error || !data) {
            if (isAnthropicReq) {
                return c.json({
                    type: "error",
                    error: {
                        type: "authentication_error",
                        message: "Invalid API key"
                    }
                }, 401);
            }
            return c.json({ error: { message: "Invalid API Key", type: "authentication_error" } }, 401);
        }

        keyData = data;
        keyCache.set(token, { data, expiresAt: Date.now() + KEY_CACHE_TTL_MS });
    }

    // Bind the key data to context for the handler
    c.set('gatewayKey', keyData);

    await next();
};

