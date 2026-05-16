// High-level helper: take a natural-language prompt, an AI provider, and
// a model id — return the parsed GeneratedObject fields (name, source,
// paramsSchema, defaultParams) ready to feed into a Sandbox.
//
// Wraps the AIProvider stream + streamToFinal + the tool-call result
// shape we defined in objectPrompt.ts.

import type { AIProvider } from "./AIProvider";
import {
  DEFINE_GENERATED_OBJECT_TOOL,
  OBJECT_GENERATION_SYSTEM_PROMPT,
} from "./objectPrompt";
import { streamToFinal } from "./streamToFinal";
import type { FinalResult } from "./types";

export interface GeneratedObjectFields {
  readonly name: string;
  readonly source: string;
  readonly paramsSchema: Record<string, unknown>;
  readonly defaultParams: Record<string, unknown>;
  // Echo of the underlying FinalResult for callers that want token usage,
  // model id, or the AI's pre-tool-call reasoning text.
  readonly finalResult: FinalResult;
}

export interface GenerateObjectOptions {
  readonly provider: AIProvider;
  readonly model: string;
  // User-facing description, e.g. "a red circle that bounces vertically"
  readonly prompt: string;
  // Defaults to OBJECT_GENERATION_SYSTEM_PROMPT but can be overridden by
  // callers that want to test alternative prompt phrasings.
  readonly systemPrompt?: string;
  // Defaults to 4000 to leave room for DeepSeek-V4-style reasoning prefixes.
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
  // Called as text-delta chunks arrive — useful for showing "AI is
  // thinking..." progress in the UI.
  readonly onTextDelta?: (text: string) => void;
}

export class GenerateObjectError extends Error {
  readonly finalResult: FinalResult | null;
  constructor(message: string, finalResult: FinalResult | null) {
    super(message);
    this.name = "GenerateObjectError";
    this.finalResult = finalResult;
  }
}

export async function generateObject(
  options: GenerateObjectOptions,
): Promise<GeneratedObjectFields> {
  const { provider, model, prompt, signal } = options;
  const systemPrompt = options.systemPrompt ?? OBJECT_GENERATION_SYSTEM_PROMPT;
  const maxTokens = options.maxTokens ?? 4000;

  const stream = provider.generate(
    {
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
      tools: [DEFINE_GENERATED_OBJECT_TOOL],
      forceTool: DEFINE_GENERATED_OBJECT_TOOL.name,
      maxTokens,
    },
    { signal },
  );

  // Tap text deltas if caller asked for them.
  const tappedStream = options.onTextDelta
    ? tap(stream, options.onTextDelta)
    : stream;

  const final = await streamToFinal(tappedStream);

  const toolCall = final.toolCalls.find(
    (tc) => tc.name === DEFINE_GENERATED_OBJECT_TOOL.name,
  );
  if (!toolCall) {
    throw new GenerateObjectError(
      `AI did not call ${DEFINE_GENERATED_OBJECT_TOOL.name} tool (finishReason=${final.finishReason})`,
      final,
    );
  }
  if (toolCall.inputParseError) {
    throw new GenerateObjectError(
      `tool input was not valid JSON: ${toolCall.inputParseError}`,
      final,
    );
  }

  const input = toolCall.input;
  if (input === null || typeof input !== "object") {
    throw new GenerateObjectError(
      "tool input must be an object",
      final,
    );
  }
  const obj = input as {
    name?: unknown;
    source?: unknown;
    paramsSchema?: unknown;
    defaultParams?: unknown;
  };

  if (typeof obj.source !== "string" || obj.source.length === 0) {
    throw new GenerateObjectError(
      "tool input missing required 'source' string",
      final,
    );
  }

  return {
    name: typeof obj.name === "string" && obj.name.length > 0 ? obj.name : "Untitled object",
    source: obj.source,
    paramsSchema:
      obj.paramsSchema !== null && typeof obj.paramsSchema === "object"
        ? (obj.paramsSchema as Record<string, unknown>)
        : {},
    defaultParams:
      obj.defaultParams !== null && typeof obj.defaultParams === "object"
        ? (obj.defaultParams as Record<string, unknown>)
        : {},
    finalResult: final,
  };
}

// Pure helper: yields every chunk through, side-effecting text deltas
// through a caller-supplied callback.
async function* tap<T extends { type: string; text?: string }>(
  source: AsyncIterable<T>,
  onText: (text: string) => void,
): AsyncIterable<T> {
  for await (const chunk of source) {
    if (chunk.type === "text-delta" && typeof chunk.text === "string") {
      onText(chunk.text);
    }
    yield chunk;
  }
}
