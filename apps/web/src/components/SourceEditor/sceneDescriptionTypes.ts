// Type definitions injected into Monaco for AI-generated source files
// (feat-008). The string here is a hand-mirrored copy of the actual
// runtime types in apps/web/src/objects/SceneDescription.ts.
//
// ⚠ KEEP IN SYNC with that file. If you change Shape / SceneDescription
//   over there, update the string below and the verification commands
//   in feat-008's evidence so Monaco's intellisense stays accurate.
//
// We could in theory generate this at build time via tsc emit + raw
// import, but the type surface is tiny and stable, so a hardcoded
// string keeps the editor chunk fast to load.

export const SCENE_DESCRIPTION_TYPINGS = `
declare interface BaseShape {
  /** Optional opacity 0..1. Defaults to 1 when missing. */
  readonly opacity?: number;
}

declare interface RectShape extends BaseShape {
  readonly type: "rect";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: string;
  readonly rotation?: number;
}

declare interface CircleShape extends BaseShape {
  readonly type: "circle";
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly color: string;
}

declare interface LineShape extends BaseShape {
  readonly type: "line";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly color: string;
  readonly width?: number;
}

declare interface TextShape extends BaseShape {
  readonly type: "text";
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly color: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
}

declare type Shape = RectShape | CircleShape | LineShape | TextShape;

declare interface SceneDescription {
  readonly shapes: readonly Shape[];
}

/**
 * The contract AI-generated source must satisfy.
 *
 * The sandbox runs your source as a single expression that evaluates to
 * an object exposing a frame(t, params) method. Each frame the renderer
 * calls frame() and turns the returned SceneDescription into draw calls.
 *
 *   t       seconds since this clip's startTime
 *   params  the clip's current parameter values (typed by paramsSchema)
 *
 * Coordinates are normalized 0..1 across the clip's render area. The
 * scene must be JSON-serializable: no functions, class instances, or
 * DOM nodes.
 */
declare interface GeneratedObject {
  frame(t: number, params: Record<string, unknown>): SceneDescription;
}
`;

export const SCENE_DESCRIPTION_TYPINGS_PATH = "file:///scene-description.d.ts";
