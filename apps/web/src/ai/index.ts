// Barrel export for the AI abstraction layer (feat-004).
//
// Concrete provider implementations and the provider registry land in
// feat-005 and will re-export through here.

export type {
  Role,
  ChatMessage,
  ContentPart,
  TextPart,
  ToolUsePart,
  ToolResultPart,
  ToolDefinition,
  GenerateRequest,
  FinishReason,
  TokenUsage,
  GenerateChunk,
  MessageStartChunk,
  TextDeltaChunk,
  ToolUseStartChunk,
  ToolUseInputDeltaChunk,
  ToolUseEndChunk,
  DoneChunk,
  ErrorChunk,
  FinalResult,
  FinalToolCall,
  ModelInfo,
  ProviderInfo,
} from "./types";

export type { AIProvider, GenerateOptions } from "./AIProvider";

export {
  streamToFinal,
  StreamErrorWithPartialResult,
} from "./streamToFinal";

export { validateGenerateRequest } from "./validateGenerateRequest";
