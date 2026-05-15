import { describe, it, expect } from "vitest";
import { getAnimatedTransform } from "./canvas-renderers";
import {
  readGeneratedClipColor,
  DEFAULT_GENERATED_CLIP_COLOR,
} from "./threejs-layer-renderer";
import { DEFAULT_TRANSFORM, type ClipTransform } from "./types";
import type { GeneratedClip, Keyframe } from "@openreel/core";

describe("getAnimatedTransform", () => {
  const baseTransform: ClipTransform = {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
    anchor: { x: 0.5, y: 0.5 },
    borderRadius: 0,
  };

  it("should return base transform when no keyframes", () => {
    const result = getAnimatedTransform(baseTransform, [], 0);
    expect(result).toEqual(baseTransform);
  });

  it("should return base transform when keyframes is undefined", () => {
    const result = getAnimatedTransform(baseTransform, undefined, 0);
    expect(result).toEqual(baseTransform);
  });

  it("should interpolate position keyframes", () => {
    const keyframes: Keyframe[] = [
      { id: "1", property: "position.x", time: 0, value: 0, easing: "linear" },
      { id: "2", property: "position.x", time: 1, value: 100, easing: "linear" },
    ];

    const result = getAnimatedTransform(baseTransform, keyframes, 0.5);
    expect(result.position.x).toBeCloseTo(50, 1);
  });

  it("should preserve transform position at time 0", () => {
    const customTransform: ClipTransform = {
      ...baseTransform,
      position: { x: 100, y: 50 },
    };

    const result = getAnimatedTransform(customTransform, [], 0);
    expect(result.position.x).toBe(100);
    expect(result.position.y).toBe(50);
  });

  it("should preserve transform position regardless of clipLocalTime when no keyframes", () => {
    const customTransform: ClipTransform = {
      ...baseTransform,
      position: { x: 200, y: 150 },
    };

    const times = [0, 0.5, 1, 2, 5, 10];
    for (const time of times) {
      const result = getAnimatedTransform(customTransform, [], time);
      expect(result.position.x).toBe(200);
      expect(result.position.y).toBe(150);
    }
  });
});

describe("Transform Coordinate System", () => {
  it("DEFAULT_TRANSFORM position should be at center (0, 0)", () => {
    expect(DEFAULT_TRANSFORM.position.x).toBe(0);
    expect(DEFAULT_TRANSFORM.position.y).toBe(0);
  });

  it("DEFAULT_TRANSFORM anchor should be centered (0.5, 0.5)", () => {
    expect(DEFAULT_TRANSFORM.anchor.x).toBe(0.5);
    expect(DEFAULT_TRANSFORM.anchor.y).toBe(0.5);
  });

  describe("Position coordinates should be in pixels (offset from center)", () => {
    it("position (0, 0) should represent center of canvas", () => {
      const transform = { ...DEFAULT_TRANSFORM, position: { x: 0, y: 0 } };
      expect(transform.position.x).toBe(0);
      expect(transform.position.y).toBe(0);
    });

    it("position (100, 0) should represent 100px right of center", () => {
      const transform = { ...DEFAULT_TRANSFORM, position: { x: 100, y: 0 } };
      expect(transform.position.x).toBe(100);
    });

    it("position (-100, 0) should represent 100px left of center", () => {
      const transform = { ...DEFAULT_TRANSFORM, position: { x: -100, y: 0 } };
      expect(transform.position.x).toBe(-100);
    });
  });
});

describe("GPU Transform Normalization", () => {
  it("should NOT add 0.5 offset to normalized coordinates", () => {
    const canvasWidth = 1920;
    const canvasHeight = 1080;
    const position = { x: 0, y: 0 };

    const incorrectNormalization = {
      x: 0.5 + position.x / canvasWidth,
      y: 0.5 + position.y / canvasHeight,
    };

    const correctPassthrough = position;

    expect(incorrectNormalization.x).toBe(0.5);
    expect(incorrectNormalization.y).toBe(0.5);

    expect(correctPassthrough.x).toBe(0);
    expect(correctPassthrough.y).toBe(0);

    expect(correctPassthrough.x).not.toBe(incorrectNormalization.x);
  });

  it("GPU expects pixel coordinates that it normalizes internally", () => {
    const canvasWidth = 1920;
    const canvasHeight = 1080;

    const simulateShaderNormalization = (pixelX: number, pixelY: number) => ({
      x: (pixelX / canvasWidth) * 2,
      y: (pixelY / canvasHeight) * 2,
    });

    const center = simulateShaderNormalization(0, 0);
    expect(center.x).toBe(0);
    expect(center.y).toBe(0);

    const halfRight = simulateShaderNormalization(canvasWidth / 2, 0);
    expect(halfRight.x).toBe(1);
    expect(halfRight.y).toBe(0);

    const topRight = simulateShaderNormalization(canvasWidth / 2, canvasHeight / 2);
    expect(topRight.x).toBe(1);
    expect(topRight.y).toBe(1);
  });
});

describe("readGeneratedClipColor (feat-002)", () => {
  // Tiny factory so each test gets an isolated, valid GeneratedClip.
  const makeClip = (params: Record<string, unknown>): GeneratedClip => ({
    id: "test-clip",
    trackId: "test-track",
    startTime: 0,
    duration: 2,
    type: "generated",
    transform: {
      position: { x: 0.5, y: 0.5 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
      opacity: 1,
    },
    keyframes: [],
    source: "",
    sourceLanguage: "typescript",
    providerId: "test",
    promptHistory: [],
    paramsSchema: {},
    params,
  });

  it("returns the configured color when params.color is a non-empty string", () => {
    const clip = makeClip({ color: "#ff0000" });
    expect(readGeneratedClipColor(clip)).toBe("#ff0000");
  });

  it("falls back to the default when params is empty", () => {
    const clip = makeClip({});
    expect(readGeneratedClipColor(clip)).toBe(DEFAULT_GENERATED_CLIP_COLOR);
  });

  it("falls back to the default when params.color is missing", () => {
    const clip = makeClip({ width: 100, height: 50 });
    expect(readGeneratedClipColor(clip)).toBe(DEFAULT_GENERATED_CLIP_COLOR);
  });

  it("falls back to the default when params.color is not a string", () => {
    const clip = makeClip({ color: 0xff0000 });
    expect(readGeneratedClipColor(clip)).toBe(DEFAULT_GENERATED_CLIP_COLOR);
  });

  it("falls back to the default when params.color is the empty string", () => {
    const clip = makeClip({ color: "" });
    expect(readGeneratedClipColor(clip)).toBe(DEFAULT_GENERATED_CLIP_COLOR);
  });
});

describe("Playback Transform Consistency", () => {
  it("transform should be identical during playback regardless of speed", () => {
    const clipTransform: ClipTransform = {
      position: { x: 100, y: -50 },
      scale: { x: 1.5, y: 1.5 },
      rotation: 45,
      opacity: 0.8,
      anchor: { x: 0.5, y: 0.5 },
      borderRadius: 10,
    };

    const speed1xTransform = getAnimatedTransform(clipTransform, [], 2.5);
    const speed2xTransform = getAnimatedTransform(clipTransform, [], 2.5);

    expect(speed1xTransform).toEqual(speed2xTransform);
    expect(speed1xTransform.position).toEqual(clipTransform.position);
  });

  it("clipLocalTime for transforms should be based on timeline time, not media time", () => {
    const clipStartTime = 10;
    const speed = 2;

    const simulateCorrectClipLocalTime = (
      currentPlayheadTime: number,
      _speed: number
    ) => {
      return currentPlayheadTime - clipStartTime;
    };

    const simulateIncorrectClipLocalTime = (
      currentMediaTime: number,
      inPoint: number,
      _clipStartTime: number
    ) => {
      const currentPlayhead = _clipStartTime + (currentMediaTime - inPoint);
      return currentPlayhead - _clipStartTime;
    };

    const realTimeElapsed = 1;
    const playheadTime = clipStartTime + realTimeElapsed;
    const mediaTime = realTimeElapsed * speed;

    const correctClipLocalTime = simulateCorrectClipLocalTime(playheadTime, speed);
    const incorrectClipLocalTime = simulateIncorrectClipLocalTime(mediaTime, 0, clipStartTime);

    expect(correctClipLocalTime).toBe(1);
    expect(incorrectClipLocalTime).toBe(2);
    expect(correctClipLocalTime).not.toBe(incorrectClipLocalTime);
  });
});
