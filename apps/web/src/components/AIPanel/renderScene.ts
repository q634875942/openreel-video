// Renderer moved to apps/web/src/objects/renderScene.ts in feat-007 so
// the production canvas-renderers dispatch path can share it. Kept this
// re-export so AIPanel and its existing tests keep working without churn.

export { renderScene } from "../../objects/renderScene";
