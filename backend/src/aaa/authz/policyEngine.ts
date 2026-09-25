/**
 * OpenClaw Gateway AAA Suite — Contextual ABAC Policy Engine
 * Evaluates subjects, resources, actions, and environmental conditions.
 */

import { PolicyEvaluationRequest, PolicyDecision, PolicyRule } from '../types';
import { hasPermission } from './permissions';

export class PolicyEngine {
    private rules: PolicyRule[] = [];

    constructor(initialRules?: PolicyRule[]) {
        if (initialRules) {
            this.rules = [...initialRules];
        }
    }

    public setRules(rules: PolicyRule[]): void {
        this.rules = [...rules];
    }

    /**
     * Simple IPv4 CIDR matcher
     */
    public static matchCidr(ip: string, cidr: string): boolean {
        try {
            if (!cidr.includes('/')) {
                return ip === cidr;
            }
            const [range, bitsStr] = cidr.split('/');
            const bits = parseInt(bitsStr, 10);
            if (isNaN(bits) || bits < 0 || bits > 32) return false;

            const ip2int = (addr: string) =>
                addr
                    .split('.')
                    .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);

            const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
            return (ip2int(ip) & mask) === (ip2int(range) & mask);
        } catch {
            return false;
        }
    }

    /**
     * Evaluate request against RBAC roles and ABAC policy rules
     */
    public evaluate(request: PolicyEvaluationRequest): PolicyDecision {
        const { identity, action, resource, environment } = request;

        // 1. RBAC check
        const rbacAllowed = hasPermission(identity.roles, action);
        if (!rbacAllowed) {
            return {
                allowed: false,
                reason: `RBAC check failed: Missing permission '${action}' for roles: ${identity.roles.join(', ')}`
            };
        }

        // 2. ABAC rule evaluation
        let clampedTokens: number | undefined;
        let clampedTemp: number | undefined;

        for (const rule of this.rules) {
            // Check action match
            if (rule.actions && rule.actions.length > 0) {
                const matchAction = rule.actions.some(
                    (a) => a === '*' || a === action || (a.endsWith('*') && action.startsWith(a.slice(0, -1)))
                );
                if (!matchAction) continue;
            }

            // Check conditions (e.g. IP CIDR)
            if (rule.conditions?.ipCidr && rule.conditions.ipCidr.length > 0) {
                const ipMatches = rule.conditions.ipCidr.some((cidr) =>
                    PolicyEngine.matchCidr(environment.clientIp, cidr)
                );
                if (!ipMatches && rule.effect === 'ALLOW') {
                    return {
                        allowed: false,
                        reason: `Client IP ${environment.clientIp} does not match allowed CIDR subnets.`
                    };
                }
            }

            // Check parameter ceilings
            if (rule.conditions?.maxTokensCeiling) {
                clampedTokens = clampedTokens
                    ? Math.min(clampedTokens, rule.conditions.maxTokensCeiling)
                    : rule.conditions.maxTokensCeiling;
            }
            if (rule.conditions?.temperatureCeiling) {
                clampedTemp = clampedTemp
                    ? Math.min(clampedTemp, rule.conditions.temperatureCeiling)
                    : rule.conditions.temperatureCeiling;
            }

            if (rule.effect === 'DENY') {
                return {
                    allowed: false,
                    reason: rule.description || `Explicit deny policy triggered (${rule.id}).`
                };
            }
        }

        const clampedParameters: PolicyDecision['clampedParameters'] = {};
        if (clampedTokens !== undefined) clampedParameters.maxTokens = clampedTokens;
        if (clampedTemp !== undefined) clampedParameters.temperature = clampedTemp;

        return {
            allowed: true,
            clampedParameters: Object.keys(clampedParameters).length > 0 ? clampedParameters : undefined
        };
    }
}
