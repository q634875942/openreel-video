// Barrel export for the sandbox / generated-object module.
export type {
  Shape,
  RectShape,
  CircleShape,
  LineShape,
  TextShape,
  SceneDescription,
} from "./SceneDescription";
export { EMPTY_SCENE } from "./SceneDescription";
export { Sandbox, type SandboxOptions, type WorkerFactory, type WorkerLike } from "./Sandbox";
export {
  compileSource,
  runFrame,
  type FrameCallable,
  type CompileResult,
  type FrameResult,
} from "./sandbox-engine";
