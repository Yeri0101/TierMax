/**
 * OpenClaw Gateway AAA Suite — Audit Trail Query REST API
 */

import { Hono } from 'hono';

const router = new Hono();

// Query audit logs
router.get('/', async (c) => {
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const tenantId = c.req.query('tenantId');

    return c.json({
        data: [],
        meta: {
            limit,
            tenantId: tenantId || null,
            total: 0
        }
    });
});

export const auditRoute = router;
export default router;
