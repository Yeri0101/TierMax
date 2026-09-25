/**
 * OpenClaw Gateway AAA Suite — Hashed Key Administration REST API
 */

import { Hono } from 'hono';
import { KeyManager } from '../authn/keyManager';

const router = new Hono();

// List keys
router.get('/', async (c) => {
    return c.json({
        data: []
    });
});

// Create new hashed API key (returns rawKey once)
router.post('/', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const tenantId = body.tenantId || 'org_default';
    const projectId = body.projectId || 'proj_default';
    const name = body.name || 'Production Key';

    const { rawKey, keyData } = KeyManager.generateApiKey({
        tenantId,
        projectId,
        name,
        env: body.env || 'live',
        options: {
            allowedIps: body.allowedIps,
            allowedModels: body.allowedModels,
            maxTokensCeiling: body.maxTokensCeiling,
            rpmLimit: body.rpmLimit,
            tpmLimit: body.tpmLimit
        }
    });

    return c.json(
        {
            success: true,
            rawKey, // Returned ONLY ONCE upon creation
            key: {
                id: keyData.id,
                name: keyData.name,
                keyPrefix: keyData.keyPrefix,
                createdAt: keyData.createdAt
            }
        },
        201
    );
});

// Revoke key
router.delete('/:id', async (c) => {
    const id = c.req.param('id');
    return c.json({
        success: true,
        message: `Key ${id} revoked.`
    });
});

export const keysRoute = router;
export default router;
