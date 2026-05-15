// Thin Worker shell. All real logic lives in `sandbox-engine.ts`, which is
// pure and unit-tested directly. This file just bridges postMessage to the
// engine.
//
// We rely on the Worker's own isolation as the security boundary: a Worker
// has no DOM, no `window`, no parent's IndexedDB by default (unless we
// explicitly grant it). The `new Function` inside compileSource() can still
// see `fetch`, `XMLHttpRequest`, etc. — for Slice 1 MVP we accept that. A
// future feature can shadow those off the worker global if needed.

/// <reference lib="webworker" />

import {
  compileSource,
  runFrame,
  type FrameCallable,
} from "./sandbox-engine";
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "./sandbox-protocol";

declare const self: DedicatedWorkerGlobalScope;

let callable: FrameCallable | null = null;

self.addEventListener("message", (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data;

  if (msg.type === "init") {
    const result = compileSource(msg.source);
    if (result.ok) {
      callable = result.callable;
      post({ type: "init-ok" });
    } else {
      callable = null;
      post({ type: "init-error", error: result.error });
    }
    return;
  }

  if (msg.type === "frame") {
    if (callable === null) {
      post({
        type: "frame-error",
        requestId: msg.requestId,
        error: "sandbox not initialized",
      });
      return;
    }
    const result = runFrame(callable, msg.t, msg.params);
    if (result.ok) {
      post({
        type: "frame-result",
        requestId: msg.requestId,
        scene: result.scene,
      });
    } else {
      post({
        type: "frame-error",
        requestId: msg.requestId,
        error: result.error,
      });
    }
    return;
  }
});

function post(msg: WorkerOutboundMessage): void {
  self.postMessage(msg);
}
