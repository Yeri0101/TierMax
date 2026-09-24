import { createHash } from 'crypto';

/**
 * OpenClaw Gateway — High-Performance Semantic Cache Module
 * 
 * In-memory LRU cache with SHA-256 normalized keying.
 * Supports:
 * - Instant non-streaming response replay
 * - Instant streaming SSE chunk replay for repeated prompts
 * - Real-time cache hit/miss and token savings metrics
 */

const TTL_MS = (parseInt(process.env.CACHE_TTL_SECONDS || '300', 10)) * 1000; // 5 min default
const MAX_SIZE = parseInt(process.env.CACHE_MAX_SIZE || '1000', 10);

interface CacheEntry {
    value: any;
    isStream: boolean;
    chunks?: string[];
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    expiresAt: number;
    lastAccessed: number;
    hits: number;
}

const cache = new Map<string, CacheEntry>();

let totalHits = 0;
let totalMisses = 0;
let estimatedTokensSaved = 0;

/**
 * Normalizes message content for consistent semantic hashing.
 */
function normalizeContent(content: any): string {
    if (typeof content === 'string') {
        return content.trim().replace(/\s+/g, ' ');
    }
    if (Array.isArray(content)) {
        return content.map(part => typeof part === 'string' ? part.trim() : JSON.stringify(part)).join('');
    }
    return JSON.stringify(content || '');
}

/**
 * Build a robust SHA-256 cache key from model + normalized messages array + temperature.
 */
export function buildCacheKey(model: string, messages: any[], extra?: { temperature?: number }): string {
    const normalizedMsgs = (messages || []).map((m: any) => ({
        r: m.role,
        c: normalizeContent(m.content),
        tc: m.tool_calls ? JSON.stringify(m.tool_calls) : ''
    }));
    
    const raw = `${model.toLowerCase()}::${JSON.stringify(normalizedMsgs)}::t=${extra?.temperature ?? 0}`;
    return createHash('sha256').update(raw).digest('hex');
}

/**
 * Retrieve cached response.
 */
export function getCached(key: string): CacheEntry | null {
    const entry = cache.get(key);
    if (!entry) {
        totalMisses++;
        return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
        cache.delete(key);
        totalMisses++;
        return null;
    }

    // Hit!
    entry.lastAccessed = now;
    entry.hits++;
    totalHits++;
    if (entry.usage?.total_tokens) {
        estimatedTokensSaved += entry.usage.total_tokens;
    }
    return entry;
}

/**
 * Store non-streaming response.
 */
export function setCached(key: string, value: any, usage?: any): void {
    const now = Date.now();
    ensureCapacity();

    cache.set(key, {
        value,
        isStream: false,
        usage,
        expiresAt: now + TTL_MS,
        lastAccessed: now,
        hits: 0,
    });
}

/**
 * Store streaming response chunks.
 */
export function setCachedStream(key: string, chunks: string[], usage?: any): void {
    const now = Date.now();
    ensureCapacity();

    cache.set(key, {
        value: null,
        isStream: true,
        chunks,
        usage,
        expiresAt: now + TTL_MS,
        lastAccessed: now,
        hits: 0,
    });
}

function ensureCapacity(): void {
    if (cache.size >= MAX_SIZE) {
        let oldestKey = '';
        let oldestTime = Infinity;
        for (const [k, v] of cache.entries()) {
            if (v.lastAccessed < oldestTime) {
                oldestTime = v.lastAccessed;
                oldestKey = k;
            }
        }
        if (oldestKey) cache.delete(oldestKey);
    }
}

/**
 * Returns current cache telemetry metrics.
 */
export function getCacheStats() {
    return {
        size: cache.size,
        maxSize: MAX_SIZE,
        ttlMs: TTL_MS,
        totalHits,
        totalMisses,
        hitRate: totalHits + totalMisses > 0 ? (totalHits / (totalHits + totalMisses)) : 0,
        estimatedTokensSaved,
    };
}
