// Main-thread wrapper around the sandbox Worker. Owns a single Worker
// instance, multiplexes frame requests over postMessage, and enforces a
// per-call timeout so an infinite-loop in AI source can't hang the UI.
//
// Tests inject a custom Worker factory; production uses the default which
// instantiates the Vite-bundled sandbox-worker.ts.

import { EMPTY_SCENE, type SceneDescription } from "./SceneDescription";
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "./sandbox-protocol";

export type WorkerLike = Pick<
  Worker,
  "postMessage" | "addEventListener" | "removeEventListener" | "terminate"
>;

export type WorkerFactory = () => WorkerLike;

const DEFAULT_FRAME_TIMEOUT_MS = 100;
const DEFAULT_INIT_TIMEOUT_MS = 1000;

export interface SandboxOptions {
  readonly workerFactory?: WorkerFactory;
  readonly frameTimeoutMs?: number;
  readonly initTimeoutMs?: number;
}

interface PendingFrame {
  readonly resolve: (scene: SceneDescription) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class Sandbox {
  private readonly worker: WorkerLike;
  private readonly frameTimeoutMs: number;
  private readonly initTimeoutMs: number;
  private readonly pendingFrames = new Map<number, PendingFrame>();
  private pendingInit:
    | { readonly resolve: () => void; readonly reject: (error: Error) => void; readonly timer: ReturnType<typeof setTimeout> }
    | null = null;
  private nextRequestId = 0;
  private disposed = false;
  private latestScene: SceneDescription = EMPTY_SCENE;

  constructor(options: SandboxOptions = {}) {
    this.worker = options.workerFactory
      ? options.workerFactory()
      : defaultWorkerFactory();
    this.frameTimeoutMs = options.frameTimeoutMs ?? DEFAULT_FRAME_TIMEOUT_MS;
    this.initTimeoutMs = options.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS;
    this.worker.addEventListener(
      "message",
      this.handleMessage as EventListener,
    );
  }

  init(source: string): Promise<void> {
    this.ensureLive();
    if (this.pendingInit) {
      return Promise.reject(new Error("init already in progress"));
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingInit = null;
        reject(new Error(`sandbox init timed out after ${this.initTimeoutMs}ms`));
      }, this.initTimeoutMs);

      this.pendingInit = { resolve, reject, timer };
      this.post({ type: "init", source });
    });
  }

  renderFrame(
    t: number,
    params: Record<string, unknown>,
  ): Promise<SceneDescription> {
    this.ensureLive();
    const requestId = this.nextRequestId++;
    return new Promise<SceneDescription>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFrames.delete(requestId);
        reject(
          new Error(
            `frame ${requestId} timed out after ${this.frameTimeoutMs}ms`,
          ),
        );
      }, this.frameTimeoutMs);

      this.pendingFrames.set(requestId, { resolve, reject, timer });
      this.post({ type: "frame", requestId, t, params });
    });
  }

  // Synchronous getter for the most recently produced scene. Renderers in the
  // hot path can read this without awaiting — they call renderFrame() in the
  // background and pick up newer scenes on subsequent draws.
  getLatestScene(): SceneDescription {
    return this.latestScene;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.removeEventListener(
      "message",
      this.handleMessage as EventListener,
    );
    for (const pending of this.pendingFrames.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("sandbox disposed"));
    }
    this.pendingFrames.clear();
    if (this.pendingInit) {
      clearTimeout(this.pendingInit.timer);
      this.pendingInit.reject(new Error("sandbox disposed"));
      this.pendingInit = null;
    }
    this.worker.terminate();
  }

  private readonly handleMessage = (
    event: MessageEvent<WorkerOutboundMessage>,
  ): void => {
    const msg = event.data;
    switch (msg.type) {
      case "init-ok":
        this.resolveInit();
        return;
      case "init-error":
        this.rejectInit(new Error(msg.error));
        return;
      case "frame-result": {
        const pending = this.pendingFrames.get(msg.requestId);
        if (!pending) return; // already timed out
        clearTimeout(pending.timer);
        this.pendingFrames.delete(msg.requestId);
        this.latestScene = msg.scene;
        pending.resolve(msg.scene);
        return;
      }
      case "frame-error": {
        const pending = this.pendingFrames.get(msg.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pendingFrames.delete(msg.requestId);
        pending.reject(new Error(msg.error));
        return;
      }
    }
  };

  private resolveInit(): void {
    if (!this.pendingInit) return;
    clearTimeout(this.pendingInit.timer);
    const { resolve } = this.pendingInit;
    this.pendingInit = null;
    resolve();
  }

  private rejectInit(error: Error): void {
    if (!this.pendingInit) return;
    clearTimeout(this.pendingInit.timer);
    const { reject } = this.pendingInit;
    this.pendingInit = null;
    reject(error);
  }

  private post(msg: WorkerInboundMessage): void {
    this.worker.postMessage(msg);
  }

  private ensureLive(): void {
    if (this.disposed) {
      throw new Error("sandbox has been disposed");
    }
  }
}

function defaultWorkerFactory(): WorkerLike {
  return new Worker(new URL("./sandbox-worker.ts", import.meta.url), {
    type: "module",
  });
}
