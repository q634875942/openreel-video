// System prompt + tool definition the AI uses to produce a sandboxed
// GeneratedObject. The contract: the AI returns ONE source-code
// expression that evaluates to `{ frame(t, params): SceneDescription }`.
//
// Used by generateObject.ts and the AI panel UI. Provider-agnostic — the
// same prompt is sent to Claude / DeepSeek / etc.

import type { ToolDefinition } from "./types";

export const OBJECT_GENERATION_SYSTEM_PROMPT = `You generate small, self-contained JavaScript objects that render shapes per frame inside a sandboxed Web Worker. Your output is rendered through a strict procedural protocol; you cannot draw arbitrarily.

The runtime gives each object two inputs every frame:
  - t       — number, seconds elapsed since the clip started (>= 0)
  - params  — object, user-editable parameters (any JSON-serializable values)

Your code must be a SINGLE JavaScript expression evaluating to an object with a frame(t, params) method that returns a SceneDescription.

SceneDescription shape:
  {
    shapes: Array<Shape>
  }

Shape is one of (all coordinates are normalized 0..1; (0.5, 0.5) is canvas center):
  { type: "rect",   x, y, w, h, color, rotation?, opacity? }   // x,y is top-left
  { type: "circle", x, y, r, color, opacity? }                  // x,y is center
  { type: "line",   x1, y1, x2, y2, color, width?, opacity? }
  { type: "text",   x, y, text, color, fontSize?, fontFamily?, opacity? }

Rules you must follow:
  1. Output a SINGLE expression. No import statements. No top-level function/const/let.
  2. Wrap the whole object in parentheses: ({ frame(t, params) { ... } })
  3. Coordinates are normalized 0..1. Use 0.5 for center.
  4. Read params.<name> for any value the user should be able to tweak. Always provide a sensible fallback: params.color ?? "#ff0000".
  5. Pure function: do not call fetch, Math.random with side effects, or anything time-of-day. Use only the t argument for animation.
  6. Keep it under 80 lines and under 5 shapes for a Slice 1 MVP.

Example — a red circle bouncing vertically with adjustable color and speed:

({
  frame(t, params) {
    const speed = typeof params.speed === "number" ? params.speed : 2;
    const color = typeof params.color === "string" ? params.color : "#ff3b30";
    const y = 0.5 + Math.sin(t * speed) * 0.25;
    return {
      shapes: [
        { type: "circle", x: 0.5, y, r: 0.08, color },
      ],
    };
  },
})

Always emit your code through the \`define_generated_object\` tool — do not put code in a normal text reply.`;

// JSON Schema describing the AI's tool input. Both Anthropic and OpenAI
// accept this shape directly.
export const DEFINE_GENERATED_OBJECT_TOOL: ToolDefinition = {
  name: "define_generated_object",
  description:
    "Define a generated object by providing its source code expression, an optional JSON Schema describing its parameters, and the default parameter values.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["name", "source"],
    properties: {
      name: {
        type: "string",
        description:
          "Short human-readable name for the object (e.g. 'Bouncing red ball').",
      },
      source: {
        type: "string",
        description:
          "A single JavaScript expression that evaluates to { frame(t, params) }. Follows the SceneDescription contract.",
      },
      paramsSchema: {
        type: "object",
        description:
          "Optional JSON Schema describing the parameters the user can tweak. If omitted, the panel infers empty.",
      },
      defaultParams: {
        type: "object",
        description:
          "Optional default values for params. If omitted, an empty object is used.",
      },
    },
  },
};
