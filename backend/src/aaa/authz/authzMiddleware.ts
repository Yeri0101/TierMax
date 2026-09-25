/**
 * OpenClaw Gateway AAA Suite — Unified AuthZ Middleware
 * Evaluates route-level RBAC/ABAC policies and injects parameter clamps.
 */

import { Context, Next } from 'hono';
import { AuthContext } from '../types';
import { PolicyEngine } from './policyEngine';

export function createAuthzMiddleware(policyEngine: PolicyEngine, requiredAction: string) {
    return async (c: Context, next: Next) => {
        const authContext = c.get('authContext') as AuthContext | undefined;

        if (!authContext) {
            return c.json(
                {
                    error: {
                        message: 'Unauthorized: AuthContext missing in pipeline.',
                        type: 'authorization_error',
                        code: 'unauthorized'
                    }
                },
                401
            );
        }

        const decision = policyEngine.evaluate({
            identity: authContext.identity,
            action: requiredAction,
            resource: {
                type: 'endpoint',
                id: c.req.path
            },
            environment: {
                clientIp: authContext.clientIp,
                timestamp: new Date().toISOString()
            }
        });

        if (!decision.allowed) {
            return c.json(
                {
                    error: {
                        message: decision.reason || 'Forbidden: Policy evaluation denied request.',
                        type: 'permission_denied_error',
                        code: 'forbidden'
                    }
                },
                403
            );
        }

        if (decision.clampedParameters) {
            c.set('clampedParameters', decision.clampedParameters);
        }

        await next();
    };
}
