import crypto from 'crypto';
import { sign, verify } from 'hono/jwt';

/**
 * Retrieves the secret key used for signing administrative JWT tokens.
 * Enforces security best practices by warning if relying on the insecure default.
 */
export function getJwtSecret(): string {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret || secret.trim() === '' || secret.trim() === 'super-secret-jwt-key-change-me-in-production') {
        if (process.env.NODE_ENV === 'production') {
            console.error('[CRITICAL SECURITY WARNING] ADMIN_JWT_SECRET is unset or using default in production! Please set a strong random secret.');
        }
        return (secret && secret.trim()) || 'super-secret-jwt-key-change-me-in-production';
    }
    return secret.trim();
}

/**
 * Creates a cryptographically secure salted hash using Node.js scrypt.
 * Output format: scrypt:<salt>:<hash>
 */
export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `scrypt:${salt}:${hash}`;
}

/**
 * Verifies a candidate password against a stored password hash.
 * Supports:
 *   1. Modern salted scrypt hashes (`scrypt:<salt>:<hash>`)
 *   2. Legacy plaintext format with timing-safe comparison (for seamless upgrade)
 */
export function verifyPassword(password: string, storedHashOrPlain: string): boolean {
    if (!storedHashOrPlain || !password) return false;

    if (storedHashOrPlain.startsWith('scrypt:')) {
        const parts = storedHashOrPlain.split(':');
        if (parts.length !== 3) return false;
        const [, salt, originalHash] = parts;
        try {
            const computedHash = crypto.scryptSync(password, salt, 64).toString('hex');
            const bufOrig = Buffer.from(originalHash, 'hex');
            const bufComp = Buffer.from(computedHash, 'hex');
            if (bufOrig.length !== bufComp.length) return false;
            return crypto.timingSafeEqual(bufOrig, bufComp);
        } catch {
            return false;
        }
    }

    // Legacy plaintext comparison using timingSafeEqual to avoid timing attack leakage
    const bufA = Buffer.from(password);
    const bufB = Buffer.from(storedHashOrPlain);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Issues an administrative session JWT valid for 24 hours.
 */
export async function signAdminToken(admin: { id?: string; username: string }): Promise<string> {
    const secret = getJwtSecret();
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: admin.id || admin.username,
        username: admin.username,
        role: 'admin',
        iat: now,
        exp: now + 86400, // 24 hours
    };
    return await sign(payload, secret, 'HS256');
}

/**
 * Verifies an administrative JWT token.
 * Rejects expired, tampered, or non-admin tokens.
 */
export async function verifyAdminToken(token: string): Promise<any | null> {
    try {
        const secret = getJwtSecret();
        const payload = await verify(token, secret, 'HS256');
        if (!payload || payload.role !== 'admin') {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}
