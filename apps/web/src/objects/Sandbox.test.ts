import { describe, it, expect } from "vitest";
import { Sandbox, type WorkerLike } from "./Sandbox";
import { compileSource, runFrame, type FrameCallable } from "./sandbox-engine";
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "./sandbox-protocol";

// FakeWorker simulates the production sandbox-worker.ts in-process. It
// dispatches messages through the same sandbox-engine.ts so the Sandbox
// wrapper is exercised against the real engine logic, just without an
// actual postMessage round trip. This catches integration issues between
// Sandbox and the engine without requiring a real Worker in jsdom.
class FakeWorker implements WorkerLike {
  private listeners: Array<(event: MessageEvent<WorkerOutboundMessage>) => void> = [];
  private callable: FrameCallable | null = null;
  // When true, hold incoming frame messages instead of replying. Tests use
  // this to exercise Sandbox's timeout path.
  public stall = false;

  postMessage(msg: WorkerInboundMessage): void {
    if (msg.type === "init") {
      const result = compileSource(msg.source);
      if (result.ok) {
        this.callable = result.callable;
        this.emit({ type: "init-ok" });
      } else {
        this.callable = null;
        this.emit({ type: "init-error", error: result.error });
      }
      return;
    }
    if (msg.type === "frame") {
      if (this.stall) return;
      if (this.callable === null) {
        this.emit({
          type: "frame-error",
          requestId: msg.requestId,
          error: "sandbox not initialized",
        });
        return;
      }
      const result = runFrame(this.callable, msg.t, msg.params);
      if (result.ok) {
        this.emit({
          type: "frame-result",
          requestId: msg.requestId,
          scene: result.scene,
        });
      } else {
        this.emit({
          type: "frame-error",
          requestId: msg.requestId,
          error: result.error,
        });
      }
    }
  }

  addEventListener(_type: string, listener: EventListener): void {
    this.listeners.push(
      listener as (event: MessageEvent<WorkerOutboundMessage>) => void,
    );
  }

  removeEventListener(_type: string, listener: EventListener): void {
    this.listeners = this.listeners.filter((l) => l !== (listener as unknown));
  }

  terminate(): void {
    this.listeners = [];
  }

  private emit(data: WorkerOutboundMessage): void {
    const event = { data } as MessageEvent<WorkerOutboundMessage>;
    for (const listener of this.listeners) listener(event);
  }
}

const SIMPLE_SOURCE =
  "({ frame: (t) => ({ shapes: [{ type: 'rect', x: t, y: 0.5, w: 0.1, h: 0.1, color: '#abc' }] }) })";

describe("Sandbox", () => {
  it("init resolves on init-ok", async () => {
    const sandbox = new Sandbox({ workerFactory: () => new FakeWorker() });
    await expect(sandbox.init(SIMPLE_SOURCE)).resolves.toBeUndefined();
    sandbox.dispose();
  });

  it("init rejects when source fails to compile", async () => {
    const sandbox = new Sandbox({ workerFactory: () => new FakeWorker() });
    await expect(sandbox.init("({ broken")).rejects.toThrow(/compile failed/i);
    sandbox.dispose();
  });

  it("renderFrame returns the scene produced by the engine", async () => {
    const sandbox = new Sandbox({ workerFactory: () => new FakeWorker() });
    await sandbox.init(SIMPLE_SOURCE);
    const scene = await sandbox.renderFrame(0.42, {});
    expect(scene.shapes).toHaveLength(1);
    expect(scene.shapes[0]).toMatchObject({ type: "rect", x: 0.42 });
    sandbox.dispose();
  });

  it("getLatestScene reflects the most recent successful frame", async () => {
    const sandbox = new Sandbox({ workerFactory: () => new FakeWorker() });
    await sandbox.init(SIMPLE_SOURCE);
    expect(sandbox.getLatestScene().shapes).toHaveLength(0);
    await sandbox.renderFrame(0.1, {});
    await sandbox.renderFrame(0.7, {});
    const latest = sandbox.getLatestScene();
    expect(latest.shapes).toHaveLength(1);
    expect((latest.shapes[0] as { x: number }).x).toBe(0.7);
    sandbox.dispose();
  });

  it("multiplexes concurrent frame requests by requestId", async () => {
    const sandbox = new Sandbox({ workerFactory: () => new FakeWorker() });
    await sandbox.init(SIMPLE_SOURCE);
    const [a, b, c] = await Promise.all([
      sandbox.renderFrame(0.1, {}),
      sandbox.renderFrame(0.5, {}),
      sandbox.renderFrame(0.9, {}),
    ]);
    expect((a.shapes[0] as { x: number }).x).toBe(0.1);
    expect((b.shapes[0] as { x: number }).x).toBe(0.5);
    expect((c.shapes[0] as { x: number }).x).toBe(0.9);
    sandbox.dispose();
  });

  it("renderFrame surfaces engine errors", async () => {
    const sandbox = new Sandbox({ workerFactory: () => new FakeWorker() });
    await sandbox.init("({ frame: () => { throw new Error('explode'); } })");
    await expect(sandbox.renderFrame(0, {})).rejects.toThrow(/explode/);
    sandbox.dispose();
  });

  it("renderFrame rejects with a timeout when the worker stalls", async () => {
    const stalling = new FakeWorker();
    stalling.stall = true;
    const sandbox = new Sandbox({
      workerFactory: () => stalling,
      frameTimeoutMs: 20,
    });
    // init still goes through (FakeWorker only stalls frame messages).
    await sandbox.init(SIMPLE_SOURCE);
    await expect(sandbox.renderFrame(0, {})).rejects.toThrow(/timed out/);
    sandbox.dispose();
  });

  it("dispose rejects any in-flight frame request", async () => {
    const stalling = new FakeWorker();
    stalling.stall = true;
    const sandbox = new Sandbox({
      workerFactory: () => stalling,
      frameTimeoutMs: 5000,
    });
    await sandbox.init(SIMPLE_SOURCE);
    const inFlight = sandbox.renderFrame(0, {});
    sandbox.dispose();
    await expect(inFlight).rejects.toThrow(/disposed/);
  });

  it("throws synchronously on use after dispose", () => {
    const sandbox = new Sandbox({ workerFactory: () => new FakeWorker() });
    sandbox.dispose();
    expect(() => sandbox.renderFrame(0, {})).toThrow(/disposed/);
  });
});
