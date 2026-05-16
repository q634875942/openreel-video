# Session Progress Log

## Current State

**Last Updated:** 2026-05-16
**Active Feature:** feat-006 done — MVP AI panel with standalone preview lands. Next: integration into timeline (feat-007 carry-over) and OpenAI/Compatible providers.
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
- [x] **feat-004 (Slice 2.1) — AIProvider abstraction**: defined provider-neutral types + AIProvider interface + two pure helpers in `apps/web/src/ai/`. Types include ChatMessage with both string-content and array-of-content-parts shapes, ToolDefinition wrapping JSON Schema, GenerateRequest, the GenerateChunk discriminated union (message-start/text-delta/tool-use-start/tool-use-input-delta/tool-use-end/done/error), FinalResult. AIProvider interface: info + listModels() + generate(request, options?) returning AsyncIterable<GenerateChunk>, with AbortSignal support. Helpers: streamToFinal collects a stream into FinalResult (handles concurrent tool calls, JSON parse errors, terminal/error chunks); validateGenerateRequest does runtime shape checking returning an error array. +24 new tests, all green.
- [x] **feat-005 (Slice 2.2) — Provider implementations (Claude + DeepSeek)**: installed @anthropic-ai/sdk ^0.96.0 and openai ^6.37.0. Implemented two providers via stream translators (openai-translation.ts, anthropic-translation.ts), DeepSeekProvider (openai SDK + DeepSeek baseURL, deepseek-v4-flash / deepseek-v4-pro), ClaudeProvider (anthropic SDK with ephemeral prompt caching on system + last tool, opus-4-7/sonnet-4-6/haiku-4-5), ProviderRegistry. OpenAIProvider and CompatibleProvider deferred — DeepSeek's openai-compatible path already exercises that code. Dev-time keys flow through apps/web/.env.example (VITE_*). Encrypted IndexedDB key storage deferred to feat-006. +42 unit tests, all green.
- [x] **feat-005 verification (live API)**: ran `apps/web/scripts/smoke-deepseek.mjs` against real DeepSeek API. Returned `"Hello there friend"` in 236 chunks (231 reasoning_content + 4 content), finish_reason=stop, usage tokens reported correctly. Confirmed: key valid, network reaches api.deepseek.com, V4 model names correct, our openai-translation.ts wire format matches DeepSeek's real streaming output. Two findings recorded for follow-up: (a) DeepSeek-V4 is reasoning-first — max_tokens >= 800 needed for short replies; (b) `reasoning_content` field is silently dropped by current translator — a future feat can add a `reasoning-delta` channel to GenerateChunk if the UI wants to show "AI is thinking" progress.
- [x] **feat-006 (Slice 2.3) — AI Panel MVP**: floating panel toggled by Ctrl+Shift+G that proves the end-to-end loop without yet integrating into openreel's timeline. New files: `apps/web/src/ai/objectPrompt.ts` (system prompt + tool def), `generateObject.ts` (high-level helper), `providers/bootstrap.ts` (registry from .env.local), `components/AIPanel/AIPanel.tsx`, `renderScene.ts`, `useAIPanelHotkey.ts`, `index.ts`. Mounted in App.tsx alongside SearchModal. +15 tests (generateObject 7, renderScene 8). Dev server verified (Vite ready in 1010ms, AIPanel.tsx compiled OK).
- [x] **feat-006 hotfix — DeepSeek reasoner tool_choice**: live testing surfaced `400: deepseek-reasoner does not support this tool_choice` when AIPanel hit Generate with deepseek-v4-flash. Both V4 variants are reasoners and reject forced tool_choice. Added `supportsForcedToolChoice?: boolean` to ModelInfo (default treated as true). DeepSeek's v4-flash and v4-pro now declare `supportsForcedToolChoice: false`. New helper `stripForcedToolChoiceIfUnsupported(request, models)` runs before buildOpenAICompatBody and drops forceTool for unsupported models; resulting tool_choice falls back to `'auto'` and the strong system prompt in objectPrompt.ts coerces the tool call. +5 unit tests covering the strip helper + the provider-level strip behaviour.

### What's In Progress

- [ ] **feat-007 — Timeline integration**: wire the AI panel's output into openreel's project store as a real GeneratedClip on a graphics track; reuse the existing canvas-renderers dispatch instead of the panel's standalone preview canvas.

### What's Next

In rough priority order:
1. `createGeneratedClip` action in the project store, mirroring createShapeClip/createSVGClip
2. Replace canvas-renderers.ts's hardcoded `params.color` rect (the feat-002 placeholder) with a call into a per-clip Sandbox that yields a SceneDescription, then loop `renderScene` over its shapes
3. Once that loop works, the AI panel's standalone preview becomes redundant — add an "Add to timeline" button that calls createGeneratedClip with the AI's source
4. Settings UI + encrypted IndexedDB key store (currently keys are .env.local-only)
5. OpenAIProvider + CompatibleProvider (DeepSeek already exercises the openai-compatible code path)
6. "Fix with AI" on render error: capture sandbox init errors and feed them back into the AI as a tool-result follow-up message
7. ParamPanel (JsonSchema -> form) so the user can tweak `defaultParams` after generation
8. SourceEditor (Monaco) for the half-technical user's "escape hatch"

User can verify feat-006 live with the leaked DeepSeek key (or a freshly-rotated one) by setting VITE_DEEPSEEK_API_KEY in apps/web/.env.local, running `pnpm dev`, pressing Ctrl+Shift+G, and clicking Generate.

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
- `apps/web/src/ai/types.ts` — new — provider-neutral AI types (feat-004)
- `apps/web/src/ai/AIProvider.ts` — new — AIProvider interface
- `apps/web/src/ai/streamToFinal.ts` — new — pure helper to collect stream into FinalResult
- `apps/web/src/ai/validateGenerateRequest.ts` — new — runtime shape check for outgoing requests
- `apps/web/src/ai/index.ts` — new — barrel
- `apps/web/src/ai/streamToFinal.test.ts` — new — 8 unit tests
- `apps/web/src/ai/validateGenerateRequest.test.ts` — new — 16 unit tests
- `apps/web/src/ai/providers/openai-translation.ts` — new — OpenAI-compatible stream translator (DeepSeek/OpenAI/Compatible all share)
- `apps/web/src/ai/providers/anthropic-translation.ts` — new — Anthropic stream translator
- `apps/web/src/ai/providers/DeepSeekProvider.ts` — new — DeepSeek provider via openai SDK
- `apps/web/src/ai/providers/ClaudeProvider.ts` — new — Claude provider with prompt caching
- `apps/web/src/ai/providers/registry.ts` — new — ProviderRegistry with auto-default and current selection
- `apps/web/src/ai/providers/*.test.ts` — new — 42 unit tests across 5 files
- `apps/web/.env.example` — modified — added VITE_ANTHROPIC_API_KEY / VITE_OPENAI_API_KEY / VITE_DEEPSEEK_API_KEY / VITE_COMPATIBLE_* dev vars
- `apps/web/package.json` — modified — added @anthropic-ai/sdk and openai as dependencies
- `apps/web/scripts/smoke-deepseek.mjs` — new — one-off live API verification script (uses openai SDK directly; gated by VITE_DEEPSEEK_API_KEY in .env.local). Confirmed feat-005's wire format against real DeepSeek API on 2026-05-16.
- `apps/web/src/ai/objectPrompt.ts` — new — system prompt + DEFINE_GENERATED_OBJECT_TOOL JSON Schema (feat-006)
- `apps/web/src/ai/generateObject.ts` — new — high-level helper wrapping provider + tool call
- `apps/web/src/ai/generateObject.test.ts` — new — 7 unit tests
- `apps/web/src/ai/providers/bootstrap.ts` — new — bootstrap registry from VITE_*_API_KEY
- `apps/web/src/components/AIPanel/AIPanel.tsx` — new — floating panel React component
- `apps/web/src/components/AIPanel/renderScene.ts` — new — standalone SceneDescription -> Canvas2D renderer
- `apps/web/src/components/AIPanel/renderScene.test.ts` — new — 8 unit tests
- `apps/web/src/components/AIPanel/useAIPanelHotkey.ts` — new — Ctrl+Shift+G hotkey hook
- `apps/web/src/components/AIPanel/index.ts` — new — barrel
- `apps/web/src/App.tsx` — modified — mounted AIPanel + wired hotkey

## Evidence of Completion (feat-000 / Slice 0)

- `pnpm install` exit 0, 844 packages in 21.5s (Bash task `bgqyw3k49`)
- `curl http://localhost:5173/` → HTTP 200, Vite-served HTML (PowerShell verification)
- `git push origin main` → fork updated to `c55a542`

## Notes for Next Session

- Skill `harness-creator` is installed at `C:\Users\Administrator\.claude\skills\harness-creator\` — discoverable by Claude Code on next session start
- The local clone of the harness skill repo at `D:\Desktop\Claude_code\meta_pixel\harness-skill-tmp\` is disposable — delete when convenient
- Full design plan (not committed to repo) lives at `C:\Users\Administrator\.claude\plans\https-github-com-godotengine-godot-http-cached-melody.md`
- Memory entry `project_creator_tool.md` already exists in user memory dir, keep updated when major decisions change
