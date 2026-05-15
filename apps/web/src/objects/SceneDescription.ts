// SceneDescription — the wire-protocol between AI-generated source (running
// inside a sandbox Worker) and the main-thread renderer.
//
// The sandbox returns a SceneDescription per frame. The renderer translates
// that into actual draw calls (Canvas 2D in the fast path, Three.js in the
// 3D path). Keep this protocol declarative — it's transport over postMessage,
// so everything must be structured-cloneable (no functions, no class
// instances, no DOM nodes).
//
// Coordinates are in normalized canvas units (0..1 along each axis), to
// match the Transform convention used by other openreel Clip types.

export interface BaseShape {
  /** Optional opacity 0..1. Defaults to 1 when missing. */
  readonly opacity?: number;
}

export interface RectShape extends BaseShape {
  readonly type: "rect";
  readonly x: number;       // normalized 0..1 (center)
  readonly y: number;
  readonly w: number;       // normalized 0..1
  readonly h: number;
  readonly color: string;   // CSS color
  readonly rotation?: number; // degrees, defaults to 0
}

export interface CircleShape extends BaseShape {
  readonly type: "circle";
  readonly x: number;       // normalized center
  readonly y: number;
  readonly r: number;       // normalized radius (relative to min(w,h))
  readonly color: string;
}

export interface LineShape extends BaseShape {
  readonly type: "line";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly color: string;
  readonly width?: number;  // pixels, defaults to 2
}

export interface TextShape extends BaseShape {
  readonly type: "text";
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly color: string;
  readonly fontSize?: number;  // pixels, defaults to 32
  readonly fontFamily?: string; // CSS family, defaults to "sans-serif"
}

export type Shape = RectShape | CircleShape | LineShape | TextShape;

export interface SceneDescription {
  readonly shapes: readonly Shape[];
}

export const EMPTY_SCENE: SceneDescription = { shapes: [] };
