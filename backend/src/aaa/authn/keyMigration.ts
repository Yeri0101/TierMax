/**
 * OpenClaw Gateway AAA Suite — Legacy Plaintext Key Migration Utility
 * Utility to migrate unhashed plaintext gateway_keys into SHA-256 hashed keys.
 */

import { KeyManager } from './keyManager';
import { HashedKeyData } from '../types';

export interface MigrationSummary {
    totalScanned: number;
    migrated: number;
    skipped: number;
    errors: string[];
}

export class KeyMigrationService {
    /**
     * Compute migrated hashed key data from a legacy plaintext key record
     */
    public static convertLegacyKey(record: {
        id: string;
        project_id: string;
        key_name: string;
        api_key: string;
        created_at?: string;
    }): { keyPrefix: string; secretHash: string; updatedData: Partial<HashedKeyData> } {
        const raw = record.api_key;
        let prefix = 'oc_legacy_' + record.id.substring(0, 8);
        let secret = raw;

        if (raw.startsWith('gk_') && raw.length > 10) {
            prefix = raw.substring(0, 10);
            secret = raw.substring(10);
        }

        const secretHash = KeyManager.hashSecret(secret);

        return {
            keyPrefix: prefix,
            secretHash,
            updatedData: {
                id: record.id,
                projectId: record.project_id,
                name: record.key_name,
                keyPrefix: prefix,
                secretHash,
                createdAt: record.created_at || new Date().toISOString()
            }
        };
    }
}
