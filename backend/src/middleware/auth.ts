import { Context, Next } from 'hono';

export const authMiddleware = async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');
    const queryToken = c.req.query('token');

    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (queryToken) {
        token = queryToken;
    }

    if (!token) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    // Very simplistic check; in a real app, verify the JWT here
    if (token !== 'mock-admin-token-123') {
        return c.json({ error: 'Invalid token' }, 401);
    }

    await next();
};
