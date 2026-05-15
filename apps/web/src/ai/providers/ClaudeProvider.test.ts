import { describe, it, expect, vi } from "vitest";
import {
  ClaudeProvider,
  type AnthropicClientLike,
} from "./ClaudeProvider";
import type { AnthropicStreamEvent } from "./anthropic-translation";
import type { GenerateChunk, GenerateRequest } from "../types";

async function* asyncIter<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

function makeFakeClient(
  events: AnthropicStreamEvent[],
  streamSpy?: ReturnType<typeof vi.fn>,
): AnthropicClientLike {
  const stream = streamSpy ?? vi.fn();
  stream.mockReturnValue(asyncIter(events));
  return {
    messages: { stream: stream as unknown as AnthropicClientLike["messages"]["stream"] },
  };
}

async function collect(
  s: AsyncIterable<GenerateChunk>,
): Promise<GenerateChunk[]> {
  const out: GenerateChunk[] = [];
  for await (const c of s) out.push(c);
  return out;
}

const minimalRequest: GenerateRequest = {
  model: "claude-sonnet-4-6",
  messages: [{ role: "user", content: "hi" }],
};

describe("ClaudeProvider", () => {
  it("lists Claude models", () => {
    const provider = new ClaudeProvider({
      clientFactory: () => makeFakeClient([]),
    });
    const ids = provider.listModels().map((m) => m.id);
    expect(ids).toContain("claude-opus-4-7");
    expect(ids).toContain("claude-sonnet-4-6");
  });

  it("rejects construction without apiKey or clientFactory", () => {
    expect(() => new ClaudeProvider({})).toThrow(/apiKey required/);
  });

  it("wraps system prompt with ephemeral cache_control when caching enabled", () => {
    const provider = new ClaudeProvider({
      clientFactory: () => makeFakeClient([]),
    });
    const body = provider.buildBody({
      ...minimalRequest,
      system: "you are helpful",
    });
    expect(body.system).toEqual([
      {
        type: "text",
        text: "you are helpful",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("uses plain string system when caching is disabled", () => {
    const provider = new ClaudeProvider({
      clientFactory: () => makeFakeClient([]),
      enablePromptCaching: false,
    });
    const body = provider.buildBody({
      ...minimalRequest,
      system: "you are helpful",
    });
    expect(body.system).toBe("you are helpful");
  });

  it("marks only the last tool with cache_control", () => {
    const provider = new ClaudeProvider({
      clientFactory: () => makeFakeClient([]),
    });
    const body = provider.buildBody({
      ...minimalRequest,
      tools: [
        {
          name: "first",
          description: "",
          inputSchema: { type: "object" },
        },
        {
          name: "second",
          description: "",
          inputSchema: { type: "object" },
        },
      ],
    });
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools[0].cache_control).toBeUndefined();
    expect(tools[1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("emits tool_choice = { type: 'tool', name } when forceTool is set", () => {
    const provider = new ClaudeProvider({
      clientFactory: () => makeFakeClient([]),
    });
    const body = provider.buildBody({
      ...minimalRequest,
      tools: [
        { name: "create_clip", description: "", inputSchema: { type: "object" } },
      ],
      forceTool: "create_clip",
    });
    expect(body.tool_choice).toEqual({ type: "tool", name: "create_clip" });
  });

  it("translates tool_use parts to Anthropic content blocks", () => {
    const provider = new ClaudeProvider({
      clientFactory: () => makeFakeClient([]),
    });
    const body = provider.buildBody({
      ...minimalRequest,
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "ok " },
            {
              type: "tool_use",
              toolCallId: "toolu_xyz",
              name: "create_clip",
              input: { color: "red" },
            },
          ],
        },
      ],
    });
    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content).toEqual([
      { type: "text", text: "ok " },
      {
        type: "tool_use",
        id: "toolu_xyz",
        name: "create_clip",
        input: { color: "red" },
      },
    ]);
  });

  it("translates tool-role messages to user with tool_result blocks", () => {
    const provider = new ClaudeProvider({
      clientFactory: () => makeFakeClient([]),
    });
    const body = provider.buildBody({
      ...minimalRequest,
      messages: [
        {
          role: "tool",
          content: [
            { type: "tool_result", toolCallId: "toolu_xyz", content: "ok" },
          ],
        },
      ],
    });
    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toEqual([
      { type: "tool_result", tool_use_id: "toolu_xyz", content: "ok" },
    ]);
  });

  it("calls the SDK and yields translated chunks", async () => {
    const streamSpy = vi.fn();
    const fakeClient = makeFakeClient(
      [
        { type: "message_start", message: { model: "claude-sonnet-4-6" } },
        { type: "content_block_start", index: 0, content_block: { type: "text" } },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "hi" },
        },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
        { type: "message_stop" },
      ],
      streamSpy,
    );
    const provider = new ClaudeProvider({ clientFactory: () => fakeClient });
    const chunks = await collect(provider.generate(minimalRequest));

    expect(streamSpy).toHaveBeenCalledTimes(1);
    const [body] = streamSpy.mock.calls[0];
    expect(body).toMatchObject({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
    });
    expect(chunks[0]).toEqual({
      type: "message-start",
      model: "claude-sonnet-4-6",
    });
    expect(chunks.find((c) => c.type === "text-delta")).toMatchObject({
      text: "hi",
    });
    expect(chunks.at(-1)?.type).toBe("done");
  });

  it("yields an error chunk when the SDK throws synchronously", async () => {
    const failingClient: AnthropicClientLike = {
      messages: {
        stream: vi.fn().mockImplementation(() => {
          throw Object.assign(new Error("Unauthorized"), { status: 401 });
        }),
      },
    };
    const provider = new ClaudeProvider({
      clientFactory: () => failingClient,
    });
    const chunks = await collect(provider.generate(minimalRequest));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: "error", retryable: false });
  });
});
