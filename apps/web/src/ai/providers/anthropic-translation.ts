// Translate Anthropic's native streaming events into our unified
// GenerateChunk stream. Pure async generator — no SDK import, so it can
// be unit-tested with hand-crafted event arrays.

import type {
  FinishReason,
  GenerateChunk,
  TokenUsage,
} from "../types";

// Structural shape of Anthropic's MessageStreamEvent we depend on.
// See: https://docs.anthropic.com/en/api/messages-streaming
export type AnthropicStreamEvent =
  | { type: "message_start"; message: { model?: string; usage?: AnthropicUsage } }
  | {
      type: "content_block_start";
      index: number;
      content_block:
        | { type: "text"; text?: string }
        | { type: "tool_use"; id: string; name: string; input?: unknown };
    }
  | {
      type: "content_block_delta";
      index: number;
      delta:
        | { type: "text_delta"; text: string }
        | { type: "input_json_delta"; partial_json: string };
    }
  | { type: "content_block_stop"; index: number }
  | {
      type: "message_delta";
      delta: { stop_reason?: string };
      usage?: AnthropicUsage;
    }
  | { type: "message_stop" };

interface AnthropicUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_input_tokens?: number;
  readonly cache_creation_input_tokens?: number;
}

export async function* translateAnthropicStream(
  stream: AsyncIterable<AnthropicStreamEvent>,
): AsyncIterable<GenerateChunk> {
  // Anthropic identifies content blocks by index; we need to remember which
  // index is a tool_use and what its id/name are so we can emit our
  // toolCallId-keyed chunks.
  const toolBlocksByIndex = new Map<number, { id: string; name: string }>();
  let stopReason: FinishReason = "stop";
  let usage: TokenUsage | undefined;

  for await (const event of stream) {
    switch (event.type) {
      case "message_start": {
        if (event.message.model) {
          yield { type: "message-start", model: event.message.model };
        }
        if (event.message.usage) {
          usage = mergeUsage(usage, event.message.usage);
        }
        break;
      }

      case "content_block_start": {
        if (event.content_block.type === "tool_use") {
          toolBlocksByIndex.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
          });
          yield {
            type: "tool-use-start",
            toolCallId: event.content_block.id,
            name: event.content_block.name,
          };
        }
        // text blocks emit content via subsequent text_delta events.
        break;
      }

      case "content_block_delta": {
        if (event.delta.type === "text_delta") {
          if (event.delta.text.length > 0) {
            yield { type: "text-delta", text: event.delta.text };
          }
        } else if (event.delta.type === "input_json_delta") {
          const block = toolBlocksByIndex.get(event.index);
          if (block && event.delta.partial_json.length > 0) {
            yield {
              type: "tool-use-input-delta",
              toolCallId: block.id,
              partialJson: event.delta.partial_json,
            };
          }
        }
        break;
      }

      case "content_block_stop": {
        const block = toolBlocksByIndex.get(event.index);
        if (block) {
          yield { type: "tool-use-end", toolCallId: block.id };
        }
        break;
      }

      case "message_delta": {
        if (event.delta.stop_reason) {
          stopReason = mapStopReason(event.delta.stop_reason);
        }
        if (event.usage) {
          usage = mergeUsage(usage, event.usage);
        }
        break;
      }

      case "message_stop": {
        yield { type: "done", finishReason: stopReason, usage };
        return;
      }
    }
  }

  // Defensive: emit a done if the stream ended without an explicit
  // message_stop event.
  yield { type: "done", finishReason: stopReason, usage };
}

function mapStopReason(value: string): FinishReason {
  switch (value) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "max_tokens";
    case "tool_use":
      return "tool_use";
    default:
      return "stop";
  }
}

function mergeUsage(
  existing: TokenUsage | undefined,
  incoming: AnthropicUsage,
): TokenUsage {
  return {
    inputTokens: incoming.input_tokens ?? existing?.inputTokens ?? 0,
    outputTokens: incoming.output_tokens ?? existing?.outputTokens ?? 0,
    cacheReadInputTokens:
      incoming.cache_read_input_tokens ?? existing?.cacheReadInputTokens,
    cacheCreationInputTokens:
      incoming.cache_creation_input_tokens ??
      existing?.cacheCreationInputTokens,
  };
}
