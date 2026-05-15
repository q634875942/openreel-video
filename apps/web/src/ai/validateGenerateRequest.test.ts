import { describe, it, expect } from "vitest";
import { validateGenerateRequest } from "./validateGenerateRequest";
import type { GenerateRequest, ToolDefinition } from "./types";

const minimalValid: GenerateRequest = {
  model: "test-model",
  messages: [{ role: "user", content: "hi" }],
};

const tool: ToolDefinition = {
  name: "create_clip",
  description: "create a GeneratedClip",
  inputSchema: { type: "object", properties: {} },
};

describe("validateGenerateRequest", () => {
  it("accepts a minimal valid request", () => {
    expect(validateGenerateRequest(minimalValid)).toEqual([]);
  });

  it("rejects missing or empty model", () => {
    const errs = validateGenerateRequest({ ...minimalValid, model: "" });
    expect(errs).toContain("model must be a non-empty string");
  });

  it("rejects empty messages array", () => {
    const errs = validateGenerateRequest({ ...minimalValid, messages: [] });
    expect(errs.some((e) => e.includes("at least one message"))).toBe(true);
  });

  it("rejects an unknown role", () => {
    const errs = validateGenerateRequest({
      ...minimalValid,
      messages: [{ role: "bogus" as never, content: "hi" }],
    });
    expect(errs.some((e) => e.includes("role must be one of"))).toBe(true);
  });

  it("accepts string and array content shapes", () => {
    const stringContent = validateGenerateRequest({
      ...minimalValid,
      messages: [{ role: "user", content: "hi" }],
    });
    const arrayContent = validateGenerateRequest({
      ...minimalValid,
      messages: [
        { role: "user", content: [{ type: "text", text: "hi" }] },
      ],
    });
    expect(stringContent).toEqual([]);
    expect(arrayContent).toEqual([]);
  });

  it("rejects empty content array", () => {
    const errs = validateGenerateRequest({
      ...minimalValid,
      messages: [{ role: "user", content: [] }],
    });
    expect(errs.some((e) => e.includes("must not be empty"))).toBe(true);
  });

  it("validates each content part shape", () => {
    const errs = validateGenerateRequest({
      ...minimalValid,
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              toolCallId: "",
              name: "",
              input: null as unknown as Record<string, unknown>,
            },
          ],
        },
      ],
    });
    expect(errs).toContain("messages[0].content[0].toolCallId must be a non-empty string");
    expect(errs).toContain("messages[0].content[0].name must be a non-empty string");
    expect(errs).toContain("messages[0].content[0].input must be an object");
  });

  it("rejects duplicate tool names", () => {
    const errs = validateGenerateRequest({
      ...minimalValid,
      tools: [tool, tool],
    });
    expect(errs.some((e) => e.includes("duplicates an earlier tool"))).toBe(true);
  });

  it("rejects tools whose inputSchema is not an object", () => {
    const errs = validateGenerateRequest({
      ...minimalValid,
      tools: [
        {
          ...tool,
          inputSchema: null as unknown as Record<string, unknown>,
        },
      ],
    });
    expect(errs.some((e) => e.includes("inputSchema must be a JSON Schema object"))).toBe(true);
  });

  it("rejects forceTool not present in tools[]", () => {
    const errs = validateGenerateRequest({
      ...minimalValid,
      tools: [tool],
      forceTool: "missing",
    });
    expect(errs.some((e) => e.includes("not present in tools"))).toBe(true);
  });

  it("rejects forceTool when tools[] is empty", () => {
    const errs = validateGenerateRequest({
      ...minimalValid,
      forceTool: "anything",
    });
    expect(errs.some((e) => e.includes("requires tools[] to be non-empty"))).toBe(true);
  });

  it("accepts forceTool referring to a defined tool", () => {
    expect(
      validateGenerateRequest({
        ...minimalValid,
        tools: [tool],
        forceTool: tool.name,
      }),
    ).toEqual([]);
  });

  it("rejects temperature outside [0, 2]", () => {
    expect(
      validateGenerateRequest({ ...minimalValid, temperature: -0.1 }).length,
    ).toBeGreaterThan(0);
    expect(
      validateGenerateRequest({ ...minimalValid, temperature: 2.1 }).length,
    ).toBeGreaterThan(0);
    expect(
      validateGenerateRequest({ ...minimalValid, temperature: NaN }).length,
    ).toBeGreaterThan(0);
  });

  it("accepts temperature 0, 1, 2", () => {
    expect(validateGenerateRequest({ ...minimalValid, temperature: 0 })).toEqual([]);
    expect(validateGenerateRequest({ ...minimalValid, temperature: 1 })).toEqual([]);
    expect(validateGenerateRequest({ ...minimalValid, temperature: 2 })).toEqual([]);
  });

  it("rejects non-positive or non-integer maxTokens", () => {
    expect(
      validateGenerateRequest({ ...minimalValid, maxTokens: 0 }).length,
    ).toBeGreaterThan(0);
    expect(
      validateGenerateRequest({ ...minimalValid, maxTokens: -10 }).length,
    ).toBeGreaterThan(0);
    expect(
      validateGenerateRequest({ ...minimalValid, maxTokens: 1.5 }).length,
    ).toBeGreaterThan(0);
  });

  it("returns multiple errors at once, not just the first", () => {
    const errs = validateGenerateRequest({
      model: "",
      messages: [],
      temperature: 99,
    });
    expect(errs.length).toBeGreaterThanOrEqual(3);
  });
});
