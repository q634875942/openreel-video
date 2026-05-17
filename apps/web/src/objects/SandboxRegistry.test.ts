import { describe, it, expect } from "vitest";
import type { GeneratedClip } from "@openreel/core";
import {
  DEFAULT_GENERATED_PARAMS_SCHEMA,
  DEFAULT_GRAPHIC_TRANSFORM,
} from "@openreel/core";
import { Sandbox, type WorkerLike } from "./Sandbox";
import { compileSource, runFrame, type FrameCallable } from "./sandbox-engine";
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "./sandbox-protocol";
import { createSandboxRegistry } from "./SandboxRegistry";

// Same FakeWorker as Sandbox.test.ts, copied locally so the two suites
// stay decoupled.
class FakeWorker implements WorkerLike {
  private listeners: Array<(event: MessageEvent<WorkerOutboundMessage>) => void> = [];
  private callable: FrameCallable | null = null;
  public terminated = false;

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
      if (this.callable === null) return;
      const result = runFrame(this.callable, msg.t, msg.params);
      if (result.ok) {
        this.emit({
          type: "frame-result",
          requestId: msg.requestId,
          scene: result.scene,
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
    this.terminated = true;
    this.listeners = [];
  }

  private emit(data: WorkerOutboundMessage): void {
    const event = { data } as MessageEvent<WorkerOutboundMessage>;
    for (const listener of this.listeners) listener(event);
  }
}

const VALID_SOURCE =
  "({ frame: () => ({ shapes: [{ type: 'rect', x: 0, y: 0, w: 0.1, h: 0.1, color: '#abc' }] }) })";
const VALID_SOURCE_2 =
  "({ frame: () => ({ shapes: [{ type: 'rect', x: 0.5, y: 0.5, w: 0.2, h: 0.2, color: '#def' }] }) })";

function makeClip(overrides: Partial<GeneratedClip> = {}): GeneratedClip {
  return {
    id: overrides.id ?? "clip-1",
    trackId: "track-1",
    startTime: 0,
    duration: 5,
    type: "generated",
    transform: { ...DEFAULT_GRAPHIC_TRANSFORM },
    keyframes: [],
    source: VALID_SOURCE,
    sourceLanguage: "typescript",
    providerId: "deepseek",
    promptHistory: [],
    paramsSchema: DEFAULT_GENERATED_PARAMS_SCHEMA,
    params: {},
    ...overrides,
  };
}

function makeRegistryWithFakeWorkers() {
  const fakes: FakeWorker[] = [];
  const registry = createSandboxRegistry({
    sandboxFactory: () => {
      const fake = new FakeWorker();
      fakes.push(fake);
      return new Sandbox({ workerFactory: () => fake });
    },
  });
  return { registry, fakes };
}

describe("SandboxRegistry", () => {
  it("ensure creates and inits a sandbox on first call", async () => {
    const { registry, fakes } = makeRegistryWithFakeWorkers();
    const clip = makeClip();
    const entry = registry.ensure(clip);
    expect(entry.clipId).toBe("clip-1");
    expect(entry.ready).toBe(false);
    // Init resolves on the microtask queue via FakeWorker.
    await new Promise((r) => setTimeout(r, 0));
    expect(entry.ready).toBe(true);
    expect(entry.initError).toBeNull();
    expect(fakes.length).toBe(1);
    registry.disposeAll();
  });

  it("ensure reuses the same entry when source is unchanged", () => {
    const { registry, fakes } = makeRegistryWithFakeWorkers();
    const clip = makeClip();
    const a = registry.ensure(clip);
    const b = registry.ensure(clip);
    expect(b).toBe(a);
    expect(fakes.length).toBe(1);
    registry.disposeAll();
  });

  it("ensure rebuilds when clip.source changes (and disposes the old worker)", async () => {
    const { registry, fakes } = makeRegistryWithFakeWorkers();
    const a = registry.ensure(makeClip({ source: VALID_SOURCE }));
    await new Promise((r) => setTimeout(r, 0));
    const b = registry.ensure(makeClip({ source: VALID_SOURCE_2 }));
    expect(b).not.toBe(a);
    expect(b.sourceHash).not.toBe(a.sourceHash);
    expect(fakes.length).toBe(2);
    expect(fakes[0].terminated).toBe(true);
    expect(fakes[1].terminated).toBe(false);
    registry.disposeAll();
  });

  it("dispose evicts and terminates the worker", async () => {
    const { registry, fakes } = makeRegistryWithFakeWorkers();
    const clip = makeClip();
    registry.ensure(clip);
    await new Promise((r) => setTimeout(r, 0));
    expect(registry.size()).toBe(1);
    registry.dispose(clip.id);
    expect(registry.size()).toBe(0);
    expect(fakes[0].terminated).toBe(true);
    expect(registry.get(clip.id)).toBeUndefined();
  });

  it("dispose on missing id is a no-op", () => {
    const { registry } = makeRegistryWithFakeWorkers();
    expect(() => registry.dispose("nope")).not.toThrow();
  });

  it("disposeAll terminates every worker and empties the map", async () => {
    const { registry, fakes } = makeRegistryWithFakeWorkers();
    registry.ensure(makeClip({ id: "a" }));
    registry.ensure(makeClip({ id: "b", source: VALID_SOURCE_2 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(registry.size()).toBe(2);
    registry.disposeAll();
    expect(registry.size()).toBe(0);
    expect(fakes.every((f) => f.terminated)).toBe(true);
  });

  it("ensure surfaces init errors on entry.initError", async () => {
    const { registry } = makeRegistryWithFakeWorkers();
    const entry = registry.ensure(makeClip({ source: "({ broken" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(entry.ready).toBe(false);
    expect(entry.initError).toBeInstanceOf(Error);
    expect(entry.initError?.message).toMatch(/compile failed/i);
    registry.disposeAll();
  });

  it("renderFrame on the entry's sandbox updates getLatestScene", async () => {
    const { registry } = makeRegistryWithFakeWorkers();
    const entry = registry.ensure(makeClip());
    await new Promise((r) => setTimeout(r, 0));
    const scene = await entry.sandbox.renderFrame(0, {});
    expect(scene.shapes).toHaveLength(1);
    expect(entry.sandbox.getLatestScene().shapes).toHaveLength(1);
    registry.disposeAll();
  });

  describe("awaitReady (feat-008)", () => {
    it("resolves ready:true when init succeeds", async () => {
      const { registry } = makeRegistryWithFakeWorkers();
      const clip = makeClip();
      registry.ensure(clip);
      const result = await registry.awaitReady(clip.id);
      expect(result.ready).toBe(true);
      expect(result.error).toBeNull();
      registry.disposeAll();
    });

    it("resolves ready:false with the compile error when init fails", async () => {
      const { registry } = makeRegistryWithFakeWorkers();
      const clip = makeClip({ source: "({ broken" });
      registry.ensure(clip);
      const result = await registry.awaitReady(clip.id);
      expect(result.ready).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toMatch(/compile failed/i);
      registry.disposeAll();
    });

    it("returns an error when the clipId is not registered", async () => {
      const { registry } = makeRegistryWithFakeWorkers();
      const result = await registry.awaitReady("not-here");
      expect(result.ready).toBe(false);
      expect(result.error?.message).toMatch(/not in registry/i);
    });

    it("after source change, awaiting the new entry sees the new init", async () => {
      const { registry, fakes } = makeRegistryWithFakeWorkers();
      registry.ensure(makeClip({ source: VALID_SOURCE }));
      await registry.awaitReady("clip-1");
      // Source change triggers rebuild.
      registry.ensure(makeClip({ source: VALID_SOURCE_2 }));
      const result = await registry.awaitReady("clip-1");
      expect(result.ready).toBe(true);
      expect(fakes.length).toBe(2);
      expect(fakes[0].terminated).toBe(true);
      registry.disposeAll();
    });
  });
});
