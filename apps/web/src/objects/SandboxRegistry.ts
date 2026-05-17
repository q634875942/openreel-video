// Per-clip Sandbox cache for feat-007.
//
// Workers are real OS threads; leaking them is expensive. The registry
// owns the lifecycle: create on first ensure(), reuse while the clip's
// source is unchanged, recreate when source mutates, and dispose() on
// clip deletion or page unload.
//
// The renderer hot path calls ensure(clip) every frame and reads
// entry.sandbox.getLatestScene() synchronously. The async init runs in
// the background; ready=false until init resolves. initError carries any
// compile failure for UI surfacing.

import type { GeneratedClip } from "@openreel/core";
import { Sandbox, type SandboxOptions } from "./Sandbox";

export interface RegistryEntry {
  readonly clipId: string;
  readonly sandbox: Sandbox;
  readonly sourceHash: string;
  // initPromise resolves when the sandbox finished initializing or
  // rejects if compile/init errored. ready+initError mirror the
  // resolved state for synchronous reads; the promise itself lets
  // callers (e.g. SourceEditorDialog Save) await completion.
  readonly initPromise: Promise<void>;
  ready: boolean;
  initError: Error | null;
}

export type SandboxFactory = (clip: GeneratedClip) => Sandbox;

const defaultSandboxFactory: SandboxFactory = () =>
  new Sandbox({ frameTimeoutMs: 100, initTimeoutMs: 2000 });

export interface SandboxRegistryOptions {
  readonly sandboxFactory?: SandboxFactory;
}

export class SandboxRegistryImpl {
  private readonly entries = new Map<string, RegistryEntry>();
  private readonly sandboxFactory: SandboxFactory;

  constructor(options: SandboxRegistryOptions = {}) {
    this.sandboxFactory = options.sandboxFactory ?? defaultSandboxFactory;
  }

  ensure(clip: GeneratedClip): RegistryEntry {
    const hash = hashSource(clip.source);
    const existing = this.entries.get(clip.id);
    if (existing) {
      if (existing.sourceHash === hash) return existing;
      // Source has changed; tear down and recreate. This commonly happens
      // when "Ask AI to refactor" rewrites the clip's source (feat-008).
      existing.sandbox.dispose();
      this.entries.delete(clip.id);
    }

    const sandbox = this.sandboxFactory(clip);
    const initPromise = sandbox.init(clip.source);
    const entry: RegistryEntry = {
      clipId: clip.id,
      sandbox,
      sourceHash: hash,
      initPromise,
      ready: false,
      initError: null,
    };
    this.entries.set(clip.id, entry);

    initPromise.then(
      () => {
        // Guard against late init resolves after dispose.
        const current = this.entries.get(clip.id);
        if (current === entry) entry.ready = true;
      },
      (err: unknown) => {
        const current = this.entries.get(clip.id);
        if (current !== entry) return;
        entry.initError =
          err instanceof Error ? err : new Error(String(err));
      },
    );

    return entry;
  }

  // Await a clip's init promise, with a timeout. Returns the resolved
  // state so callers can branch on success vs error without try/catch.
  // Used by SourceEditorDialog (feat-008): after a Save bumps the
  // clip.source, the renderer's next ensure() rebuilds the sandbox;
  // the dialog awaits this to decide whether to close or stay open
  // with a compile-error banner.
  async awaitReady(
    clipId: string,
    timeoutMs = 3000,
  ): Promise<{ ready: boolean; error: Error | null }> {
    const entry = this.entries.get(clipId);
    if (!entry) {
      return { ready: false, error: new Error("clip not in registry") };
    }
    try {
      await Promise.race([
        entry.initPromise,
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`awaitReady timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
      return { ready: true, error: null };
    } catch (err) {
      return {
        ready: false,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  get(clipId: string): RegistryEntry | undefined {
    return this.entries.get(clipId);
  }

  dispose(clipId: string): void {
    const entry = this.entries.get(clipId);
    if (!entry) return;
    entry.sandbox.dispose();
    this.entries.delete(clipId);
  }

  disposeAll(): void {
    for (const entry of this.entries.values()) {
      entry.sandbox.dispose();
    }
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

// djb2 — cheap, good enough to detect source change. Not cryptographic.
function hashSource(source: string): string {
  let h = 5381;
  for (let i = 0; i < source.length; i++) {
    h = ((h << 5) + h + source.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

// Production singleton. Renderers and project-store actions use this.
export const SandboxRegistry = new SandboxRegistryImpl();

// Test helper: build a fresh registry with an injected sandbox factory
// so tests don't need a real Worker.
export function createSandboxRegistry(
  options: SandboxRegistryOptions,
): SandboxRegistryImpl {
  return new SandboxRegistryImpl(options);
}

// Re-export SandboxOptions for callers that want to tune the production
// singleton's defaults.
export type { SandboxOptions };
