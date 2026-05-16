import { describe, it, expect } from "vitest";
import { renderScene } from "./renderScene";
import type { SceneDescription } from "../../objects/SceneDescription";

// Build a minimal CanvasRenderingContext2D-like spy. Records calls to all
// methods used by renderScene so we can assert what would have been drawn.
function makeSpyCtx() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const set: Record<string, unknown> = {};
  const record = (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const ctx = {
    save: record("save"),
    restore: record("restore"),
    clearRect: record("clearRect"),
    fillRect: record("fillRect"),
    beginPath: record("beginPath"),
    arc: record("arc"),
    fill: record("fill"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    stroke: record("stroke"),
    fillText: record("fillText"),
    translate: record("translate"),
    rotate: record("rotate"),
    set fillStyle(v: unknown) {
      set.fillStyle = v;
      calls.push({ method: "set:fillStyle", args: [v] });
    },
    set strokeStyle(v: unknown) {
      set.strokeStyle = v;
      calls.push({ method: "set:strokeStyle", args: [v] });
    },
    set lineWidth(v: unknown) {
      set.lineWidth = v;
      calls.push({ method: "set:lineWidth", args: [v] });
    },
    set lineCap(v: unknown) {
      set.lineCap = v;
    },
    set globalAlpha(v: unknown) {
      set.globalAlpha = v;
      calls.push({ method: "set:globalAlpha", args: [v] });
    },
    set font(v: unknown) {
      set.font = v;
    },
    set textBaseline(v: unknown) {
      set.textBaseline = v;
    },
    set textAlign(v: unknown) {
      set.textAlign = v;
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, set };
}

describe("renderScene", () => {
  it("clears canvas first", () => {
    const { ctx, calls } = makeSpyCtx();
    renderScene(ctx, { shapes: [] }, 100, 50);
    expect(calls[0]).toEqual({
      method: "clearRect",
      args: [0, 0, 100, 50],
    });
  });

  it("draws a rectangle at normalized coords scaled to canvas size", () => {
    const { ctx, calls, set } = makeSpyCtx();
    const scene: SceneDescription = {
      shapes: [
        {
          type: "rect",
          x: 0.1,
          y: 0.2,
          w: 0.5,
          h: 0.25,
          color: "#abc",
        },
      ],
    };
    renderScene(ctx, scene, 200, 100);
    expect(set.fillStyle).toBe("#abc");
    const fillRect = calls.find((c) => c.method === "fillRect");
    expect(fillRect?.args).toEqual([20, 20, 100, 25]);
  });

  it("draws a circle using min(w,h) for the radius scale", () => {
    const { ctx, calls } = makeSpyCtx();
    const scene: SceneDescription = {
      shapes: [
        { type: "circle", x: 0.5, y: 0.5, r: 0.1, color: "#0f0" },
      ],
    };
    renderScene(ctx, scene, 200, 100);
    // baseSize = min(200, 100) = 100, r = 0.1 * 100 = 10
    const arc = calls.find((c) => c.method === "arc");
    expect(arc?.args).toEqual([100, 50, 10, 0, Math.PI * 2]);
  });

  it("draws a line between two normalized endpoints", () => {
    const { ctx, calls, set } = makeSpyCtx();
    const scene: SceneDescription = {
      shapes: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          color: "#fff",
          width: 4,
        },
      ],
    };
    renderScene(ctx, scene, 200, 100);
    const moveTo = calls.find((c) => c.method === "moveTo");
    const lineTo = calls.find((c) => c.method === "lineTo");
    expect(moveTo?.args).toEqual([0, 0]);
    expect(lineTo?.args).toEqual([200, 100]);
    expect(set.lineWidth).toBe(4);
    expect(set.strokeStyle).toBe("#fff");
  });

  it("draws text at normalized position", () => {
    const { ctx, calls } = makeSpyCtx();
    const scene: SceneDescription = {
      shapes: [
        {
          type: "text",
          x: 0.5,
          y: 0.5,
          text: "hi",
          color: "#ddd",
          fontSize: 24,
        },
      ],
    };
    renderScene(ctx, scene, 400, 200);
    const fillText = calls.find((c) => c.method === "fillText");
    expect(fillText?.args).toEqual(["hi", 200, 100]);
  });

  it("respects opacity via globalAlpha", () => {
    const { ctx, set } = makeSpyCtx();
    renderScene(
      ctx,
      {
        shapes: [
          {
            type: "rect",
            x: 0,
            y: 0,
            w: 0.1,
            h: 0.1,
            color: "#000",
            opacity: 0.5,
          },
        ],
      },
      100,
      100,
    );
    expect(set.globalAlpha).toBe(0.5);
  });

  it("clamps NaN / out-of-range opacity to safe values", () => {
    const ctx1 = makeSpyCtx();
    renderScene(
      ctx1.ctx,
      {
        shapes: [
          {
            type: "rect",
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            color: "#000",
            opacity: 2,
          },
        ],
      },
      10,
      10,
    );
    expect(ctx1.set.globalAlpha).toBe(1);
    const ctx2 = makeSpyCtx();
    renderScene(
      ctx2.ctx,
      {
        shapes: [
          {
            type: "rect",
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            color: "#000",
            opacity: -0.5,
          },
        ],
      },
      10,
      10,
    );
    expect(ctx2.set.globalAlpha).toBe(0);
  });

  it("draws all shapes in order", () => {
    const { ctx, calls } = makeSpyCtx();
    renderScene(
      ctx,
      {
        shapes: [
          { type: "rect", x: 0, y: 0, w: 0.1, h: 0.1, color: "a" },
          { type: "circle", x: 0.5, y: 0.5, r: 0.1, color: "b" },
          { type: "rect", x: 0.9, y: 0.9, w: 0.1, h: 0.1, color: "c" },
        ],
      },
      100,
      100,
    );
    const fillStyles = calls
      .filter((c) => c.method === "set:fillStyle")
      .map((c) => c.args[0]);
    expect(fillStyles).toEqual(["a", "b", "c"]);
  });
});
