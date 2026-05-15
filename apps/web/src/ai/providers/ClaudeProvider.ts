// ClaudeProvider — talks to Anthropic via @anthropic-ai/sdk. Enables
// prompt caching on the system prompt and tool definitions, which is a
// significant cost reduction when the same system+tools is re-used
// across many requests (typical for an AI panel that keeps generating
// objects with the same scaffold).

import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, GenerateOptions } from "../AIProvider";
import type {
  ChatMessage,
  GenerateChunk,
  GenerateRequest,
  ModelInfo,
  ProviderInfo,
  ToolDefinition,
} from "../types";
import {
  translateAnthropicStream,
  type AnthropicStreamEvent,
} from "./anthropic-translation";

// Duck-typed minimal shape of the Anthropic client we use.
export interface AnthropicClientLike {
  readonly messages: {
    stream(
      body: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ): AsyncIterable<AnthropicStreamEvent>;
  };
}

export interface ClaudeProviderOptions {
  readonly apiKey?: string;
  readonly clientFactory?: () => AnthropicClientLike;
  // Disable prompt caching (defaults to true).
  readonly enablePromptCaching?: boolean;
}

const CLAUDE_MODELS: readonly ModelInfo[] = [
  {
    id: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    contextWindow: 200_000,
    supportsTools: true,
    supportsVision: true,
    inputCostPerMTokens: 15,
    outputCostPerMTokens: 75,
  },
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    contextWindow: 200_000,
    supportsTools: true,
    supportsVision: true,
    inputCostPerMTokens: 3,
    outputCostPerMTokens: 15,
  },
  {
    id: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    contextWindow: 200_000,
    supportsTools: true,
    supportsVision: true,
    inputCostPerMTokens: 1,
    outputCostPerMTokens: 5,
  },
];

export class ClaudeProvider implements AIProvider {
  readonly info: ProviderInfo = {
    id: "claude",
    displayName: "Anthropic Claude",
    keylessOk: false,
  };

  private readonly client: AnthropicClientLike;
  private readonly enableCaching: boolean;

  constructor(options: ClaudeProviderOptions = {}) {
    this.enableCaching = options.enablePromptCaching ?? true;
    if (options.clientFactory) {
      this.client = options.clientFactory();
    } else {
      if (!options.apiKey) {
        throw new Error(
          "ClaudeProvider: apiKey required when no clientFactory is provided",
        );
      }
      this.client = new Anthropic({
        apiKey: options.apiKey,
        dangerouslyAllowBrowser: true,
      }) as unknown as AnthropicClientLike;
    }
  }

  listModels(): readonly ModelInfo[] {
    return CLAUDE_MODELS;
  }

  generate(
    request: GenerateRequest,
    options?: GenerateOptions,
  ): AsyncIterable<GenerateChunk> {
    const body = this.buildBody(request);
    return adapt(this.client, body, options?.signal);
  }

  buildBody(request: GenerateRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: request.messages.map(convertMessage),
    };

    if (request.system) {
      body.system = this.enableCaching
        ? [
            {
              type: "text",
              text: request.system,
              cache_control: { type: "ephemeral" },
            },
          ]
        : request.system;
    }

    if (request.temperature !== undefined) body.temperature = request.temperature;

    if (request.tools && request.tools.length > 0) {
      const tools = request.tools.map((t, i, arr) => convertTool(t, i === arr.length - 1, this.enableCaching));
      body.tools = tools;
      if (request.forceTool) {
        body.tool_choice = { type: "tool", name: request.forceTool };
      }
    }

    return body;
  }
}

async function* adapt(
  client: AnthropicClientLike,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
): AsyncIterable<GenerateChunk> {
  let stream: AsyncIterable<AnthropicStreamEvent>;
  try {
    stream = client.messages.stream(body, { signal });
  } catch (err) {
    yield {
      type: "error",
      error: err instanceof Error ? err.message : String(err),
      retryable: isRetryableError(err),
    };
    return;
  }

  try {
    yield* translateAnthropicStream(stream);
  } catch (err) {
    yield {
      type: "error",
      error: err instanceof Error ? err.message : String(err),
      retryable: isRetryableError(err),
    };
  }
}

// ---------- Request translation ----------

function convertMessage(msg: ChatMessage): Record<string, unknown> {
  if (msg.role === "system") {
    // Anthropic system goes in a top-level field; if a caller mistakenly
    // includes a system message here we coerce it to a user message rather
    // than dropping it.
    return { role: "user", content: stringifyContent(msg) };
  }

  if (msg.role === "tool") {
    // Tool results are user-role messages with tool_result content blocks
    // in Anthropic's format.
    if (typeof msg.content === "string") {
      return { role: "user", content: msg.content };
    }
    return {
      role: "user",
      content: msg.content.map((part) => {
        if (part.type === "tool_result") {
          return {
            type: "tool_result",
            tool_use_id: part.toolCallId,
            content: part.content,
            ...(part.isError ? { is_error: true } : {}),
          };
        }
        return part;
      }),
    };
  }

  if (typeof msg.content === "string") {
    return { role: msg.role, content: msg.content };
  }

  return {
    role: msg.role,
    content: msg.content.map((part) => {
      if (part.type === "text") return { type: "text", text: part.text };
      if (part.type === "tool_use") {
        return {
          type: "tool_use",
          id: part.toolCallId,
          name: part.name,
          input: part.input,
        };
      }
      // tool_result on a non-tool role — translate just in case.
      return {
        type: "tool_result",
        tool_use_id: part.toolCallId,
        content: part.content,
      };
    }),
  };
}

function stringifyContent(msg: ChatMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "tool_result") return part.content;
      return "";
    })
    .join("");
}

function convertTool(
  tool: ToolDefinition,
  isLast: boolean,
  enableCaching: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
  // Cache the tail of the tools array; this caches the whole prefix
  // (system + tools) for subsequent calls.
  if (isLast && enableCaching) {
    out.cache_control = { type: "ephemeral" };
  }
  return out;
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as { status?: number }).status;
  if (typeof status === "number") {
    return status === 408 || status === 429 || status >= 500;
  }
  return true;
}
