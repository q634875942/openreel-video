// Floating AI panel — Ctrl+Shift+G to open. Lets the dev / user type a
// natural-language prompt, pick a provider+model, and watch the AI
// generate a sandboxed renderable object in real time.
//
// Scope of this feat-006 MVP:
//   - Standalone preview canvas inside the panel.
//   - NOT integrated into openreel's timeline / project store yet — that
//     wiring is the next feat. The point of this milestone is to prove
//     prompt -> AI -> sandbox -> render works end-to-end.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AIProvider } from "../../ai/AIProvider";
import { bootstrapRegistryFromEnv } from "../../ai/providers/bootstrap";
import { generateObject, GenerateObjectError } from "../../ai/generateObject";
import type { ModelInfo } from "../../ai/types";
import { Sandbox } from "../../objects/Sandbox";
import type { SceneDescription } from "../../objects/SceneDescription";
import { EMPTY_SCENE } from "../../objects/SceneDescription";
import { renderScene } from "./renderScene";

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
}

const CANVAS_W = 480;
const CANVAS_H = 270;

export function AIPanel({ open, onClose }: Props) {
  const registry = useMemo(() => bootstrapRegistryFromEnv(), []);
  const providers = useMemo(() => registry.list(), [registry]);

  const [providerId, setProviderId] = useState<string>(
    () => registry.getCurrentId() ?? "",
  );
  const provider = useMemo<AIProvider | null>(
    () => (providerId ? registry.get(providerId) : null),
    [registry, providerId],
  );
  const models = useMemo<readonly ModelInfo[]>(
    () => provider?.listModels() ?? [],
    [provider],
  );
  const [modelId, setModelId] = useState<string>(() => models[0]?.id ?? "");
  // Reset model selection when provider changes.
  useEffect(() => {
    if (models.length === 0) {
      setModelId("");
    } else if (!models.some((m) => m.id === modelId)) {
      setModelId(models[0].id);
    }
  }, [models, modelId]);

  const [prompt, setPrompt] = useState<string>(
    "A red circle that bounces vertically across the canvas.",
  );
  const [generating, setGenerating] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedName, setGeneratedName] = useState<string | null>(null);
  const [generatedSource, setGeneratedSource] = useState<string | null>(null);

  // Sandbox + animation loop.
  const sandboxRef = useRef<Sandbox | null>(null);
  const sceneRef = useRef<SceneDescription>(EMPTY_SCENE);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const teardownSandbox = useCallback(() => {
    stopAnimation();
    if (sandboxRef.current) {
      sandboxRef.current.dispose();
      sandboxRef.current = null;
    }
    sceneRef.current = EMPTY_SCENE;
  }, [stopAnimation]);

  // Render loop. Reads sandbox.getLatestScene() (synchronous) and kicks a
  // new renderFrame request in the background. The first few frames see
  // EMPTY_SCENE before the first request resolves.
  const startAnimation = useCallback((params: Record<string, unknown>) => {
    startTimeRef.current = performance.now();
    const tick = () => {
      const t = (performance.now() - startTimeRef.current) / 1000;
      const sandbox = sandboxRef.current;
      if (sandbox) {
        sandbox.renderFrame(t, params).then(
          (scene) => {
            sceneRef.current = scene;
          },
          // Swallow errors here; they're surfaced via the latestScene
          // staying empty plus the panel-level error state.
          () => {},
        );
      }
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) renderScene(ctx, sceneRef.current, canvas.width, canvas.height);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  // Cleanup on unmount / close.
  useEffect(() => {
    if (!open) teardownSandbox();
    return () => teardownSandbox();
  }, [open, teardownSandbox]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onGenerate = useCallback(async () => {
    if (!provider || !modelId || !prompt.trim()) return;
    setGenerating(true);
    setStreamedText("");
    setErrorMessage(null);

    teardownSandbox();

    try {
      const result = await generateObject({
        provider,
        model: modelId,
        prompt: prompt.trim(),
        onTextDelta: (delta) => setStreamedText((prev) => prev + delta),
      });

      const sandbox = new Sandbox({
        frameTimeoutMs: 200,
        initTimeoutMs: 2000,
      });
      sandboxRef.current = sandbox;
      await sandbox.init(result.source);

      setGeneratedName(result.name);
      setGeneratedSource(result.source);
      startAnimation(result.defaultParams);
    } catch (err) {
      const message =
        err instanceof GenerateObjectError
          ? `AI: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      setErrorMessage(message);
      teardownSandbox();
    } finally {
      setGenerating(false);
    }
  }, [provider, modelId, prompt, startAnimation, teardownSandbox]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-[640px] max-w-[95vw] max-h-[95vh] overflow-auto rounded-lg border border-white/10 bg-neutral-900 text-white shadow-2xl flex flex-col"
        role="dialog"
        aria-label="AI Object Generator"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold">AI Object Generator (feat-006 MVP)</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="px-4 py-3 space-y-3 text-sm">
          {providers.length === 0 ? (
            <div className="rounded bg-yellow-900/40 border border-yellow-700 px-3 py-2 text-yellow-200">
              No AI provider configured. Add{" "}
              <code className="text-yellow-100">VITE_DEEPSEEK_API_KEY</code> or{" "}
              <code className="text-yellow-100">VITE_ANTHROPIC_API_KEY</code> to{" "}
              <code className="text-yellow-100">apps/web/.env.local</code> and restart{" "}
              <code className="text-yellow-100">pnpm dev</code>.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-white/60">Provider</span>
                <select
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  className="bg-neutral-800 border border-white/10 rounded px-2 py-1"
                  disabled={generating}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-white/60">Model</span>
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="bg-neutral-800 border border-white/10 rounded px-2 py-1"
                  disabled={generating || models.length === 0}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/60">Prompt</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="bg-neutral-800 border border-white/10 rounded px-2 py-1 resize-vertical font-mono text-xs"
              placeholder="Describe what you want to see..."
              disabled={generating}
            />
          </label>

          <button
            onClick={onGenerate}
            disabled={generating || !provider || !modelId || !prompt.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-white/40 text-white font-medium rounded px-3 py-2"
          >
            {generating ? "Generating..." : "Generate"}
          </button>

          {errorMessage && (
            <div className="rounded bg-red-900/40 border border-red-700 px-3 py-2 text-red-200 text-xs whitespace-pre-wrap">
              {errorMessage}
            </div>
          )}

          {generatedName && (
            <div className="text-xs text-white/60">
              <span className="font-medium text-white/80">Generated:</span>{" "}
              {generatedName}
            </div>
          )}

          <div className="rounded border border-white/10 overflow-hidden bg-black">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="block w-full"
              style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
            />
          </div>

          {streamedText && (
            <details className="text-xs text-white/50">
              <summary className="cursor-pointer">AI text output</summary>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] max-h-32 overflow-auto bg-black/40 p-2 rounded">
                {streamedText}
              </pre>
            </details>
          )}

          {generatedSource && (
            <details className="text-xs text-white/50">
              <summary className="cursor-pointer">Generated source</summary>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] max-h-48 overflow-auto bg-black/40 p-2 rounded">
                {generatedSource}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
