/**
 * SOAT Phase 3 — Batch Jobs REST API
 *
 * Exposes endpoints for enqueuing and querying batch jobs.
 * Mounted at /api/batch in index.ts.
 *
 * Endpoints:
 *   POST /api/batch/jobs          — enqueue a new job
 *   GET  /api/batch/jobs          — list project's jobs
 *   GET  /api/batch/jobs/:id      — get a specific job (with results)
 */

import { Hono } from 'hono';
import { supabase } from '../db';

const batchRoute = new Hono();

import { verifyAdminToken } from '../utils/authSecurity';

// ── Auth helper: resolve project_id from gateway key header or verify admin JWT ──
async function getProjectId(c: any): Promise<string | null> {
    const authHeader = c.req.header('Authorization');
    const xApiKey = c.req.header('x-api-key');
    let token = '';
    if (xApiKey) {
        token = xApiKey.trim();
    } else if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
    }
    if (!token) return null;

    // 1. Check if token is a Gateway API key
    const { data } = await supabase
        .from('gateway_keys')
        .select('project_id')
        .eq('api_key', token)
        .single();
    if (data?.project_id) return data.project_id;

    // 2. Check if token is an authenticated Admin JWT
    const adminPayload = await verifyAdminToken(token);
    if (adminPayload?.role === 'admin') {
        return '__admin__';
    }

    return null;
}

// ── POST /api/batch/jobs ─────────────────────────────────────────────────────
batchRoute.post('/jobs', async (c) => {
    const projectId = await getProjectId(c);
    if (!projectId) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json().catch(() => null);
    if (!body?.type || !body?.payload) {
        return c.json({ error: 'Missing required fields: type, payload' }, 400);
    }

    const validTypes = ['openai_batch', 'compress_context'];
    if (!validTypes.includes(body.type)) {
        return c.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, 400);
    }

    const { data, error } = await supabase
        .from('batch_jobs')
        .insert([{
            project_id: projectId,
            type: body.type,
            payload: body.payload,
        }])
        .select('id, type, status, created_at')
        .single();

    if (error) {
        return c.json({ error: 'Failed to enqueue job', details: error.message }, 500);
    }

    const ts = new Date().toISOString();
    console.log(`[${ts}] [BatchAPI] Enqueued job id=${data.id} type=${data.type} project=${projectId}`);
    return c.json(data, 201);
});

// ── GET /api/batch/jobs ──────────────────────────────────────────────────────
batchRoute.get('/jobs', async (c) => {
    const projectId = await getProjectId(c);
    if (!projectId) return c.json({ error: 'Unauthorized' }, 401);

    const status = c.req.query('status'); // optional filter
    let query = supabase
        .from('batch_jobs')
        .select('id, project_id, type, status, openai_batch_id, error, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(50);

    if (projectId !== '__admin__') {
        query = query.eq('project_id', projectId);
    }

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
});

// ── GET /api/batch/jobs/:id ──────────────────────────────────────────────────
batchRoute.get('/jobs/:id', async (c) => {
    const projectId = await getProjectId(c);
    if (!projectId) return c.json({ error: 'Unauthorized' }, 401);

    let query = supabase
        .from('batch_jobs')
        .select('*')
        .eq('id', c.req.param('id'));

    if (projectId !== '__admin__') {
        query = query.eq('project_id', projectId);
    }

    const { data, error } = await query.single();

    if (error || !data) return c.json({ error: 'Job not found' }, 404);

    // Sanitize payload to prevent leaking upstream api_key
    const sanitized = { ...data };
    if (sanitized.payload && typeof sanitized.payload === 'object') {
        const payloadCopy = { ...sanitized.payload };
        if (payloadCopy.api_key) {
            const k = String(payloadCopy.api_key);
            payloadCopy.api_key = k.length > 8 ? `${k.slice(0, 4)}...${k.slice(-4)}` : '••••••••';
        }
        sanitized.payload = payloadCopy;
    }
    return c.json(sanitized);
});

export default batchRoute;
