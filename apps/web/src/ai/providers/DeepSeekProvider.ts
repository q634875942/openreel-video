// DeepSeekProvider — talks to DeepSeek's OpenAI-compatible API via the
// `openai` SDK with a custom baseURL. Same translation logic will be
// reused by the future OpenAIProvider and CompatibleProvider.

import OpenAI from "openai";
import type { AIProvider, GenerateOptions } from "../AIProvider";
import type {
  ChatMessage,
  ContentPart,
  GenerateChunk,
  GenerateRequest,
  ModelInfo,
  ProviderInfo,
  ToolDefinition,
} from "../types";
import {
  translateOpenAIStream,
  type OpenAICompatChunk,
} from "./openai-translation";

const DEFAULT_BASE_URL = "https://api.deepseek.com/v1";

// Minimal duck-typed shape of the OpenAI client we use. Lets tests inject a
// fake client without touching the SDK package.
export interface OpenAICompatClient {
  readonly chat: {
    readonly completions: {
      create(
        body: Record<string, unknown>,
        options?: { signal?: AbortSignal },
      ): Promise<AsyncIterable<OpenAICompatChunk>>;
    };
  };
}

export interface DeepSeekProviderOptions {
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly clientFactory?: () => OpenAICompatClient;
}

// Model list verified against api.deepseek.com/v1/models on 2026-05-16.
// Both V4 variants are reasoning models — they emit a large prefix of
// `reasoning_content` deltas before the final `content`. Plan for
// max_tokens accordingly (>= 800 for short replies, more for code gen).
const DEEPSEEK_MODELS: readonly ModelInfo[] = [
  {
    id: "deepseek-v4-flash",
    displayName: "DeepSeek-V4 Flash",
    contextWindow: 128_000,
    supportsTools: true,
    inputCostPerMTokens: 0.27,
    outputCostPerMTokens: 1.1,
  },
  {
    id: "deepseek-v4-pro",
    displayName: "DeepSeek-V4 Pro",
    contextWindow: 128_000,
    supportsTools: true,
    inputCostPerMTokens: 0.55,
    outputCostPerMTokens: 2.19,
  },
];

export class DeepSeekProvider implements AIProvider {
  readonly info: ProviderInfo = {
    id: "deepseek",
    displayName: "DeepSeek",
    keylessOk: false,
  };

  private readonly client: OpenAICompatClient;

  constructor(options: DeepSeekProviderOptions = {}) {
    if (options.clientFactory) {
      this.client = options.clientFactory();
    } else {
      if (!options.apiKey) {
        throw new Error("DeepSeekProvider: apiKey required when no clientFactory is provided");
      }
      this.client = new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseURL ?? DEFAULT_BASE_URL,
        dangerouslyAllowBrowser: true,
      }) as unknown as OpenAICompatClient;
    }
  }

  listModels(): readonly ModelInfo[] {
    return DEEPSEEK_MODELS;
  }

  generate(
    request: GenerateRequest,
    options?: GenerateOptions,
  ): AsyncIterable<GenerateChunk> {
    const body = buildOpenAICompatBody(request);
    return adapt(this.client, body, options?.signal);
  }
}

async function* adapt(
  client: OpenAICompatClient,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
): AsyncIterable<GenerateChunk> {
  let stream: AsyncIterable<OpenAICompatChunk>;
  try {
    stream = await client.chat.completions.create(body, { signal });
  } catch (err) {
    yield {
      type: "error",
      error: err instanceof Error ? err.message : String(err),
      retryable: isRetryableError(err),
    };
    return;
  }

  try {
    yield* translateOpenAIStream(stream);
  } catch (err) {
    yield {
      type: "error",
      error: err instanceof Error ? err.message : String(err),
      retryable: isRetryableError(err),
    };
  }
}

// ---------- Request translation ----------

export function buildOpenAICompatBody(
  request: GenerateRequest,
): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = [];

  if (request.system) {
    messages.push({ role: "system", content: request.system });
  }

  for (const msg of request.messages) {
    messages.push(...convertMessage(msg));
  }

  const body: Record<string, unknown> = {
    model: request.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;

  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map(convertTool);
    if (request.forceTool) {
      body.tool_choice = {
        type: "function",
        function: { name: request.forceTool },
      };
    } else {
      body.tool_choice = "auto";
    }
  }

  return body;
}

function convertMessage(msg: ChatMessage): Array<Record<string, unknown>> {
  if (typeof msg.content === "string") {
    return [{ role: msg.role, content: msg.content }];
  }

  // Multi-part content. OpenAI splits tool_use into assistant.tool_calls and
  // tool_result into a separate role=tool message.
  if (msg.role === "assistant") {
    let text = "";
    const toolCalls: Array<Record<string, unknown>> = [];
    for (const part of msg.content) {
      if (part.type === "text") {
        text += part.text;
      } else if (part.type === "tool_use") {
        toolCalls.push({
          id: part.toolCallId,
          type: "function",
          function: {
            name: part.name,
            arguments: JSON.stringify(part.input),
          },
        });
      }
    }
    const out: Record<string, unknown> = { role: "assistant" };
    if (text) out.content = text;
    if (toolCalls.length > 0) out.tool_calls = toolCalls;
    return [out];
  }

  if (msg.role === "tool") {
    const results: Array<Record<string, unknown>> = [];
    for (const part of msg.content) {
      if (part.type === "tool_result") {
        results.push({
          role: "tool",
          tool_call_id: part.toolCallId,
          content: part.content,
        });
      }
    }
    return results;
  }

  // user / system multi-part: concatenate text parts.
  const text = (msg.content as readonly ContentPart[])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
  return [{ role: msg.role, content: text }];
}

function convertTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as { status?: number }).status;
  if (typeof status === "number") {
    return status === 408 || status === 429 || status >= 500;
  }
  // Network errors (no status) — likely transient.
  return true;
}
