/**
 * OpenClaw Gateway AAA Suite — Model Governance & Parameter Guardrails
 */

export class ModelGovernance {
    /**
     * Check if a requested model matches allowed model patterns (including wildcards e.g. 'claude-3-5*')
     */
    public static isModelAllowed(requestedModel: string, allowedPatterns: string[]): boolean {
        if (!allowedPatterns || allowedPatterns.length === 0) {
            return true; // No restrictions
        }

        const normalized = requestedModel.toLowerCase();
        return allowedPatterns.some((pattern) => {
            const pat = pattern.toLowerCase();
            if (pat === '*' || pat === normalized) return true;
            if (pat.endsWith('*')) {
                return normalized.startsWith(pat.slice(0, -1));
            }
            return false;
        });
    }

    /**
     * Clamp generation parameters to security ceilings
     */
    public static clampParameters(
        requested: { max_tokens?: number; temperature?: number },
        ceilings: { maxTokensCeiling?: number; temperatureCeiling?: number }
    ): { max_tokens?: number; temperature?: number; wasClamped: boolean } {
        let wasClamped = false;
        let max_tokens = requested.max_tokens;
        let temperature = requested.temperature;

        if (ceilings.maxTokensCeiling !== undefined && max_tokens !== undefined) {
            if (max_tokens > ceilings.maxTokensCeiling) {
                max_tokens = ceilings.maxTokensCeiling;
                wasClamped = true;
            }
        }

        if (ceilings.temperatureCeiling !== undefined && temperature !== undefined) {
            if (temperature > ceilings.temperatureCeiling) {
                temperature = ceilings.temperatureCeiling;
                wasClamped = true;
            }
        }

        return { max_tokens, temperature, wasClamped };
    }
}
