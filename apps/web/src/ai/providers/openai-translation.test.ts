import { describe, it, expect } from "vitest";
import {
  translateOpenAIStream,
  type OpenAICompatChunk,
} from "./openai-translation";
import type { GenerateChunk } from "../types";

async function* from(chunks: OpenAICompatChunk[]): AsyncIterable<OpenAICompatChunk> {
  for (const c of chunks) yield c;
}

async function collect(
  stream: AsyncIterable<GenerateChunk>,
): Promise<GenerateChunk[]> {
  const out: GenerateChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

describe("translateOpenAIStream", () => {
  it("emits message-start once with the model from the first chunk", async () => {
    const chunks = await collect(
      translateOpenAIStream(
        from([
          { model: "deepseek-chat", choices: [{ delta: { role: "assistant" } }] },
          { model: "deepseek-chat", choices: [{ delta: { content: "hi" } }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
        ]),
      ),
    );
    const starts = chunks.filter((c) => c.type === "message-start");
    expect(starts).toHaveLength(1);
    expect(starts[0]).toEqual({ type: "message-start", model: "deepseek-chat" });
  });

  it("emits text-delta for each non-empty content delta", async () => {
    const chunks = await collect(
      translateOpenAIStream(
        from([
          { model: "m", choices: [{ delta: { content: "Hello, " } }] },
          { choices: [{ delta: { content: "world!" } }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
        ]),
      ),
    );
    const texts = chunks.filter((c) => c.type === "text-delta");
    expect(texts.map((t) => (t as { text: string }).text)).toEqual([
      "Hello, ",
      "world!",
    ]);
  });

  it("ignores empty/null content deltas", async () => {
    const chunks = await collect(
      translateOpenAIStream(
        from([
          { model: "m", choices: [{ delta: { content: "" } }] },
          { choices: [{ delta: { content: null } }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
        ]),
      ),
    );
    expect(chunks.filter((c) => c.type === "text-delta")).toHaveLength(0);
  });

  it("emits tool-use-start + input deltas + tool-use-end for a tool call", async () => {
    const chunks = await collect(
      translateOpenAIStream(
        from([
          {
            model: "m",
            choices: [
              {
                delta: {
                  role: "assistant",
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_1",
                      type: "function",
                      function: { name: "create_clip", arguments: "" },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, function: { arguments: '{"color":' } },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, function: { arguments: '"red"}' } },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          },
        ]),
      ),
    );

    const filtered = chunks.filter((c) => c.type !== "message-start");
    expect(filtered).toEqual<GenerateChunk[]>([
      { type: "tool-use-start", toolCallId: "call_1", name: "create_clip" },
      {
        type: "tool-use-input-delta",
        toolCallId: "call_1",
        partialJson: '{"color":',
      },
      {
        type: "tool-use-input-delta",
        toolCallId: "call_1",
        partialJson: '"red"}',
      },
      { type: "tool-use-end", toolCallId: "call_1" },
      { type: "done", finishReason: "tool_use", usage: undefined },
    ]);
  });

  it("maps OpenAI finish_reason values to our FinishReason", async () => {
    const cases: Array<{ reason: string; expected: string }> = [
      { reason: "stop", expected: "stop" },
      { reason: "length", expected: "max_tokens" },
      { reason: "tool_calls", expected: "tool_use" },
      { reason: "function_call", expected: "tool_use" },
      { reason: "content_filter", expected: "content_filter" },
    ];
    for (const { reason, expected } of cases) {
      const chunks = await collect(
        translateOpenAIStream(
          from([{ choices: [{ delta: {}, finish_reason: reason }] }]),
        ),
      );
      const done = chunks.find((c) => c.type === "done");
      expect(done && (done as { finishReason: string }).finishReason).toBe(expected);
    }
  });

  it("captures usage from a trailing usage-only chunk", async () => {
    const chunks = await collect(
      translateOpenAIStream(
        from([
          { model: "m", choices: [{ delta: { content: "ok" } }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
          { usage: { prompt_tokens: 12, completion_tokens: 4 } },
        ]),
      ),
    );
    const done = chunks.find((c) => c.type === "done");
    expect((done as { usage?: { inputTokens: number } }).usage).toEqual({
      inputTokens: 12,
      outputTokens: 4,
    });
  });

  it("yields exactly one done chunk", async () => {
    const chunks = await collect(
      translateOpenAIStream(
        from([
          { model: "m", choices: [{ delta: { content: "x" } }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
        ]),
      ),
    );
    expect(chunks.filter((c) => c.type === "done")).toHaveLength(1);
  });
});
