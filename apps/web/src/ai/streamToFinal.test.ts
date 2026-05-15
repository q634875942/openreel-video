import { describe, it, expect } from "vitest";
import {
  streamToFinal,
  StreamErrorWithPartialResult,
} from "./streamToFinal";
import type { GenerateChunk } from "./types";

// Helper: turn an array of chunks into an AsyncIterable, the way a real
// provider implementation would yield them.
async function* fromArray(chunks: GenerateChunk[]): AsyncIterable<GenerateChunk> {
  for (const chunk of chunks) yield chunk;
}

describe("streamToFinal", () => {
  it("concatenates text-delta chunks into a single text string", async () => {
    const result = await streamToFinal(
      fromArray([
        { type: "message-start", model: "test-model" },
        { type: "text-delta", text: "Hello, " },
        { type: "text-delta", text: "world" },
        { type: "text-delta", text: "!" },
        { type: "done", finishReason: "stop" },
      ]),
    );
    expect(result.text).toBe("Hello, world!");
    expect(result.finishReason).toBe("stop");
    expect(result.model).toBe("test-model");
    expect(result.toolCalls).toEqual([]);
  });

  it("assembles a single tool call by concatenating input deltas and parsing JSON", async () => {
    const result = await streamToFinal(
      fromArray([
        { type: "message-start", model: "test" },
        {
          type: "tool-use-start",
          toolCallId: "call_1",
          name: "create_clip",
        },
        { type: "tool-use-input-delta", toolCallId: "call_1", partialJson: '{"color":' },
        { type: "tool-use-input-delta", toolCallId: "call_1", partialJson: '"red","' },
        { type: "tool-use-input-delta", toolCallId: "call_1", partialJson: 'size":42}' },
        { type: "tool-use-end", toolCallId: "call_1" },
        { type: "done", finishReason: "tool_use" },
      ]),
    );
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toEqual({
      toolCallId: "call_1",
      name: "create_clip",
      input: { color: "red", size: 42 },
    });
    expect(result.finishReason).toBe("tool_use");
  });

  it("preserves order across multiple concurrent tool calls", async () => {
    const result = await streamToFinal(
      fromArray([
        { type: "tool-use-start", toolCallId: "a", name: "first" },
        { type: "tool-use-start", toolCallId: "b", name: "second" },
        { type: "tool-use-input-delta", toolCallId: "a", partialJson: "{}" },
        { type: "tool-use-input-delta", toolCallId: "b", partialJson: "{}" },
        { type: "tool-use-end", toolCallId: "a" },
        { type: "tool-use-end", toolCallId: "b" },
        { type: "done", finishReason: "tool_use" },
      ]),
    );
    expect(result.toolCalls.map((c) => c.toolCallId)).toEqual(["a", "b"]);
    expect(result.toolCalls.map((c) => c.name)).toEqual(["first", "second"]);
  });

  it("surfaces a parse error for malformed tool input JSON without throwing", async () => {
    const result = await streamToFinal(
      fromArray([
        { type: "tool-use-start", toolCallId: "x", name: "broken" },
        { type: "tool-use-input-delta", toolCallId: "x", partialJson: "{not valid" },
        { type: "tool-use-end", toolCallId: "x" },
        { type: "done", finishReason: "tool_use" },
      ]),
    );
    expect(result.toolCalls[0].input).toBe("{not valid");
    expect(result.toolCalls[0].inputParseError).toBeDefined();
  });

  it("treats an empty input buffer as an empty object", async () => {
    const result = await streamToFinal(
      fromArray([
        { type: "tool-use-start", toolCallId: "x", name: "no_args" },
        { type: "tool-use-end", toolCallId: "x" },
        { type: "done", finishReason: "tool_use" },
      ]),
    );
    expect(result.toolCalls[0].input).toEqual({});
    expect(result.toolCalls[0].inputParseError).toBeUndefined();
  });

  it("captures token usage when the provider reports it", async () => {
    const result = await streamToFinal(
      fromArray([
        { type: "text-delta", text: "hi" },
        {
          type: "done",
          finishReason: "stop",
          usage: { inputTokens: 12, outputTokens: 3 },
        },
      ]),
    );
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
  });

  it("throws StreamErrorWithPartialResult on error chunk, exposing partial text", async () => {
    const promise = streamToFinal(
      fromArray([
        { type: "text-delta", text: "I started saying " },
        { type: "text-delta", text: "something when " },
        { type: "error", error: "network died", retryable: true },
      ]),
    );
    await expect(promise).rejects.toBeInstanceOf(StreamErrorWithPartialResult);
    try {
      await promise;
    } catch (err) {
      const e = err as StreamErrorWithPartialResult;
      expect(e.message).toBe("network died");
      expect(e.partial.text).toBe("I started saying something when ");
      expect(e.partial.finishReason).toBe("error");
    }
  });

  it("ignores chunks after the terminal done chunk", async () => {
    const result = await streamToFinal(
      fromArray([
        { type: "text-delta", text: "ok" },
        { type: "done", finishReason: "stop" },
        // The following should be ignored.
        { type: "text-delta", text: "ignored" },
      ]),
    );
    expect(result.text).toBe("ok");
  });
});
