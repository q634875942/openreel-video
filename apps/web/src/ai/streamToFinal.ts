// streamToFinal — collect an AsyncIterable<GenerateChunk> into a single
// FinalResult. Used by call sites that don't need streaming UI (e.g. tests,
// tool-result post-processing) and by the AI panel as the fallback after
// streaming finishes.
//
// Pure function: no I/O, fully unit-testable.

import type {
  FinalResult,
  FinalToolCall,
  GenerateChunk,
} from "./types";

interface ToolCallBuilder {
  readonly toolCallId: string;
  name: string;
  inputBuffer: string;
}

export async function streamToFinal(
  stream: AsyncIterable<GenerateChunk>,
): Promise<FinalResult> {
  let text = "";
  let finishReason: FinalResult["finishReason"] = "stop";
  let usage: FinalResult["usage"];
  let model: string | undefined;
  let sawTerminal = false;
  let errored = false;
  let errorMessage = "";

  const toolCallOrder: string[] = [];
  const toolCalls = new Map<string, ToolCallBuilder>();

  for await (const chunk of stream) {
    if (sawTerminal) break;
    switch (chunk.type) {
      case "message-start":
        model = chunk.model;
        break;
      case "text-delta":
        text += chunk.text;
        break;
      case "tool-use-start":
        if (!toolCalls.has(chunk.toolCallId)) {
          toolCallOrder.push(chunk.toolCallId);
        }
        toolCalls.set(chunk.toolCallId, {
          toolCallId: chunk.toolCallId,
          name: chunk.name,
          inputBuffer: "",
        });
        break;
      case "tool-use-input-delta": {
        const builder = toolCalls.get(chunk.toolCallId);
        if (builder) builder.inputBuffer += chunk.partialJson;
        break;
      }
      case "tool-use-end":
        // No-op for assembly purposes; we'll parse buffered JSON at the end.
        break;
      case "done":
        finishReason = chunk.finishReason;
        usage = chunk.usage;
        sawTerminal = true;
        break;
      case "error":
        errored = true;
        errorMessage = chunk.error;
        finishReason = "error";
        sawTerminal = true;
        break;
    }
  }

  const assembledToolCalls: FinalToolCall[] = toolCallOrder.map((id) => {
    const builder = toolCalls.get(id);
    if (!builder) {
      // Defensive — should never happen but keeps the array dense.
      return { toolCallId: id, name: "", input: null };
    }
    if (builder.inputBuffer.length === 0) {
      return { toolCallId: id, name: builder.name, input: {} };
    }
    try {
      return {
        toolCallId: id,
        name: builder.name,
        input: JSON.parse(builder.inputBuffer),
      };
    } catch (err) {
      return {
        toolCallId: id,
        name: builder.name,
        input: builder.inputBuffer,
        inputParseError:
          err instanceof Error ? err.message : String(err),
      };
    }
  });

  if (errored) {
    throw new StreamErrorWithPartialResult(errorMessage, {
      text,
      toolCalls: assembledToolCalls,
      finishReason,
      usage,
      model,
    });
  }

  return {
    text,
    toolCalls: assembledToolCalls,
    finishReason,
    usage,
    model,
  };
}

// Thrown when the stream surfaces an error chunk. Exposes whatever partial
// content arrived before the error, so callers can show "AI got partway
// through and crashed; here's what it managed to say".
export class StreamErrorWithPartialResult extends Error {
  readonly partial: FinalResult;

  constructor(message: string, partial: FinalResult) {
    super(message);
    this.name = "StreamErrorWithPartialResult";
    this.partial = partial;
  }
}
