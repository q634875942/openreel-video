import { describe, it, expect, vi } from "vitest";
import {
  DeepSeekProvider,
  buildOpenAICompatBody,
  type OpenAICompatClient,
} from "./DeepSeekProvider";
import type { OpenAICompatChunk } from "./openai-translation";
import type { GenerateChunk, GenerateRequest } from "../types";

async function* asyncIter<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

function makeFakeClient(
  chunks: OpenAICompatChunk[],
  createSpy?: ReturnType<typeof vi.fn>,
): OpenAICompatClient {
  const create = createSpy ?? vi.fn();
  create.mockResolvedValue(asyncIter(chunks));
  return {
    chat: {
      completions: {
        create: create as unknown as OpenAICompatClient["chat"]["completions"]["create"],
      },
    },
  };
}

async function collect(
  stream: AsyncIterable<GenerateChunk>,
): Promise<GenerateChunk[]> {
  const out: GenerateChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

const minimalRequest: GenerateRequest = {
  model: "deepseek-v4-flash",
  messages: [{ role: "user", content: "hi" }],
};

describe("buildOpenAICompatBody", () => {
  it("translates a minimal request to OpenAI body shape", () => {
    const body = buildOpenAICompatBody(minimalRequest);
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("prepends system message when system is set", () => {
    const body = buildOpenAICompatBody({
      ...minimalRequest,
      system: "you are helpful",
    });
    expect((body.messages as Array<{ role: string }>)[0]).toEqual({
      role: "system",
      content: "you are helpful",
    });
  });

  it("translates tools and uses 'auto' tool_choice by default", () => {
    const body = buildOpenAICompatBody({
      ...minimalRequest,
      tools: [
        {
          name: "create_clip",
          description: "make a clip",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    });
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "create_clip",
          description: "make a clip",
          parameters: { type: "object", properties: {} },
        },
      },
    ]);
    expect(body.tool_choice).toBe("auto");
  });

  it("uses forced tool_choice when forceTool is set", () => {
    const body = buildOpenAICompatBody({
      ...minimalRequest,
      tools: [
        {
          name: "create_clip",
          description: "",
          inputSchema: { type: "object" },
        },
      ],
      forceTool: "create_clip",
    });
    expect(body.tool_choice).toEqual({
      type: "function",
      function: { name: "create_clip" },
    });
  });

  it("translates assistant message with tool_use parts to tool_calls", () => {
    const body = buildOpenAICompatBody({
      ...minimalRequest,
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "I'll do it." },
            {
              type: "tool_use",
              toolCallId: "call_1",
              name: "create_clip",
              input: { color: "red" },
            },
          ],
        },
      ],
    });
    const assistant = (body.messages as Array<Record<string, unknown>>)[0];
    expect(assistant.role).toBe("assistant");
    expect(assistant.content).toBe("I'll do it.");
    expect(assistant.tool_calls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: {
          name: "create_clip",
          arguments: JSON.stringify({ color: "red" }),
        },
      },
    ]);
  });

  it("translates tool-role messages to role=tool with tool_call_id", () => {
    const body = buildOpenAICompatBody({
      ...minimalRequest,
      messages: [
        {
          role: "tool",
          content: [
            {
              type: "tool_result",
              toolCallId: "call_1",
              content: "ok",
            },
          ],
        },
      ],
    });
    expect((body.messages as Array<Record<string, unknown>>)[0]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "ok",
    });
  });
});

describe("DeepSeekProvider", () => {
  it("returns its DeepSeek model list", () => {
    const provider = new DeepSeekProvider({
      clientFactory: () => makeFakeClient([]),
    });
    const ids = provider.listModels().map((m) => m.id);
    expect(ids).toContain("deepseek-v4-flash");
    expect(ids).toContain("deepseek-v4-pro");
  });

  it("rejects construction without apiKey or clientFactory", () => {
    expect(() => new DeepSeekProvider({})).toThrow(/apiKey required/);
  });

  it("calls the SDK with a translated body and yields translated chunks", async () => {
    const createSpy = vi.fn();
    const fakeClient = makeFakeClient(
      [
        { model: "deepseek-chat", choices: [{ delta: { role: "assistant" } }] },
        { choices: [{ delta: { content: "hello" } }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      ],
      createSpy,
    );
    const provider = new DeepSeekProvider({ clientFactory: () => fakeClient });
    const chunks = await collect(provider.generate(minimalRequest));

    expect(createSpy).toHaveBeenCalledTimes(1);
    const [body] = createSpy.mock.calls[0];
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(chunks.some((c) => c.type === "message-start")).toBe(true);
    expect(chunks.find((c) => c.type === "text-delta")).toMatchObject({
      text: "hello",
    });
    expect(chunks.at(-1)?.type).toBe("done");
  });

  it("yields an error chunk when the SDK throws", async () => {
    const failingClient: OpenAICompatClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(
            Object.assign(new Error("Bad request"), { status: 400 }),
          ),
        },
      },
    };
    const provider = new DeepSeekProvider({
      clientFactory: () => failingClient,
    });
    const chunks = await collect(provider.generate(minimalRequest));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: "error", retryable: false });
  });

  it("marks 429 / 5xx errors as retryable", async () => {
    const failingClient: OpenAICompatClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(
            Object.assign(new Error("Too many requests"), { status: 429 }),
          ),
        },
      },
    };
    const provider = new DeepSeekProvider({
      clientFactory: () => failingClient,
    });
    const chunks = await collect(provider.generate(minimalRequest));
    expect(chunks[0]).toMatchObject({ type: "error", retryable: true });
  });
});
