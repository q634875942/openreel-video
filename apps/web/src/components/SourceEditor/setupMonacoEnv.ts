// Monaco editor worker registration (feat-008).
//
// Monaco's language services run in dedicated workers. With Vite + ESM,
// the canonical pattern is to import the worker entry files via the
// `?worker` query, which Vite recognises as a worker import and bundles
// at build time. We then assign self.MonacoEnvironment.getWorker so the
// editor instance picks them up before it asks for a worker.
//
// This module has side effects (it mutates self.MonacoEnvironment). It
// is imported from inside the lazy SourceEditorDialog chunk so the
// workers don't bloat the main bundle for users who never open the
// editor.
//
// We only register the editor + typescript workers; json/css/html
// workers are skipped since AI-generated source is always TypeScript.

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

interface MonacoEnvironmentLike {
  getWorker: (workerId: string, label: string) => Worker;
}

declare global {
  // eslint-disable-next-line no-var
  var MonacoEnvironment: MonacoEnvironmentLike | undefined;
}

self.MonacoEnvironment = {
  getWorker: (_workerId: string, label: string) => {
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  },
};
