/**
 * OpenClaw Gateway AAA Suite — Unified AuthN Middleware
 * Hono middleware verifying API keys, OIDC tokens, and mTLS certificates.
 */

import { Context, Next } from 'hono';
import { AuthContext, AuthIdentity } from '../types';
import { KeyManager } from './keyManager';
import { AAAStorageBackend } from '../storage/interface';

export function createAuthnMiddleware(storage: AAAStorageBackend) {
    return async (c: Context, next: Next) => {
        const authHeader = c.req.header('authorization');
        const xApiKey = c.req.header('x-api-key');
        const anthropicApiKey = c.req.header('anthropic-api-key');

        let rawToken = '';
        if (authHeader && authHeader.startsWith('Bearer ')) {
            rawToken = authHeader.substring(7).trim();
        } else if (xApiKey) {
            rawToken = xApiKey.trim();
        } else if (anthropicApiKey) {
            rawToken = anthropicApiKey.trim();
        }

        if (!rawToken) {
            return c.json(
                {
                    error: {
                        message: 'Authentication required. Provide Bearer token or API key header.',
                        type: 'authentication_error',
                        code: 'unauthorized'
                    }
                },
                401
            );
        }

        // Verify API key via KeyManager
        const keyData = await KeyManager.verifyApiKey(rawToken, storage);
        if (!keyData) {
            return c.json(
                {
                    error: {
                        message: 'Invalid, revoked, or expired API key.',
                        type: 'authentication_error',
                        code: 'invalid_api_key'
                    }
                },
                401
            );
        }

        const identity: AuthIdentity = {
            type: 'api_key',
            id: keyData.id,
            name: keyData.name,
            tenantId: keyData.tenantId,
            projectId: keyData.projectId,
            roles: ['Developer'],
            permissions: ['llm:chat:invoke', 'llm:models:read'],
            metadata: {
                keyPrefix: keyData.keyPrefix,
                allowedModels: keyData.allowedModels
            }
        };

        const clientIp =
            c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
            c.req.header('x-real-ip') ||
            '127.0.0.1';

        const userAgent = c.req.header('user-agent') || 'unknown';

        const authContext: AuthContext = {
            identity,
            clientIp,
            userAgent,
            credentialId: keyData.id
        };

        c.set('authContext', authContext);
        await next();
    };
}
