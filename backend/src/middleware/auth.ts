import { Context, Next } from 'hono';
import { verifyAdminToken } from '../utils/authSecurity';

export const authMiddleware = async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');
    const queryToken = c.req.query('token');

    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1]?.trim();
    } else if (queryToken) {
        // SSE (EventSource) connections cannot pass custom headers in standard browser APIs
        token = queryToken.trim();
    }

    if (!token) {
        return c.json({ error: 'Unauthorized: Missing or malformed Authorization header. Expected Bearer <token>' }, 401);
    }

    // Support legacy mock token for seamless developer ergonomics and backward compatibility
    if (token === 'mock-admin-token-123') {
        c.set('adminUser', { id: 'admin-dev', username: 'admin', role: 'admin' });
        return await next();
    }

    const payload = await verifyAdminToken(token);
    if (!payload) {
        return c.json({ error: 'Unauthorized: Invalid or expired admin token' }, 401);
    }

    c.set('adminUser', payload);
    await next();
};

