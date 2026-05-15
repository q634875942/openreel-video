import { describe, it, expect } from "vitest";
import { compileSource, runFrame } from "./sandbox-engine";

describe("compileSource", () => {
  it("compiles a minimal frame() returning an empty scene", () => {
    const result = compileSource("({ frame: () => ({ shapes: [] }) })");
    expect(result.ok).toBe(true);
  });

  it("compiles a frame() returning a rect shape", () => {
    const result = compileSource(
      "({ frame: (t, p) => ({ shapes: [{ type: 'rect', x: 0.5, y: 0.5, w: 0.1, h: 0.1, color: '#f00' }] }) })",
    );
    expect(result.ok).toBe(true);
  });

  it("rejects empty source", () => {
    const result = compileSource("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty/i);
  });

  it("rejects whitespace-only source", () => {
    const result = compileSource("   \n   ");
    expect(result.ok).toBe(false);
  });

  it("rejects syntax errors with a readable message", () => {
    const result = compileSource("({ frame: () => ({");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/compile failed/i);
  });

  it("rejects sources that evaluate to a non-object", () => {
    const result = compileSource("42");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/object with a frame/i);
  });

  it("rejects sources that evaluate to null", () => {
    const result = compileSource("null");
    expect(result.ok).toBe(false);
  });

  it("rejects objects missing a frame() method", () => {
    const result = compileSource("({ render: () => ({}) })");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/missing frame/i);
  });
});

describe("runFrame", () => {
  const compiled = compileSource(
    "({ frame: (t, p) => ({ shapes: [{ type: 'rect', x: t, y: 0.5, w: 0.1, h: 0.1, color: p.color || '#000' }] }) })",
  );
  if (!compiled.ok) {
    throw new Error("test fixture failed to compile: " + compiled.error);
  }
  const callable = compiled.callable;

  it("invokes frame() with t and params and returns the shapes", () => {
    const result = runFrame(callable, 0.25, { color: "#abc" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scene.shapes).toHaveLength(1);
      expect(result.scene.shapes[0]).toMatchObject({
        type: "rect",
        x: 0.25,
        color: "#abc",
      });
    }
  });

  it("reflects different t values in subsequent calls", () => {
    const r1 = runFrame(callable, 0.1, {});
    const r2 = runFrame(callable, 0.9, {});
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      const s1 = r1.scene.shapes[0] as { x: number };
      const s2 = r2.scene.shapes[0] as { x: number };
      expect(s1.x).toBe(0.1);
      expect(s2.x).toBe(0.9);
    }
  });

  it("surfaces a thrown error instead of bubbling", () => {
    const throwing = compileSource(
      "({ frame: () => { throw new Error('boom'); } })",
    );
    if (!throwing.ok) throw new Error("fixture compile failed");
    const result = runFrame(throwing.callable, 0, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/boom/);
  });

  it("rejects a frame() that returns a non-scene shape", () => {
    const bad = compileSource("({ frame: () => 'oops' })");
    if (!bad.ok) throw new Error("fixture compile failed");
    const result = runFrame(bad.callable, 0, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/shapes/i);
  });

  it("rejects a frame() returning an object without a shapes array", () => {
    const bad = compileSource("({ frame: () => ({ foo: 'bar' }) })");
    if (!bad.ok) throw new Error("fixture compile failed");
    const result = runFrame(bad.callable, 0, {});
    expect(result.ok).toBe(false);
  });
});
