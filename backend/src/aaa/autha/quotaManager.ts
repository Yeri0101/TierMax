/**
 * OpenClaw Gateway AAA Suite — Atomic Token Quota Manager
 * Pre-flight balance hold and post-response token settlement wallet.
 */

import { AAAStorageBackend } from '../storage/interface';

export class QuotaManager {
    private storage: AAAStorageBackend;

    constructor(storage: AAAStorageBackend) {
        this.storage = storage;
    }

    /**
     * Reserve an estimated USD amount prior to dispatching upstream
     */
    public async reserveQuota(
        tenantId: string,
        projectId: string,
        estimatedCostUsd: number
    ): Promise<boolean> {
        if (typeof estimatedCostUsd !== 'number' || !Number.isFinite(estimatedCostUsd) || estimatedCostUsd <= 0) {
            return false;
        }
        return this.storage.reserveQuota(tenantId, projectId, estimatedCostUsd);
    }

    /**
     * Settle actual USD usage upon completion or abort of stream/response
     */
    public async settleQuota(
        tenantId: string,
        projectId: string,
        actualCostUsd: number,
        reservedUsd: number
    ): Promise<void> {
        const safeActualCost = (typeof actualCostUsd === 'number' && Number.isFinite(actualCostUsd) && actualCostUsd > 0)
            ? actualCostUsd
            : 0;
        const safeReservedUsd = (typeof reservedUsd === 'number' && Number.isFinite(reservedUsd) && reservedUsd > 0)
            ? reservedUsd
            : 0;
        return this.storage.settleQuota(tenantId, projectId, safeActualCost, safeReservedUsd);
    }
}
