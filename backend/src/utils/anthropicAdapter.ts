import { Readable } from 'stream';

export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string | Array<any>;
}

export interface AnthropicRequest {
    model: string;
    messages: AnthropicMessage[];
    system?: string | Array<{ type: string; text?: string }>;
    max_tokens?: number;
    metadata?: any;
    stop_sequences?: string[];
    stream?: boolean;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    tools?: Array<any>;
    tool_choice?: any;
    [key: string]: any;
}

export interface AnthropicResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: Array<any>;
    model: string;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
    stop_sequence: string | null;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
    _openclaw_metadata?: any;
    _openclaw_fusion?: any;
}

/**
 * Maps Anthropic finish reason / OpenAI finish reason
 */
export function mapOpenAIToAnthropicStopReason(finishReason?: string | null): AnthropicResponse['stop_reason'] {
    if (!finishReason) return 'end_turn';
    switch (finishReason.toLowerCase()) {
        case 'stop':
            return 'end_turn';
        case 'length':
            return 'max_tokens';
        case 'tool_calls':
        case 'function_call':
            return 'tool_use';
        default:
            return 'end_turn';
    }
}

/**
 * Translates an incoming Anthropic /v1/messages request into standard OpenAI /v1/chat/completions body.
 */
export function anthropicToOpenAI(body: AnthropicRequest): Record<string, any> {
    const openAIMessages: any[] = [];

    // 1. Process system prompt
    if (body.system) {
        let systemContent = '';
        if (typeof body.system === 'string') {
            systemContent = body.system;
        } else if (Array.isArray(body.system)) {
            systemContent = body.system
                .map((b) => (typeof b === 'string' ? b : b?.text || ''))
                .filter(Boolean)
                .join('\n\n');
        }
        if (systemContent.trim()) {
            openAIMessages.push({ role: 'system', content: systemContent });
        }
    }

    // 2. Process messages
    if (Array.isArray(body.messages)) {
        for (const msg of body.messages) {
            const role = msg.role === 'assistant' ? 'assistant' : 'user';

            if (typeof msg.content === 'string') {
                openAIMessages.push({ role, content: msg.content });
                continue;
            }

            if (Array.isArray(msg.content)) {
                // Check if message contains tool_result or tool_use blocks
                const hasToolResult = msg.content.some((b) => b?.type === 'tool_result');
                const hasToolUse = msg.content.some((b) => b?.type === 'tool_use');

                if (hasToolResult) {
                    for (const block of msg.content) {
                        if (block?.type === 'tool_result') {
                            const contentStr = typeof block.content === 'string'
                                ? block.content
                                : JSON.stringify(block.content ?? '');
                            openAIMessages.push({
                                role: 'tool',
                                tool_call_id: block.tool_use_id,
                                content: contentStr
                            });
                        } else if (block?.type === 'text' && block.text) {
                            openAIMessages.push({ role: 'user', content: block.text });
                        }
                    }
                    continue;
                }

                if (hasToolUse) {
                    const textBlocks = msg.content.filter((b) => b?.type === 'text');
                    const textContent = textBlocks.map((b) => b.text).join('\n') || null;
                    const toolCalls = msg.content
                        .filter((b) => b?.type === 'tool_use')
                        .map((b) => ({
                            id: b.id,
                            type: 'function',
                            function: {
                                name: b.name,
                                arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input || {})
                            }
                        }));

                    openAIMessages.push({
                        role: 'assistant',
                        content: textContent,
                        tool_calls: toolCalls
                    });
                    continue;
                }

                // Standard content blocks (multimodal / text)
                const parts: any[] = [];
                for (const block of msg.content) {
                    if (block?.type === 'text' && block.text) {
                        parts.push({ type: 'text', text: block.text });
                    } else if (block?.type === 'image' && block.source) {
                        const { media_type, data } = block.source;
                        parts.push({
                            type: 'image_url',
                            image_url: { url: `data:${media_type};base64,${data}` }
                        });
                    }
                }

                if (parts.length === 1 && parts[0].type === 'text') {
                    openAIMessages.push({ role, content: parts[0].text });
                } else if (parts.length > 0) {
                    openAIMessages.push({ role, content: parts });
                }
            }
        }
    }

    // 3. Construct OpenAI request body
    const openAIBody: Record<string, any> = {
        model: body.model,
        messages: openAIMessages,
        stream: !!body.stream,
    };

    if (body.max_tokens !== undefined) {
        openAIBody.max_tokens = body.max_tokens;
    }
    if (body.temperature !== undefined) {
        openAIBody.temperature = body.temperature;
    }
    if (body.top_p !== undefined) {
        openAIBody.top_p = body.top_p;
    }
    if (body.stop_sequences && body.stop_sequences.length > 0) {
        openAIBody.stop = body.stop_sequences;
    }

    // Tools translation
    if (Array.isArray(body.tools) && body.tools.length > 0) {
        openAIBody.tools = body.tools.map((t) => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema || {}
            }
        }));
    }

    if (body.tool_choice) {
        if (typeof body.tool_choice === 'string') {
            openAIBody.tool_choice = body.tool_choice;
        } else if (body.tool_choice.type === 'tool' && body.tool_choice.name) {
            openAIBody.tool_choice = {
                type: 'function',
                function: { name: body.tool_choice.name }
            };
        } else if (body.tool_choice.type === 'any') {
            openAIBody.tool_choice = 'required';
        } else if (body.tool_choice.type === 'auto') {
            openAIBody.tool_choice = 'auto';
        }
    }

    return openAIBody;
}

/**
 * Translates an OpenAI /v1/chat/completions JSON response into Anthropic wire format.
 */
export function openAIToAnthropic(data: any, requestedModel: string): AnthropicResponse {
    const choice = data.choices?.[0] || {};
    const message = choice.message || {};
    const contentBlocks: any[] = [];

    if (message.content) {
        contentBlocks.push({
            type: 'text',
            text: message.content
        });
    }

    if (Array.isArray(message.tool_calls)) {
        for (const tc of message.tool_calls) {
            let inputArgs = {};
            try {
                inputArgs = JSON.parse(tc.function?.arguments || '{}');
            } catch {
                inputArgs = { raw: tc.function?.arguments };
            }
            contentBlocks.push({
                type: 'tool_use',
                id: tc.id || `toolu_${Math.random().toString(36).substring(2, 10)}`,
                name: tc.function?.name || 'unknown_tool',
                input: inputArgs
            });
        }
    }

    // Default to at least one empty text block if nothing was returned
    if (contentBlocks.length === 0) {
        contentBlocks.push({ type: 'text', text: '' });
    }

    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;

    const resId = data.id
        ? (data.id.startsWith('msg_') ? data.id : `msg_${data.id.replace(/^chatcmpl-/, '')}`)
        : `msg_${Math.random().toString(36).substring(2, 14)}`;

    const response: AnthropicResponse = {
        id: resId,
        type: 'message',
        role: 'assistant',
        content: contentBlocks,
        model: requestedModel,
        stop_reason: mapOpenAIToAnthropicStopReason(choice.finish_reason),
        stop_sequence: null,
        usage: {
            input_tokens: promptTokens,
            output_tokens: completionTokens
        }
    };

    if (data._openclaw_metadata) {
        response._openclaw_metadata = data._openclaw_metadata;
    }
    if (data._openclaw_fusion) {
        response._openclaw_fusion = data._openclaw_fusion;
    }

    return response;
}

/**
 * Transforms an OpenAI SSE stream into Anthropic SSE stream chunks.
 */
export class AnthropicSSETransformer {
    private messageId: string;
    private model: string;
    private estimatedPromptTokens: number;
    private started = false;
    private blockStarted = false;
    private blockIndex = 0;
    private outputTokens = 0;
    private lineBuffer = '';
    private ended = false;
    private activeTools = new Map<number, { index: number; id: string; name: string }>();

    constructor(model: string, estimatedPromptTokens = 0) {
        this.messageId = `msg_${Math.random().toString(36).substring(2, 14)}`;
        this.model = model;
        this.estimatedPromptTokens = estimatedPromptTokens;
    }

    /**
     * Inits the stream headers/events if not already sent.
     */
    public getStartEvents(): string {
        if (this.started) return '';
        this.started = true;
        this.blockStarted = true;

        const msgStart = JSON.stringify({
            type: 'message_start',
            message: {
                id: this.messageId,
                type: 'message',
                role: 'assistant',
                content: [],
                model: this.model,
                stop_reason: null,
                stop_sequence: null,
                usage: {
                    input_tokens: this.estimatedPromptTokens,
                    output_tokens: 1
                }
            }
        });

        const blockStart = JSON.stringify({
            type: 'content_block_start',
            index: this.blockIndex,
            content_block: {
                type: 'text',
                text: ''
            }
        });

        return `event: message_start\ndata: ${msgStart}\n\nevent: content_block_start\ndata: ${blockStart}\n\n`;
    }

    /**
     * Process raw incoming chunk from OpenAI stream and emit Anthropic events.
     */
    public processChunk(rawChunk: string): string {
        let output = '';
        this.lineBuffer += rawChunk;

        const lines = this.lineBuffer.split('\n');
        // Keep the last incomplete line in buffer
        this.lineBuffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;

            if (trimmed === 'data: [DONE]') {
                output += this.getEndEvents('end_turn');
                continue;
            }

            if (trimmed.startsWith('data: ')) {
                const jsonStr = trimmed.slice(6);
                try {
                    const parsed = JSON.parse(jsonStr);
                    const delta = parsed.choices?.[0]?.delta;
                    const finishReason = parsed.choices?.[0]?.finish_reason;

                    // Text delta
                    if (delta?.content) {
                        if (!this.started) {
                            output += this.getStartEvents();
                        }
                        this.outputTokens += Math.ceil(delta.content.length / 4) || 1;

                        const deltaEvent = JSON.stringify({
                            type: 'content_block_delta',
                            index: this.blockIndex,
                            delta: {
                                type: 'text_delta',
                                text: delta.content
                            }
                        });
                        output += `event: content_block_delta\ndata: ${deltaEvent}\n\n`;
                    }

                    // Tool call deltas
                    if (Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0) {
                        if (!this.started) {
                            output += this.getStartEvents();
                        }

                        // Close text content block if open
                        if (this.blockStarted) {
                            this.blockStarted = false;
                            const blockStop = JSON.stringify({
                                type: 'content_block_stop',
                                index: this.blockIndex
                            });
                            output += `event: content_block_stop\ndata: ${blockStop}\n\n`;
                        }

                        for (const tc of delta.tool_calls) {
                            const tcIdx = tc.index ?? 0;
                            let activeTool = this.activeTools.get(tcIdx);

                            if (!activeTool && (tc.id || tc.function?.name)) {
                                this.blockIndex++;
                                const currentBlockIndex = this.blockIndex;
                                const toolId = tc.id || `toolu_${Math.random().toString(36).substring(2, 12)}`;
                                const toolName = tc.function?.name || 'tool';

                                activeTool = {
                                    index: currentBlockIndex,
                                    id: toolId,
                                    name: toolName
                                };
                                this.activeTools.set(tcIdx, activeTool);

                                const startEvent = JSON.stringify({
                                    type: 'content_block_start',
                                    index: currentBlockIndex,
                                    content_block: {
                                        type: 'tool_use',
                                        id: toolId,
                                        name: toolName,
                                        input: {}
                                    }
                                });
                                output += `event: content_block_start\ndata: ${startEvent}\n\n`;
                            }

                            if (activeTool && tc.function?.arguments) {
                                this.outputTokens += Math.ceil(tc.function.arguments.length / 4) || 1;
                                const argEvent = JSON.stringify({
                                    type: 'content_block_delta',
                                    index: activeTool.index,
                                    delta: {
                                        type: 'input_json_delta',
                                        partial_json: tc.function.arguments
                                    }
                                });
                                output += `event: content_block_delta\ndata: ${argEvent}\n\n`;
                            }
                        }
                    }

                    if (finishReason) {
                        const mappedReason = mapOpenAIToAnthropicStopReason(finishReason);
                        output += this.getEndEvents(mappedReason);
                    }
                } catch {
                    // Ignore unparseable lines
                }
            }
        }

        return output;
    }

    /**
     * Finalizes stream events.
     */
    public getEndEvents(stopReason: string | null = 'end_turn'): string {
        if (this.ended) return '';
        this.ended = true;
        const finalReason = stopReason || 'end_turn';
        if (!this.started) {
            // Emits initial start events if nothing was streamed yet
            let initial = this.getStartEvents();
            return initial + this.getEndEvents(finalReason);
        }

        let output = '';
        if (this.blockStarted) {
            this.blockStarted = false;
            const blockStop = JSON.stringify({
                type: 'content_block_stop',
                index: this.blockIndex
            });
            output += `event: content_block_stop\ndata: ${blockStop}\n\n`;
        }

        // Close any active tool blocks
        for (const [_, tool] of this.activeTools.entries()) {
            const blockStop = JSON.stringify({
                type: 'content_block_stop',
                index: tool.index
            });
            output += `event: content_block_stop\ndata: ${blockStop}\n\n`;
        }
        this.activeTools.clear();

        const msgDelta = JSON.stringify({
            type: 'message_delta',
            delta: {
                stop_reason: finalReason,
                stop_sequence: null
            },
            usage: {
                output_tokens: Math.max(1, this.outputTokens)
            }
        });

        const msgStop = JSON.stringify({
            type: 'message_stop'
        });

        output += `event: message_delta\ndata: ${msgDelta}\n\nevent: message_stop\ndata: ${msgStop}\n\n`;
        return output;
    }
}
