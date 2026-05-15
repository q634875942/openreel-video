// Translate an OpenAI-shaped streaming completion (used by DeepSeek,
// OpenAI itself, and the OpenAI-compatible "Compatible" provider) into
// our unified GenerateChunk stream.
//
// Pure async generator: takes any AsyncIterable that yields the OpenAI
// chunk shape, emits GenerateChunks. No network or SDK dependency, so it
// can be unit-tested by feeding hand-crafted chunk arrays.

import type {
  FinishReason,
  GenerateChunk,
  TokenUsage,
} from "../types";

// Minimal structural shape of OpenAI ChatCompletionChunk we depend on.
// Deliberately not importing OpenAI types here so tests can feed plain
// objects without pulling the SDK.
export interface OpenAICompatChunk {
  readonly model?: string;
  readonly choices?: ReadonlyArray<{
    readonly index?: number;
    readonly delta?: {
      readonly role?: string;
      readonly content?: string | null;
      readonly tool_calls?: ReadonlyArray<{
        readonly index: number;
        readonly id?: string;
        readonly type?: string;
        readonly function?: {
          readonly name?: string;
          readonly arguments?: string;
        };
      }>;
    };
    readonly finish_reason?: string | null;
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
  } | null;
}

interface ToolCallState {
  readonly id: string;
  readonly name: string;
  hasStarted: boolean;
}

export async function* translateOpenAIStream(
  stream: AsyncIterable<OpenAICompatChunk>,
): AsyncIterable<GenerateChunk> {
  let sawMessageStart = false;
  let toolCallsByIndex = new Map<number, ToolCallState>();
  let pendingFinish: FinishReason | null = null;
  let pendingUsage: TokenUsage | undefined;

  for await (const chunk of stream) {
    if (!sawMessageStart && chunk.model) {
      yield { type: "message-start", model: chunk.model };
      sawMessageStart = true;
    }

    const choice = chunk.choices?.[0];
    if (!choice) {
      // Some providers send a final usage-only chunk with no choices.
      if (chunk.usage) {
        pendingUsage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
      continue;
    }

    const delta = choice.delta;
    if (delta) {
      if (typeof delta.content === "string" && delta.content.length > 0) {
        yield { type: "text-delta", text: delta.content };
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          let state = toolCallsByIndex.get(tc.index);

          // The id and function.name typically arrive on the first chunk
          // for a given index; later chunks for the same index carry only
          // the function.arguments delta.
          if (!state) {
            const id = tc.id ?? `tool_${tc.index}`;
            const name = tc.function?.name ?? "";
            state = { id, name, hasStarted: false };
            toolCallsByIndex.set(tc.index, state);
          } else if (tc.id && state.id !== tc.id) {
            // Some providers wait until later chunks to reveal the id.
            // Replace the placeholder with the real id.
            toolCallsByIndex.set(tc.index, {
              ...state,
              id: tc.id,
            });
            state = toolCallsByIndex.get(tc.index)!;
          }
          if (!state.hasStarted && state.name) {
            yield {
              type: "tool-use-start",
              toolCallId: state.id,
              name: state.name,
            };
            state.hasStarted = true;
          }
          const args = tc.function?.arguments;
          if (typeof args === "string" && args.length > 0) {
            yield {
              type: "tool-use-input-delta",
              toolCallId: state.id,
              partialJson: args,
            };
          }
        }
      }
    }

    if (choice.finish_reason) {
      pendingFinish = mapFinishReason(choice.finish_reason);
    }

    if (chunk.usage) {
      pendingUsage = {
        inputTokens: chunk.usage.prompt_tokens ?? 0,
        outputTokens: chunk.usage.completion_tokens ?? 0,
      };
    }
  }

  // Emit a terminal tool-use-end for any tool calls we started — OpenAI
  // never emits an explicit end marker.
  for (const state of toolCallsByIndex.values()) {
    if (state.hasStarted) {
      yield { type: "tool-use-end", toolCallId: state.id };
    }
  }

  yield {
    type: "done",
    finishReason: pendingFinish ?? "stop",
    usage: pendingUsage,
  };
}

function mapFinishReason(value: string): FinishReason {
  switch (value) {
    case "stop":
      return "stop";
    case "length":
      return "max_tokens";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "content_filter":
      return "content_filter";
    default:
      return "stop";
  }
}
