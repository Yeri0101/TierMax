export interface FusionDraft {
    model: string;
    content: string;
    latencyMs: number;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface FusionMetadata {
    panel_models: string[];
    successful_drafts: number;
    judge_model: string;
    total_latency_ms: number;
    draft_details: Array<{
        model: string;
        latency_ms: number;
        success: boolean;
        error?: string;
    }>;
}

export interface FusionExecuteOptions {
    body: any;
    gatewayKey: any;
    executeChatCompletion: (options: {
        body: any;
        gatewayKey: any;
        isInternalCall?: boolean;
    }) => Promise<any>;
    streamHandler?: (streamReadable: any) => any;
}

import { getEngineConfig } from './engineBridge';

/**
 * Default fast & diverse panel candidates in TierMax
 */
const DEFAULT_FUSION_PANEL = [
    'deepseek-chat',
    'qwen/qwen3.8-27b',
    'moonshotai/kimi-k3',
    'minimaxai/minimax-m3',
    'meta/llama-3.3-70b-instruct',
    'llama-3.3-70b-versatile',
    'google/gemma-4-31b-it',
    'gemini-2.5-flash',
];

/**
 * Select up to 3 diverse models for the fusion panel:
 * 1. Explicit body override: body.fusion_models / body.fusion_panel / body.models
 * 2. Inline model syntax: model = "fusion:model1,model2,model3"
 * 3. Gateway key configured models (if >= 3)
 * 4. EngineConfig default fusion models (configured in UI / Engine Settings)
 * 5. Default high-performance fallback panel
 */
export function selectFusionPanel(gatewayKey: any, body?: any): { panel: string[]; judge: string } {
    let manualModels: string[] = [];

    // 1. Check if model name has inline syntax: "fusion:model1,model2,model3"
    const requestedModel = (body?.model || '').trim();
    if (requestedModel.includes(':') && (requestedModel.startsWith('fusion:') || requestedModel.startsWith('openclaw/fusion:'))) {
        const parts = requestedModel.split(':')[1]?.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (parts && parts.length > 0) {
            manualModels = parts;
        }
    }

    // 2. Check explicit body parameters: body.fusion_models, body.fusion_panel, body.models
    if (manualModels.length === 0) {
        const candidateList = body?.fusion_models || body?.fusion_panel || (Array.isArray(body?.models) ? body.models : null);
        if (Array.isArray(candidateList) && candidateList.length > 0) {
            manualModels = candidateList.map((m: any) => typeof m === 'string' ? m.trim() : '').filter(Boolean);
        } else if (typeof candidateList === 'string' && candidateList.includes(',')) {
            manualModels = candidateList.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
    }

    let selectedPanel: string[] = [];

    if (manualModels.length >= 3) {
        // Exactly or more than 3 specified manually in request
        selectedPanel = manualModels.slice(0, 3);
    } else if (manualModels.length > 0) {
        // Less than 3 specified manually; complement with defaults
        selectedPanel = [...manualModels];
        for (const candidate of DEFAULT_FUSION_PANEL) {
            if (selectedPanel.length >= 3) break;
            if (!selectedPanel.includes(candidate)) {
                selectedPanel.push(candidate);
            }
        }
    } else {
        // 3. Check EngineConfig default fusion models (UI settings - highest priority for fixed panel)
        try {
            const engineConfig = getEngineConfig(false);
            if (engineConfig?.fusionDefaultModels && Array.isArray(engineConfig.fusionDefaultModels) && engineConfig.fusionDefaultModels.length >= 3) {
                selectedPanel = engineConfig.fusionDefaultModels.slice(0, 3);
            }
        } catch (_) {}

        // 4. If not configured in EngineConfig, check gateway key's models
        if (selectedPanel.length === 0) {
            const keyModels: string[] = (gatewayKey?.gateway_key_models || [])
                .map((m: any) => m.model_name)
                .filter((name: string) => name && name !== 'fusion' && name !== 'openclaw/fusion');

            const uniqueKeyModels = Array.from(new Set(keyModels));

            if (uniqueKeyModels.length >= 3) {
                selectedPanel = uniqueKeyModels.slice(0, 3);
            } else if (uniqueKeyModels.length > 0) {
                selectedPanel = [...uniqueKeyModels];
                for (const candidate of DEFAULT_FUSION_PANEL) {
                    if (selectedPanel.length >= 3) break;
                    if (!selectedPanel.includes(candidate)) {
                        selectedPanel.push(candidate);
                    }
                }
            } else {
                selectedPanel = DEFAULT_FUSION_PANEL.slice(0, 3);
            }
        }
    }

    // 5. Judge selection: manual override from body (body.fusion_judge, body.judge) or EngineConfig or heuristic
    let judge = (body?.fusion_judge || body?.judge || '').trim();
    if (!judge) {
        try {
            const engineConfig = getEngineConfig(false);
            if (engineConfig?.fusionDefaultJudge) {
                judge = engineConfig.fusionDefaultJudge;
            }
        } catch (_) {}
    }
    if (!judge) {
        judge = selectedPanel.find(m => m.includes('mimo') || m.includes('deepseek') || m.includes('qwen') || m.includes('llama')) || selectedPanel[0];
    }

    return { panel: selectedPanel, judge };
}

/**
 * Builds the dialectical meta-prompt for the judge / synthesizer model.
 */
export function buildDialecticalPrompt(userMessages: any[], drafts: FusionDraft[]): any[] {
    // Extract last user message or context
    const userPrompt = userMessages.map(m => `[${m.role.toUpperCase()}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n');

    const draftsSection = drafts
        .map((d, i) => `### Perspective / Draft ${i + 1} (${d.model}):\n${d.content.trim()}`)
        .join('\n\n');

    const synthesisInstruction = `You are the TierMax Fusion Synthesis Engine, an elite dialectical reasoning arbiter.
Multiple independent advanced AI models have generated candidate responses to the conversation below.

Your mission is to perform a rigorous dialectical synthesis:
1. Best-in-Class Integration: Merge the most accurate, thorough, and insightful arguments and calculations from each draft.
2. Contradiction Resolution: If the drafts present conflicting facts, code implementations, or viewpoints, critically evaluate them and provide the strictly verified, correct conclusion.
3. Cohesive & Direct Delivery: Do NOT preface with "Draft 1 said this" or "In conclusion, the models agree". Provide a direct, authoritative, elegant, and superior final answer directly addressing the user's intent. Preserve code blocks, formatting, and language from the prompt.`;

    return [
        {
            role: 'system',
            content: synthesisInstruction,
        },
        {
            role: 'user',
            content: `## CONVERSATION HISTORY & QUERY:\n${userPrompt}\n\n## MODEL DRAFTS TO SYNTHESIZE:\n${draftsSection}\n\nDeliver the definitive dialectical synthesized response now:`,
        },
    ];
}

/**
 * Executes the Multi-Model Fusion consensus pipeline.
 */
export async function executeFusion(options: FusionExecuteOptions): Promise<{
    finalResponse: any;
    fusionMetadata: FusionMetadata;
    isStream: boolean;
}> {
    const { body, gatewayKey, executeChatCompletion } = options;
    const startTime = Date.now();

    const { panel, judge } = selectFusionPanel(gatewayKey, body);
    const ts = new Date().toISOString();
    console.log(`[${ts}] [Fusion] Starting Multi-Model Fusion pipeline. Panel: ${panel.join(', ')} | Judge: ${judge}`);

    const engineConfig = getEngineConfig(false);
    const slotProjects = engineConfig?.fusionSlotProjects || [];

    // 1. Dispatch 3 drafts in parallel
    const draftPromises = panel.map(async (model, idx): Promise<FusionDraft> => {
        const draftStart = Date.now();
        const slotSource = slotProjects[idx] || '';
        const draftBody = {
            ...body,
            model,
            stream: false, // Drafts are always collected in memory
            max_tokens: Math.min(body.max_tokens || 1024, 2048),
            _targetSlotSource: slotSource,
        };

        const result = await executeChatCompletion({
            body: draftBody,
            gatewayKey,
            isInternalCall: true,
        });

        const latencyMs = Date.now() - draftStart;
        const content = result?.choices?.[0]?.message?.content || '';
        if (!content) {
            throw new Error(`Model ${model} returned empty response`);
        }

        return {
            model,
            content,
            latencyMs,
            usage: result?.usage,
        };
    });

    const settledDrafts = await Promise.allSettled(draftPromises);

    const successfulDrafts: FusionDraft[] = [];
    const draftDetails: FusionMetadata['draft_details'] = [];

    settledDrafts.forEach((res, index) => {
        const modelName = panel[index];
        if (res.status === 'fulfilled') {
            successfulDrafts.push(res.value);
            draftDetails.push({
                model: modelName,
                latency_ms: res.value.latencyMs,
                success: true,
            });
            console.log(`[Fusion] Draft from ${modelName} ready in ${res.value.latencyMs}ms (${res.value.content.length} chars)`);
        } else {
            draftDetails.push({
                model: modelName,
                latency_ms: 0,
                success: false,
                error: res.reason?.message || 'Unknown draft error',
            });
            console.warn(`[Fusion] Draft from ${modelName} failed: ${res.reason?.message}`);
        }
    });

    // Fallback: If 0 drafts succeeded, fail gracefully
    if (successfulDrafts.length === 0) {
        throw new Error(`Fusion engine: All candidate models in the panel failed (${panel.join(', ')})`);
    }

    // 2. Dialectical Synthesis with Judge Model
    const synthesisMessages = buildDialecticalPrompt(body.messages || [], successfulDrafts);

    const judgeSlotSource = slotProjects[3] || '';
    const judgeBody = {
        ...body,
        model: judge,
        messages: synthesisMessages,
        stream: !!body.stream,
        _targetSlotSource: judgeSlotSource,
    };

    console.log(`[Fusion] Dispatching dialectical synthesis to judge model: ${judge} (stream=${judgeBody.stream}, source=${judgeSlotSource || 'default'})`);

    const judgeResult = await executeChatCompletion({
        body: judgeBody,
        gatewayKey,
        isInternalCall: false, // allow streaming if requested
    });

    const totalLatencyMs = Date.now() - startTime;

    const fusionMetadata: FusionMetadata = {
        panel_models: panel,
        successful_drafts: successfulDrafts.length,
        judge_model: judge,
        total_latency_ms: totalLatencyMs,
        draft_details: draftDetails,
    };

    // If non-streaming, inject fusion metadata into response
    if (!body.stream && judgeResult && typeof judgeResult === 'object') {
        judgeResult._openclaw_fusion = fusionMetadata;
        judgeResult.model = body.model; // preserve 'fusion' or 'openclaw/fusion'
    }

    return {
        finalResponse: judgeResult,
        fusionMetadata,
        isStream: !!body.stream,
    };
}
