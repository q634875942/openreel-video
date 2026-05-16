// Shared types for the multi-provider AI abstraction layer.
//
// The provider-neutral contract is intentionally a subset of what both
// Anthropic and OpenAI accept natively. Each concrete provider in feat-005
// will translate these into its own SDK calls.

// ---------- Chat / messages ----------

export type Role = "system" | "user" | "assistant" | "tool";

export interface TextPart {
  readonly type: "text";
  readonly text: string;
}

export interface ToolUsePart {
  readonly type: "tool_use";
  readonly toolCallId: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface ToolResultPart {
  readonly type: "tool_result";
  readonly toolCallId: string;
  // Stringified result; complex outputs should be JSON-stringified by caller.
  readonly content: string;
  readonly isError?: boolean;
}

export type ContentPart = TextPart | ToolUsePart | ToolResultPart;

export interface ChatMessage {
  readonly role: Role;
  // For "system" / "user" without tool use, callers can pass a bare string.
  // Multi-part content is required when mixing text and tool_use / tool_result.
  readonly content: string | readonly ContentPart[];
}

// ---------- Tools ----------

// JSON Schema as the lowest-common-denominator description. Both Anthropic
// `tool_use` and OpenAI `function_calling` accept this shape; providers are
// responsible for any necessary repackaging.
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>; // JSON Schema document
}

// ---------- Request / response ----------

export interface GenerateRequest {
  readonly model: string;
  readonly system?: string;
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolDefinition[];
  // If set, the provider MUST attempt to call this tool. Mirrors Anthropic's
  // `tool_choice` and OpenAI's `tool_choice` with a specific function name.
  readonly forceTool?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export type FinishReason =
  | "stop"
  | "tool_use"
  | "max_tokens"
  | "content_filter"
  | "error";

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  // Anthropic-specific but useful when present.
  readonly cacheReadInputTokens?: number;
  readonly cacheCreationInputTokens?: number;
}

// ---------- Stream chunks ----------
//
// The unified chunk format. Each provider implementation in feat-005 is
// responsible for translating its native stream events into these shapes.
// Order guarantees:
//   1. At most one "message-start" arrives first
//   2. Text-delta and tool-use-* chunks interleave by content block index
//   3. "done" arrives exactly once, last (unless an error short-circuits)

export interface MessageStartChunk {
  readonly type: "message-start";
  readonly model: string;
}

export interface TextDeltaChunk {
  readonly type: "text-delta";
  readonly text: string;
}

export interface ToolUseStartChunk {
  readonly type: "tool-use-start";
  readonly toolCallId: string;
  readonly name: string;
}

export interface ToolUseInputDeltaChunk {
  readonly type: "tool-use-input-delta";
  readonly toolCallId: string;
  // Partial JSON string for the tool input. Concatenate across chunks then
  // JSON.parse at end. Some providers stream the full JSON in one go.
  readonly partialJson: string;
}

export interface ToolUseEndChunk {
  readonly type: "tool-use-end";
  readonly toolCallId: string;
}

export interface DoneChunk {
  readonly type: "done";
  readonly finishReason: FinishReason;
  readonly usage?: TokenUsage;
}

export interface ErrorChunk {
  readonly type: "error";
  readonly error: string;
  // True if a retry with the same request is reasonable (network blip etc.).
  readonly retryable: boolean;
}

export type GenerateChunk =
  | MessageStartChunk
  | TextDeltaChunk
  | ToolUseStartChunk
  | ToolUseInputDeltaChunk
  | ToolUseEndChunk
  | DoneChunk
  | ErrorChunk;

// ---------- Final assembled result ----------

export interface FinalToolCall {
  readonly toolCallId: string;
  readonly name: string;
  readonly input: unknown; // Parsed JSON, or string if parse failed
  readonly inputParseError?: string;
}

export interface FinalResult {
  readonly text: string;
  readonly toolCalls: readonly FinalToolCall[];
  readonly finishReason: FinishReason;
  readonly usage?: TokenUsage;
  readonly model?: string;
}

// ---------- Model + provider metadata ----------

export interface ModelInfo {
  readonly id: string;          // Provider-native model id, e.g. "claude-sonnet-4-6"
  readonly displayName: string;
  readonly contextWindow: number;
  readonly supportsTools: boolean;
  readonly supportsVision?: boolean;
  // Whether the model accepts a forced tool_choice (Anthropic
  // `tool_choice: { type: 'tool', name }` / OpenAI `tool_choice:
  // { type: 'function', function: { name } }`). Reasoning models from
  // DeepSeek currently reject this and require `tool_choice: 'auto'`
  // (or omission). Default treatment when undefined: provider may
  // assume true.
  readonly supportsForcedToolChoice?: boolean;
  // Approximate USD cost per 1M tokens. Provider implementations populate
  // these; the UI uses them to estimate request cost before sending.
  readonly inputCostPerMTokens?: number;
  readonly outputCostPerMTokens?: number;
}

export interface ProviderInfo {
  readonly id: string;
  readonly displayName: string;
  // True iff the provider can run without a user-supplied API key (e.g.
  // local Ollama). All hosted providers (Anthropic, OpenAI, DeepSeek)
  // return false here.
  readonly keylessOk: boolean;
}
