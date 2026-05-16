// Renders a SceneDescription into a Canvas 2D context. Standalone — does
// not depend on openreel's clip / timeline systems. Both the AI panel
// (in-panel preview) and the production canvas-renderers dispatch path
// (feat-007) call this.

import type { SceneDescription, Shape } from "./SceneDescription";

export function renderScene(
  ctx: CanvasRenderingContext2D,
  scene: SceneDescription,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  for (const shape of scene.shapes) {
    drawShape(ctx, shape, canvasWidth, canvasHeight);
  }
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.globalAlpha = clamp01(shape.opacity ?? 1);

  switch (shape.type) {
    case "rect": {
      const px = shape.x * w;
      const py = shape.y * h;
      const pw = shape.w * w;
      const ph = shape.h * h;
      if (shape.rotation) {
        ctx.translate(px + pw / 2, py + ph / 2);
        ctx.rotate((shape.rotation * Math.PI) / 180);
        ctx.fillStyle = shape.color;
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      } else {
        ctx.fillStyle = shape.color;
        ctx.fillRect(px, py, pw, ph);
      }
      break;
    }
    case "circle": {
      const cx = shape.x * w;
      const cy = shape.y * h;
      const baseSize = Math.min(w, h);
      const r = shape.r * baseSize;
      ctx.fillStyle = shape.color;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "line": {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.width ?? 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(shape.x1 * w, shape.y1 * h);
      ctx.lineTo(shape.x2 * w, shape.y2 * h);
      ctx.stroke();
      break;
    }
    case "text": {
      const fontSize = shape.fontSize ?? 32;
      const fontFamily = shape.fontFamily ?? "sans-serif";
      ctx.fillStyle = shape.color;
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(shape.text, shape.x * w, shape.y * h);
      break;
    }
  }

  ctx.restore();
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 1;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
