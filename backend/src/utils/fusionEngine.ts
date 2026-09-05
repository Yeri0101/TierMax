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
 * Select up to 3 diverse models for the fusion panel based on the gateway key configuration.
 */
export function selectFusionPanel(gatewayKey: any): { panel: string[]; judge: string } {
    const keyModels: string[] = (gatewayKey.gateway_key_models || [])
        .map((m: any) => m.model_name)
        .filter((name: string) => name && name !== 'fusion' && name !== 'openclaw/fusion');

    const uniqueKeyModels = Array.from(new Set(keyModels));

    let selectedPanel: string[] = [];

    if (uniqueKeyModels.length >= 3) {
        // Pick 3 diverse models from the key's configured models
        selectedPanel = uniqueKeyModels.slice(0, 3);
    } else if (uniqueKeyModels.length > 0) {
        // Start with what the key has
        selectedPanel = [...uniqueKeyModels];
        // Complete with defaults that are distinct
        for (const candidate of DEFAULT_FUSION_PANEL) {
            if (selectedPanel.length >= 3) break;
            if (!selectedPanel.includes(candidate)) {
                selectedPanel.push(candidate);
            }
        }
    } else {
        // Key has no models explicitly mapped; fallback to top 3 defaults
        selectedPanel = DEFAULT_FUSION_PANEL.slice(0, 3);
    }

    // Judge model: prioritize deepseek-chat or qwen or the first panel model
    let judge = selectedPanel.find(m => m.includes('deepseek') || m.includes('qwen') || m.includes('llama')) || selectedPanel[0];

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

    const { panel, judge } = selectFusionPanel(gatewayKey);
    const ts = new Date().toISOString();
    console.log(`[${ts}] [Fusion] Starting Multi-Model Fusion pipeline. Panel: ${panel.join(', ')} | Judge: ${judge}`);

    // 1. Dispatch 3 drafts in parallel
    const draftPromises = panel.map(async (model): Promise<FusionDraft> => {
        const draftStart = Date.now();
        const draftBody = {
            ...body,
            model,
            stream: false, // Drafts are always collected in memory
            max_tokens: Math.min(body.max_tokens || 1024, 2048),
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

    const judgeBody = {
        ...body,
        model: judge,
        messages: synthesisMessages,
        stream: !!body.stream,
    };

    console.log(`[Fusion] Dispatching dialectical synthesis to judge model: ${judge} (stream=${judgeBody.stream})`);

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
