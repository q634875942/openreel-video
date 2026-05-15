import { describe, it, expect } from "vitest";
import {
  translateAnthropicStream,
  type AnthropicStreamEvent,
} from "./anthropic-translation";
import type { GenerateChunk } from "../types";

async function* from(events: AnthropicStreamEvent[]): AsyncIterable<AnthropicStreamEvent> {
  for (const e of events) yield e;
}

async function collect(
  stream: AsyncIterable<GenerateChunk>,
): Promise<GenerateChunk[]> {
  const out: GenerateChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

describe("translateAnthropicStream", () => {
  it("emits message-start from message_start.model", async () => {
    const chunks = await collect(
      translateAnthropicStream(
        from([
          { type: "message_start", message: { model: "claude-sonnet-4-6" } },
          { type: "message_stop" },
        ]),
      ),
    );
    expect(chunks[0]).toEqual({ type: "message-start", model: "claude-sonnet-4-6" });
  });

  it("emits text-delta for text content blocks", async () => {
    const chunks = await collect(
      translateAnthropicStream(
        from([
          { type: "message_start", message: { model: "m" } },
          { type: "content_block_start", index: 0, content_block: { type: "text" } },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "Hello, " },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "world!" },
          },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "end_turn" } },
          { type: "message_stop" },
        ]),
      ),
    );
    const texts = chunks.filter((c) => c.type === "text-delta");
    expect(texts.map((t) => (t as { text: string }).text)).toEqual([
      "Hello, ",
      "world!",
    ]);
  });

  it("emits tool-use-start / input-delta / end keyed by Anthropic content_block id", async () => {
    const chunks = await collect(
      translateAnthropicStream(
        from([
          { type: "message_start", message: { model: "m" } },
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "toolu_xyz", name: "create_clip" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: '{"a":' },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: '1}' },
          },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "tool_use" } },
          { type: "message_stop" },
        ]),
      ),
    );

    const filtered = chunks.filter((c) => c.type !== "message-start");
    expect(filtered).toEqual<GenerateChunk[]>([
      { type: "tool-use-start", toolCallId: "toolu_xyz", name: "create_clip" },
      {
        type: "tool-use-input-delta",
        toolCallId: "toolu_xyz",
        partialJson: '{"a":',
      },
      {
        type: "tool-use-input-delta",
        toolCallId: "toolu_xyz",
        partialJson: "1}",
      },
      { type: "tool-use-end", toolCallId: "toolu_xyz" },
      { type: "done", finishReason: "tool_use", usage: undefined },
    ]);
  });

  it("maps Anthropic stop reasons to our FinishReason", async () => {
    const cases: Array<{ reason: string; expected: string }> = [
      { reason: "end_turn", expected: "stop" },
      { reason: "stop_sequence", expected: "stop" },
      { reason: "max_tokens", expected: "max_tokens" },
      { reason: "tool_use", expected: "tool_use" },
    ];
    for (const { reason, expected } of cases) {
      const chunks = await collect(
        translateAnthropicStream(
          from([
            { type: "message_start", message: { model: "m" } },
            { type: "message_delta", delta: { stop_reason: reason } },
            { type: "message_stop" },
          ]),
        ),
      );
      const done = chunks.find((c) => c.type === "done");
      expect(done && (done as { finishReason: string }).finishReason).toBe(expected);
    }
  });

  it("captures token usage including cache fields", async () => {
    const chunks = await collect(
      translateAnthropicStream(
        from([
          {
            type: "message_start",
            message: {
              model: "m",
              usage: {
                input_tokens: 12,
                output_tokens: 0,
                cache_read_input_tokens: 100,
                cache_creation_input_tokens: 50,
              },
            },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 7 },
          },
          { type: "message_stop" },
        ]),
      ),
    );
    const done = chunks.find((c) => c.type === "done");
    expect((done as { usage: { outputTokens: number } }).usage).toEqual({
      inputTokens: 12,
      outputTokens: 7,
      cacheReadInputTokens: 100,
      cacheCreationInputTokens: 50,
    });
  });

  it("emits done even when message_stop is missing (defensive)", async () => {
    const chunks = await collect(
      translateAnthropicStream(
        from([
          { type: "message_start", message: { model: "m" } },
          { type: "message_delta", delta: { stop_reason: "end_turn" } },
        ]),
      ),
    );
    expect(chunks.at(-1)?.type).toBe("done");
  });
});
