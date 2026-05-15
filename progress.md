# Session Progress Log

## Current State

**Last Updated:** 2026-05-16
**Active Feature:** Slice 1 complete (feat-001, feat-002, feat-003 all done); feat-004 (Slice 2.1 — AIProvider abstraction) is next
**Dev server:** stopped

## Status

### What's Done

- [x] **feat-000 (Slice 0)**: Fork created at `q634875942/openreel-video`, cloned to `D:\Desktop\Claude_code\meta_pixel\openreel-video`
- [x] Node 24.15 + pnpm 11 + gh 2.92 + git installed; PowerShell ExecutionPolicy set to RemoteSigned (CurrentUser)
- [x] `pnpm install` clean (~21s)
- [x] Vite dev server verified at http://localhost:5173 (HTTP 200)
- [x] Architecture mapped — see [SLICE0_FINDINGS.md](SLICE0_FINDINGS.md)
- [x] Slice 0 committed as `c55a542` (`.npmrc`, `SLICE0_FINDINGS.md`)
- [x] Harness scaffolded: AGENTS.md, CLAUDE.md, feature_list.json, init.sh, init.ps1, progress.md
- [x] **feat-001 (Slice 1.1) — GeneratedClip type definition**: extended `GraphicType` union with `"generated"`; added `GeneratedClip`, `GeneratedClipPromptMessage`, `GeneratedClipSourceLanguage`, and `DEFAULT_GENERATED_PARAMS_SCHEMA` in `packages/core/src/graphics/types.ts`. Auto-exported via `@openreel/core`. Workspace typecheck clean, core test suite 176/176 passing.
- [x] **feat-002 (Slice 1.2) — GeneratedClip renderer integration**: added `renderGeneratedClip` to `ThreeJSLayerRenderer` (Three.js path) and `renderGeneratedClipOnly` to `canvas-renderers.ts` (Canvas 2D path), both draw colored rect from `params.color`. Extended `GraphicClipUnion` and added `generated` dispatch branches in `renderShapeClipToCanvas`. Widened narrow type literals in `Preview.tsx`. Added 5 unit tests for `readGeneratedClipColor`. Verified: workspace typecheck clean; `apps/web` tests 125 pass / 1 pre-existing fail unrelated to feat-002 (confirmed via git stash baseline).
- [x] **feat-003 (Slice 1.3) — Sandbox execution layer**: chose Web Worker + procedural SceneDescription (rect/circle/line/text in normalized 0..1 coords). 6 new files in `apps/web/src/objects/`: `SceneDescription.ts` (protocol types), `sandbox-engine.ts` (pure compile + runFrame, fully unit-testable), `sandbox-protocol.ts` (postMessage wire types), `sandbox-worker.ts` (thin Worker shell), `Sandbox.ts` (main-thread wrapper with init/renderFrame/getLatestScene/dispose, configurable timeouts, requestId multiplexing, Worker factory injection for tests), `index.ts` (barrel). +22 new tests, all green.

### What's In Progress

- [ ] **feat-004 — AIProvider abstraction**: not yet started. First step of Slice 2 (multi-provider AI).

### What's Next

1. Define `AIProvider` interface in `apps/web/src/ai/AIProvider.ts`: generate(req) → AsyncIterable<chunk>, listModels()
2. Pick JSON Schema as the lowest-common-denominator tool-call format
3. Decide message shape (system prompt, messages array, tools, stream, temperature)
4. Implement `apps/web/src/ai/providers/registry.ts` for managing the active provider
5. Stub one provider end-to-end first (ClaudeProvider is highest quality for code generation) before fanning out to OpenAI/DeepSeek/Compatible
6. Sandbox integration with the renderers (so a GeneratedClip with real source actually renders the AI shapes) was originally planned for feat-003 but split to a future feat — feat-002's hardcoded `params.color` rect path is still in use. Track this as carry-over work.

## Blockers / Risks

- **(low)** `pnpm lint` is currently best-effort in init scripts — upstream may have pre-existing lint warnings unrelated to our work. If our PRs are blocked by lint we may need to be stricter.
- **(low)** `mediabunny.d.ts` at repo root is a 130k-line type file — be careful about TS server perf while editing in heavy IDEs.
- **(med)** Upstream Augani/openreel-video is actively developed. We should rebase against `upstream/main` at the start of each work session if it's been more than a few days.

## Decisions Made

- **Build on openreel-video, not Godot**: Architectural incompatibility ruled out direct combination. openreel already has Three.js + NLE + keyframes; we add a new clip type rather than rewrite anything. See [SLICE0_FINDINGS.md](SLICE0_FINDINGS.md) §5.
- **Multi-provider AI from day one**: Provider abstraction (Claude / OpenAI / DeepSeek / OpenAI-compatible). JSON Schema is the lowest-common-denominator tool-call format. No silent fallback.
- **npmmirror by default**: GFW reset TLS to `registry.npmjs.org`. Project `.npmrc` + global `COREPACK_NPM_REGISTRY=https://registry.npmmirror.com` work around this. Safe to keep globally.
- **GeneratedClip is additive, not invasive**: Mirrors ShapeClip/SVGClip patterns. We extend `ThreeJSLayerRenderer` rather than replace it.

## Files Modified This Session

- `.npmrc` — new — npmmirror registry override
- `SLICE0_FINDINGS.md` — new — architecture exploration findings
- `AGENTS.md` — new — harness routing layer
- `CLAUDE.md` — new — delegates to AGENTS.md
- `feature_list.json` — new + updated — Slice 1–6 mapped; feat-001 marked done with evidence
- `init.sh` — new — Git Bash verification script
- `init.ps1` — new — PowerShell verification script
- `progress.md` — new + updated — this file
- `packages/core/src/graphics/types.ts` — modified — extended `GraphicType`; added `GeneratedClip` and friends for feat-001
- `apps/web/src/components/editor/preview/threejs-layer-renderer.ts` — modified — added `renderGeneratedClip`, `readGeneratedClipColor`, `DEFAULT_GENERATED_CLIP_COLOR` for feat-002
- `apps/web/src/components/editor/preview/canvas-renderers.ts` — modified — extended `GraphicClipUnion`, added `renderGeneratedClipOnly`, added `generated` branches in `renderShapeClipToCanvas` dispatch for feat-002
- `apps/web/src/components/editor/preview/canvas-renderers.test.ts` — modified — added 5 unit tests for `readGeneratedClipColor`
- `apps/web/src/components/editor/Preview.tsx` — modified — widened narrow `ShapeClip | SVGClip | StickerClip` type literals to include `GeneratedClip` (8 sites)
- `apps/web/src/objects/SceneDescription.ts` — new — wire protocol types for feat-003
- `apps/web/src/objects/sandbox-engine.ts` — new — pure compile + runFrame logic
- `apps/web/src/objects/sandbox-protocol.ts` — new — postMessage message types
- `apps/web/src/objects/sandbox-worker.ts` — new — Worker shell
- `apps/web/src/objects/Sandbox.ts` — new — main-thread Sandbox wrapper
- `apps/web/src/objects/index.ts` — new — module barrel
- `apps/web/src/objects/sandbox-engine.test.ts` — new — 14 unit tests for compile + runFrame
- `apps/web/src/objects/Sandbox.test.ts` — new — 8 unit tests using FakeWorker

## Evidence of Completion (feat-000 / Slice 0)

- `pnpm install` exit 0, 844 packages in 21.5s (Bash task `bgqyw3k49`)
- `curl http://localhost:5173/` → HTTP 200, Vite-served HTML (PowerShell verification)
- `git push origin main` → fork updated to `c55a542`

## Notes for Next Session

- Skill `harness-creator` is installed at `C:\Users\Administrator\.claude\skills\harness-creator\` — discoverable by Claude Code on next session start
- The local clone of the harness skill repo at `D:\Desktop\Claude_code\meta_pixel\harness-skill-tmp\` is disposable — delete when convenient
- Full design plan (not committed to repo) lives at `C:\Users\Administrator\.claude\plans\https-github-com-godotengine-godot-http-cached-melody.md`
- Memory entry `project_creator_tool.md` already exists in user memory dir, keep updated when major decisions change
