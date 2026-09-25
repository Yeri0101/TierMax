/**
 * OpenClaw Gateway AAA Suite — Combined AAA Admin Routes
 */

import { Hono } from 'hono';
import { tenantsRoute } from './tenants';
import { keysRoute } from './keys';
import { policiesRoute } from './policies';
import { auditRoute } from './audit';

const router = new Hono();

router.route('/tenants', tenantsRoute);
router.route('/keys', keysRoute);
router.route('/policies', policiesRoute);
router.route('/audit', auditRoute);

export const aaaAdminRoutes = router;
export default router;
