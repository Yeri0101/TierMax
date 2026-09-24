import { Context, Next } from 'hono';
import { verifyAdminToken } from '../utils/authSecurity';

export const authMiddleware = async (c: Context, next: Next) => {
    // Disallow token transmission in query parameters to prevent leakage in URLs, browser history, and proxy logs
    if (c.req.query('token')) {
        return c.json({
            error: 'Authentication via query parameters is disabled for security. Provide token in the Authorization header as Bearer <token>.'
        }, 401);
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized: Missing or malformed Authorization header. Expected Bearer <token>' }, 401);
    }

    const token = authHeader.split(' ')[1]?.trim();
    if (!token) {
        return c.json({ error: 'Unauthorized: Empty token provided' }, 401);
    }

    const payload = await verifyAdminToken(token);
    if (!payload) {
        return c.json({ error: 'Unauthorized: Invalid or expired admin token' }, 401);
    }

    c.set('adminUser', payload);
    await next();
};

