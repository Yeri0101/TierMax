/**
 * Adversarial Runtime Test Suite: Secure Hashed Key Manager
 * Tests KeyManager format adherence, cryptographic entropy, and constant-time verification.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { KeyManager } from '../../../backend/src/aaa/authn/keyManager';
import { MemoryStorageBackend } from '../../../backend/src/aaa/storage/memoryStorage';

describe('Adversarial Test Suite: KeyManager Format & Entropy Verification', () => {
    test('1.1 Key Generation Format Strict Schema Verification for Standard Envs', () => {
        const envs = ['live', 'test', 'dev', 'sandbox'];

        for (const env of envs) {
            const { rawKey, keyData } = KeyManager.generateApiKey({
                tenantId: 'tenant_enterprise',
                projectId: 'proj_ai_gateway',
                name: `Test Key ${env}`,
                env
            });

            // Expected format: oc_<env>_<key_id>_<secret>
            const expectedRegex = new RegExp(`^oc_${env}_[0-9a-f]{8}_[0-9a-f]{48}$`);
            assert.match(rawKey, expectedRegex, `Key format must strictly match oc_${env}_<8hex>_<48hex>`);

            const parts = rawKey.split('_');
            const parsedEnv = parts[1];
            const parsedKeyId = parts[2];
            const secret = parts[3];

            // Verify prefix
            assert.equal(keyData.keyPrefix, `oc_${parsedEnv}_${parsedKeyId}`);

            // Verify secret hash
            const expectedHash = crypto.createHash('sha256').update(secret).digest('hex');
            assert.equal(keyData.secretHash, expectedHash, 'secretHash must be SHA-256 hex digest of secret');

            // Verify default metadata fields
            assert.equal(keyData.revokedAt, null);
            assert.ok(keyData.id && keyData.id.length > 0);
            assert.equal(keyData.tenantId, 'tenant_enterprise');
        }
    });

    test('1.2 High-Volume Uniqueness & Entropy Fuzzing (500 keys)', () => {
        const keyIds = new Set<string>();
        const secrets = new Set<string>();
        const prefixes = new Set<string>();

        const count = 500;
        for (let i = 0; i < count; i++) {
            const { rawKey, keyData } = KeyManager.generateApiKey({
                tenantId: `t_${i}`,
                projectId: `p_${i}`,
                name: `K_${i}`
            });

            const parsed = KeyManager.parseApiKey(rawKey);
            assert.ok(parsed, 'Key must be parseable');

            assert.equal(keyIds.has(keyData.id), false, `Collision detected in key UUID: ${keyData.id}`);
            assert.equal(secrets.has(parsed.secret), false, `Collision detected in secret: ${parsed.secret}`);
            assert.equal(prefixes.has(keyData.keyPrefix), false, `Collision detected in prefix: ${keyData.keyPrefix}`);

            keyIds.add(keyData.id);
            secrets.add(parsed.secret);
            prefixes.add(keyData.keyPrefix);
        }

        assert.equal(keyIds.size, count);
        assert.equal(secrets.size, count);
        assert.equal(prefixes.size, count);
    });

    test('1.3 Parse API Key: Standard, Legacy gk_, and Malformed strings', () => {
        // Standard oc_ format
        const standard = KeyManager.parseApiKey('oc_live_12345678_abcdef0123456789abcdef0123456789abcdef0123456789');
        assert.ok(standard);
        assert.equal(standard.prefix, 'oc_live_12345678');
        assert.equal(standard.secret, 'abcdef0123456789abcdef0123456789abcdef0123456789');

        // Legacy format gk_<32 hex chars>
        const legacy = KeyManager.parseApiKey('gk_0123456789abcdef0123456789abcdef');
        assert.ok(legacy);
        assert.equal(legacy.prefix, 'gk_0123456'); // first 10 chars
        assert.equal(legacy.secret, '789abcdef0123456789abcdef');

        // Malformed strings must return null
        assert.equal(KeyManager.parseApiKey(''), null);
        assert.equal(KeyManager.parseApiKey('   '), null);
        assert.equal(KeyManager.parseApiKey('not_a_key'), null);
        assert.equal(KeyManager.parseApiKey('oc_only'), null);
        assert.equal(KeyManager.parseApiKey('oc_live_only'), null);
        assert.equal(KeyManager.parseApiKey('Bearer token_123'), null);
        assert.equal(KeyManager.parseApiKey(null as unknown as string), null);
        assert.equal(KeyManager.parseApiKey(undefined as unknown as string), null);
        assert.equal(KeyManager.parseApiKey(12345 as unknown as string), null);
    });

    test('1.4 Vulnerability Finding: Underscores in Environment Name Break parseApiKey & verifyApiKey', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const { rawKey, keyData } = KeyManager.generateApiKey({
            tenantId: 'tenant_underscore_env',
            projectId: 'proj_underscore_env',
            name: 'Underscore Env Key',
            env: 'prod_us' // Environment name with underscore
        });

        // keyData.keyPrefix is generated as "oc_prod_us_84db7906"
        await storage.setHashedKey(keyData.keyPrefix, keyData, 300);

        // Parsing the generated key:
        const parsed = KeyManager.parseApiKey(rawKey);
        assert.ok(parsed);

        // Right-to-left parsing supports environment names with underscores:
        assert.equal(parsed.prefix, keyData.keyPrefix, 'Parsed prefix must match keyPrefix when env has underscore');

        // Key verification must succeed for legitimate key with underscore in env:
        const verified = await KeyManager.verifyApiKey(rawKey, storage);
        assert.ok(verified, 'verifyApiKey must succeed for legitimate key when env has underscore');
        assert.equal(verified?.tenantId, 'tenant_underscore_env');

        await storage.close();
    });
});

describe('Adversarial Test Suite: KeyManager Verification & Tamper Resistance', () => {
    test('2.1 Legitimate Key Verification against Storage', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const { rawKey, keyData } = KeyManager.generateApiKey({
            tenantId: 'tenant_valid',
            projectId: 'proj_valid',
            name: 'Valid Key'
        });

        await storage.setHashedKey(keyData.keyPrefix, keyData, 300);

        const verified = await KeyManager.verifyApiKey(rawKey, storage);
        assert.ok(verified, 'Genuine key must verify successfully');
        assert.equal(verified.id, keyData.id);
        assert.equal(verified.tenantId, 'tenant_valid');

        await storage.close();
    });

    test('2.2 Systematic Single-Bit Secret Tampering Fuzzing across All 48 Characters', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const { rawKey, keyData } = KeyManager.generateApiKey({
            tenantId: 'tenant_tamper',
            projectId: 'proj_tamper',
            name: 'Tamper Key'
        });

        await storage.setHashedKey(keyData.keyPrefix, keyData, 300);

        const parsed = KeyManager.parseApiKey(rawKey)!;
        const secret = parsed.secret;
        assert.equal(secret.length, 48, 'Secret must be 48 hex chars');

        let rejectedCount = 0;

        // Fuzz every single character of the 48-char secret by flipping a bit
        for (let i = 0; i < secret.length; i++) {
            const originalChar = secret[i];
            const tamperedChar = originalChar === 'a' ? 'b' : (originalChar === '0' ? '1' : '0');
            const tamperedSecret = secret.substring(0, i) + tamperedChar + secret.substring(i + 1);

            const tamperedRawKey = `${parsed.prefix}_${tamperedSecret}`;
            const result = await KeyManager.verifyApiKey(tamperedRawKey, storage);

            assert.equal(result, null, `Tampered key at position ${i} must be rejected`);
            rejectedCount++;
        }

        assert.equal(rejectedCount, 48, 'All 48 single-bit tampered secret variations must be rejected');

        await storage.close();
    });

    test('2.3 Prefix Tampering Rejection: KeyId, Environment, and Namespace Mutations', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const { rawKey, keyData } = KeyManager.generateApiKey({
            tenantId: 'tenant_prefix',
            projectId: 'proj_prefix',
            name: 'Prefix Key',
            env: 'live'
        });

        await storage.setHashedKey(keyData.keyPrefix, keyData, 300);

        const parts = rawKey.split('_');
        const prefixNs = parts[0];   // oc
        const prefixEnv = parts[1];  // live
        const prefixId = parts[2];   // 8hex
        const secret = parts[3];     // 48hex

        // 1. Mutate namespace: xc_live_<id>_<secret>
        assert.equal(await KeyManager.verifyApiKey(`xc_${prefixEnv}_${prefixId}_${secret}`, storage), null);

        // 2. Mutate environment: oc_dev_<id>_<secret> (when stored as live)
        assert.equal(await KeyManager.verifyApiKey(`oc_dev_${prefixId}_${secret}`, storage), null);

        // 3. Mutate key ID: oc_live_<tampered_id>_<secret>
        const tamperedId = prefixId[0] === 'a' ? 'b' + prefixId.substring(1) : 'a' + prefixId.substring(1);
        assert.equal(await KeyManager.verifyApiKey(`oc_${prefixEnv}_${tamperedId}_${secret}`, storage), null);

        await storage.close();
    });

    test('2.4 Constant-Time Equality Safety: Differing Buffer Lengths without Exceptions', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        const { rawKey, keyData } = KeyManager.generateApiKey({
            tenantId: 'tenant_timing',
            projectId: 'proj_timing',
            name: 'Timing Key'
        });

        await storage.setHashedKey(keyData.keyPrefix, keyData, 300);
        const prefix = keyData.keyPrefix;

        // In Node.js, crypto.timingSafeEqual throws RangeError if buffer lengths differ!
        // KeyManager must safely check buffer lengths and reject without crashing.
        const testSecrets = [
            '',                                         // length 0
            'a',                                        // length 1
            '12345678',                                 // length 8
            '0123456789abcdef'.repeat(2),              // length 32
            '0123456789abcdef'.repeat(3) + '0',         // length 49 (off-by-one)
            '0123456789abcdef'.repeat(10),             // length 160
            'A'.repeat(5000)                            // 5KB payload
        ];

        for (const testSecret of testSecrets) {
            await assert.doesNotReject(async () => {
                const res = await KeyManager.verifyApiKey(`${prefix}_${testSecret}`, storage);
                assert.equal(res, null, `Secret with length ${testSecret.length} must be rejected`);
            }, `Should not throw RangeError on secret length ${testSecret.length}`);
        }

        await storage.close();
    });

    test('2.5 Lifecycle Checks: Revocation and Expiration Enforcement', async () => {
        const storage = new MemoryStorageBackend();
        await storage.init();

        // 1. Revoked key
        const { rawKey: revokedRaw, keyData: revokedData } = KeyManager.generateApiKey({
            tenantId: 't_revoked',
            projectId: 'p_revoked',
            name: 'Revoked'
        });
        revokedData.revokedAt = new Date().toISOString();
        await storage.setHashedKey(revokedData.keyPrefix, revokedData, 300);

        assert.equal(await KeyManager.verifyApiKey(revokedRaw, storage), null, 'Revoked key must be rejected');

        // 2. Expired key (past date)
        const { rawKey: expiredRaw, keyData: expiredData } = KeyManager.generateApiKey({
            tenantId: 't_expired',
            projectId: 'p_expired',
            name: 'Expired',
            options: {
                expiresAt: new Date(Date.now() - 60_000).toISOString() // 1 minute ago
            }
        });
        await storage.setHashedKey(expiredData.keyPrefix, expiredData, 300);

        assert.equal(await KeyManager.verifyApiKey(expiredRaw, storage), null, 'Expired key must be rejected');

        // 3. Valid key with future expiration
        const { rawKey: futureRaw, keyData: futureData } = KeyManager.generateApiKey({
            tenantId: 't_future',
            projectId: 'p_future',
            name: 'Future Expire',
            options: {
                expiresAt: new Date(Date.now() + 3600_000).toISOString() // 1 hour future
            }
        });
        await storage.setHashedKey(futureData.keyPrefix, futureData, 300);

        const futureResult = await KeyManager.verifyApiKey(futureRaw, storage);
        assert.ok(futureResult, 'Key with future expiration must be accepted');
        assert.equal(futureResult.id, futureData.id);

        await storage.close();
    });
});
