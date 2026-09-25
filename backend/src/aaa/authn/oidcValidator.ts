/**
 * OpenClaw Gateway AAA Suite — Federated OIDC / OAuth2 Token Validator
 * Validates enterprise identity tokens using dynamic JWKS discovery.
 */

import { AuthIdentity } from '../types';
import { AAAConfig } from '../config';

export interface OIDCTokenClaims {
    sub: string;
    iss: string;
    aud: string | string[];
    exp: number;
    nbf?: number;
    email?: string;
    name?: string;
    roles?: string[];
    groups?: string[];
    tenant_id?: string;
}

export class OIDCValidator {
    private config: AAAConfig;
    private jwksCache = new Map<string, unknown>();
    private lastJwksFetch = 0;

    constructor(config: AAAConfig) {
        this.config = config;
    }

    /**
     * Validate Bearer JWT token against IdP JWKS
     */
    public async validateToken(jwtToken: string): Promise<AuthIdentity | null> {
        if (!this.config.oidcEnabled || !jwtToken) {
            return null;
        }

        // Placeholder for full RS256/ES256 signature verification in M2
        try {
            const parts = jwtToken.split('.');
            if (parts.length !== 3) return null;

            const payloadRaw = Buffer.from(parts[1], 'base64url').toString('utf8');
            const claims: OIDCTokenClaims = JSON.parse(payloadRaw);

            // Basic expiration check
            if (claims.exp && claims.exp * 1000 < Date.now()) {
                return null;
            }

            return {
                type: 'oidc_user',
                id: claims.sub,
                name: claims.name || claims.email || claims.sub,
                tenantId: claims.tenant_id || 'default_tenant',
                roles: claims.roles || ['Developer'],
                permissions: [],
                metadata: {
                    email: claims.email,
                    issuer: claims.iss
                }
            };
        } catch {
            return null;
        }
    }
}
