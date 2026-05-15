// Pure sandbox logic — no Worker plumbing here. Re-used by both
// sandbox-worker.ts (production Worker shell) and Sandbox.test.ts /
// sandbox-engine.test.ts (unit tests in main thread).
//
// The AI generates source code that is an expression evaluating to a
// `FrameCallable` object. Example:
//
//   ({
//     frame(t, params) {
//       return {
//         shapes: [
//           { type: 'rect', x: 0.5, y: 0.5, w: 0.1, h: 0.1, color: '#f00' },
//         ],
//       };
//     },
//   })
//
// We do *not* allow `import` statements or top-level `function` declarations
// inside the source. AI source must be a single expression.

import type { SceneDescription } from "./SceneDescription";

export interface FrameCallable {
  frame(t: number, params: Record<string, unknown>): SceneDescription;
}

export type CompileResult =
  | { readonly ok: true; readonly callable: FrameCallable }
  | { readonly ok: false; readonly error: string };

export type FrameResult =
  | { readonly ok: true; readonly scene: SceneDescription }
  | { readonly ok: false; readonly error: string };

// Compile AI-generated source into a FrameCallable. Returns a discriminated
// union so callers can surface errors instead of throwing through the
// postMessage boundary.
export function compileSource(source: string): CompileResult {
  if (typeof source !== "string" || source.trim().length === 0) {
    return { ok: false, error: "source is empty" };
  }

  let raw: unknown;
  try {
    // Wrap in `return (...)` so the AI source is parsed as an expression,
    // not a statement. This forces the AI to produce a self-contained value
    // (object literal, arrow expression, etc.) and rejects `import` /
    // top-level `function` declarations early.
    raw = new Function(`"use strict"; return (${source});`)();
  } catch (err) {
    return { ok: false, error: `compile failed: ${describeError(err)}` };
  }

  if (raw === null || typeof raw !== "object") {
    return {
      ok: false,
      error: "source must evaluate to an object with a frame() method",
    };
  }

  const candidate = raw as { frame?: unknown };
  if (typeof candidate.frame !== "function") {
    return { ok: false, error: "source object missing frame() method" };
  }

  return { ok: true, callable: candidate as FrameCallable };
}

// Run one frame of the compiled callable. Caller is responsible for
// time-budget enforcement (timeouts live in the Worker host).
export function runFrame(
  callable: FrameCallable,
  t: number,
  params: Record<string, unknown>,
): FrameResult {
  let scene: unknown;
  try {
    scene = callable.frame(t, params);
  } catch (err) {
    return { ok: false, error: `frame() threw: ${describeError(err)}` };
  }

  if (!isSceneDescription(scene)) {
    return {
      ok: false,
      error: "frame() must return { shapes: Shape[] }",
    };
  }

  return { ok: true, scene };
}

function isSceneDescription(value: unknown): value is SceneDescription {
  if (value === null || typeof value !== "object") return false;
  const obj = value as { shapes?: unknown };
  return Array.isArray(obj.shapes);
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message || err.name || "unknown error";
  }
  return String(err);
}
