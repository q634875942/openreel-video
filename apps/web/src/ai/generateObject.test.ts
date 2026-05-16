import { describe, it, expect, vi } from "vitest";
import { generateObject, GenerateObjectError } from "./generateObject";
import type { AIProvider } from "./AIProvider";
import type { GenerateChunk } from "./types";
import { DEFINE_GENERATED_OBJECT_TOOL } from "./objectPrompt";

// Fake provider whose generate() yields a caller-supplied chunk sequence.
function makeFakeProvider(
  chunks: GenerateChunk[],
  generateSpy?: ReturnType<typeof vi.fn>,
): AIProvider {
  const gen = generateSpy ?? vi.fn();
  gen.mockImplementation(async function* () {
    for (const c of chunks) yield c;
  });
  return {
    info: { id: "fake", displayName: "Fake", keylessOk: true },
    listModels: () => [],
    generate: gen as unknown as AIProvider["generate"],
  };
}

const SAMPLE_SOURCE =
  "({ frame: (t) => ({ shapes: [{ type: 'circle', x: 0.5, y: 0.5, r: 0.1, color: '#f00' }] }) })";

function toolCallChunks(input: object): GenerateChunk[] {
  return [
    { type: "message-start", model: "fake-model" },
    {
      type: "tool-use-start",
      toolCallId: "call_1",
      name: DEFINE_GENERATED_OBJECT_TOOL.name,
    },
    {
      type: "tool-use-input-delta",
      toolCallId: "call_1",
      partialJson: JSON.stringify(input),
    },
    { type: "tool-use-end", toolCallId: "call_1" },
    { type: "done", finishReason: "tool_use" },
  ];
}

describe("generateObject", () => {
  it("parses tool call into name + source + params", async () => {
    const provider = makeFakeProvider(
      toolCallChunks({
        name: "Bouncing red ball",
        source: SAMPLE_SOURCE,
        paramsSchema: { type: "object", properties: { speed: { type: "number" } } },
        defaultParams: { speed: 2 },
      }),
    );
    const result = await generateObject({
      provider,
      model: "fake-model",
      prompt: "make a ball",
    });
    expect(result.name).toBe("Bouncing red ball");
    expect(result.source).toBe(SAMPLE_SOURCE);
    expect(result.paramsSchema).toEqual({
      type: "object",
      properties: { speed: { type: "number" } },
    });
    expect(result.defaultParams).toEqual({ speed: 2 });
  });

  it("provides defaults for missing optional fields", async () => {
    const provider = makeFakeProvider(
      toolCallChunks({ source: SAMPLE_SOURCE }),
    );
    const result = await generateObject({
      provider,
      model: "fake-model",
      prompt: "minimal",
    });
    expect(result.name).toBe("Untitled object");
    expect(result.paramsSchema).toEqual({});
    expect(result.defaultParams).toEqual({});
  });

  it("forwards system prompt, tool, and forceTool to the provider", async () => {
    const spy = vi.fn();
    const provider = makeFakeProvider(
      toolCallChunks({ source: SAMPLE_SOURCE }),
      spy,
    );
    await generateObject({
      provider,
      model: "fake-model",
      prompt: "make something",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const [request] = spy.mock.calls[0];
    expect(request.model).toBe("fake-model");
    expect(request.system).toBeDefined();
    expect(request.system.length).toBeGreaterThan(100);
    expect(request.tools).toHaveLength(1);
    expect(request.tools[0].name).toBe(DEFINE_GENERATED_OBJECT_TOOL.name);
    expect(request.forceTool).toBe(DEFINE_GENERATED_OBJECT_TOOL.name);
    expect(request.messages[0]).toEqual({
      role: "user",
      content: "make something",
    });
  });

  it("throws GenerateObjectError when no tool call arrives", async () => {
    const provider = makeFakeProvider([
      { type: "text-delta", text: "I won't call the tool" },
      { type: "done", finishReason: "stop" },
    ]);
    await expect(
      generateObject({
        provider,
        model: "fake-model",
        prompt: "x",
      }),
    ).rejects.toBeInstanceOf(GenerateObjectError);
  });

  it("throws GenerateObjectError when tool input has no source field", async () => {
    const provider = makeFakeProvider(
      toolCallChunks({ name: "Nameless", paramsSchema: {} }),
    );
    await expect(
      generateObject({
        provider,
        model: "fake-model",
        prompt: "x",
      }),
    ).rejects.toThrow(/missing required 'source'/);
  });

  it("throws GenerateObjectError when tool input JSON is malformed", async () => {
    const provider = makeFakeProvider([
      { type: "message-start", model: "fake-model" },
      {
        type: "tool-use-start",
        toolCallId: "call_1",
        name: DEFINE_GENERATED_OBJECT_TOOL.name,
      },
      {
        type: "tool-use-input-delta",
        toolCallId: "call_1",
        partialJson: "{not valid json",
      },
      { type: "tool-use-end", toolCallId: "call_1" },
      { type: "done", finishReason: "tool_use" },
    ]);
    await expect(
      generateObject({
        provider,
        model: "fake-model",
        prompt: "x",
      }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it("invokes onTextDelta callback for each text-delta chunk", async () => {
    const provider = makeFakeProvider([
      { type: "message-start", model: "fake-model" },
      { type: "text-delta", text: "thinking " },
      { type: "text-delta", text: "about it..." },
      {
        type: "tool-use-start",
        toolCallId: "call_1",
        name: DEFINE_GENERATED_OBJECT_TOOL.name,
      },
      {
        type: "tool-use-input-delta",
        toolCallId: "call_1",
        partialJson: JSON.stringify({ source: SAMPLE_SOURCE }),
      },
      { type: "tool-use-end", toolCallId: "call_1" },
      { type: "done", finishReason: "tool_use" },
    ]);
    const onText = vi.fn();
    await generateObject({
      provider,
      model: "fake-model",
      prompt: "x",
      onTextDelta: onText,
    });
    expect(onText).toHaveBeenCalledTimes(2);
    expect(onText).toHaveBeenNthCalledWith(1, "thinking ");
    expect(onText).toHaveBeenNthCalledWith(2, "about it...");
  });
});
