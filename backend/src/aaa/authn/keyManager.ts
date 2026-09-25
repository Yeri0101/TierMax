/**
 * OpenClaw Gateway AAA Suite — Secure Hashed API Key Manager
 * Handles generating, parsing, and verifying cryptographically hashed API keys.
 * Format: oc_<env>_<key_id>_<secret>
 */

import crypto from 'node:crypto';
import { HashedKeyData } from '../types';
import { AAAStorageBackend } from '../storage/interface';

export class KeyManager {
    /**
     * Compute SHA-256 hash of API key secret
     */
    public static hashSecret(secret: string): string {
        return crypto.createHash('sha256').update(secret).digest('hex');
    }

    /**
     * Parse raw token string into prefix and secret components
     */
    public static parseApiKey(token: string): { prefix: string; secret: string } | null {
        if (!token || typeof token !== 'string') return null;

        const trimmed = token.trim();
        const parts = trimmed.split('_');

        // Expected format: oc_<env>_<key_id>_<secret>
        // Parse right-to-left to support environments with underscores (e.g. prod_us, staging_eu)
        if (parts.length >= 4 && parts[0] === 'oc') {
            const secret = parts[parts.length - 1];
            const keyId = parts[parts.length - 2];
            const envParts = parts.slice(1, parts.length - 2);

            if (secret.length > 0 && keyId.length > 0 && envParts.every((p) => p.length > 0)) {
                const prefix = parts.slice(0, parts.length - 1).join('_');
                return { prefix, secret };
            }
        }

        // Support legacy format fallback: gk_<32 hex chars>
        if (trimmed.startsWith('gk_') && trimmed.length > 10) {
            return { prefix: trimmed.substring(0, 10), secret: trimmed.substring(10) };
        }

        return null;
    }

    /**
     * Generate new cryptographically secure API key
     */
    public static generateApiKey(params: {
        tenantId: string;
        projectId: string;
        name: string;
        env?: string;
        options?: Partial<HashedKeyData>;
    }): { rawKey: string; keyData: HashedKeyData } {
        const env = params.env || 'live';

        // Validate environment identifier
        if (!/^[a-zA-Z0-9_-]+$/.test(env)) {
            throw new Error(`Invalid environment '${env}'. Environment must contain only alphanumeric characters, underscores, and hyphens.`);
        }

        const keyId = crypto.randomBytes(4).toString('hex'); // 8 chars
        const secret = crypto.randomBytes(24).toString('hex'); // 48 chars

        const prefix = `oc_${env}_${keyId}`;
        const rawKey = `${prefix}_${secret}`;
        const secretHash = this.hashSecret(secret);

        const keyData: HashedKeyData = {
            id: crypto.randomUUID(),
            tenantId: params.tenantId,
            projectId: params.projectId,
            name: params.name,
            keyPrefix: prefix,
            secretHash,
            allowedIps: params.options?.allowedIps || [],
            allowedOrigins: params.options?.allowedOrigins || [],
            allowedModels: params.options?.allowedModels || [],
            maxTokensCeiling: params.options?.maxTokensCeiling,
            temperatureCeiling: params.options?.temperatureCeiling,
            rpmLimit: params.options?.rpmLimit,
            tpmLimit: params.options?.tpmLimit,
            maxConcurrency: params.options?.maxConcurrency,
            expiresAt: params.options?.expiresAt || null,
            revokedAt: null,
            lastUsedAt: null,
            createdAt: new Date().toISOString()
        };

        return { rawKey, keyData };
    }

    /**
     * Verify API key token against cache and storage
     */
    public static async verifyApiKey(
        token: string,
        storage: AAAStorageBackend
    ): Promise<HashedKeyData | null> {
        const parsed = this.parseApiKey(token);
        if (!parsed) return null;

        const keyData = await storage.getHashedKey(parsed.prefix);
        if (!keyData) return null;

        // Check revocation
        if (keyData.revokedAt) return null;

        // Check expiration
        if (keyData.expiresAt && new Date(keyData.expiresAt).getTime() < Date.now()) {
            return null;
        }

        // Constant-time hash verification
        const computedHash = this.hashSecret(parsed.secret);
        const storedBuffer = Buffer.from(keyData.secretHash, 'hex');
        const computedBuffer = Buffer.from(computedHash, 'hex');

        if (storedBuffer.length !== computedBuffer.length) {
            return null;
        }

        if (!crypto.timingSafeEqual(storedBuffer, computedBuffer)) {
            return null;
        }

        return keyData;
    }
}
