# AGENTS.md

Fork of `Augani/openreel-video` extended with **AI-generated `GeneratedClip` objects** for an AI-assisted video editor targeting self-media creators.

This file is the routing layer. Read it first, then follow the links.

## Startup Workflow

Before writing code:

1. **Confirm working directory** with `pwd` — should be the repo root
2. **Read this file** completely
3. **Read [SLICE0_FINDINGS.md](SLICE0_FINDINGS.md)** — architecture map, Clip taxonomy, the `ThreeJSLayerRenderer` integration point
4. **Run `./init.sh`** (Git Bash) or `./init.ps1` (PowerShell) — verifies env health
5. **Read [feature_list.json](feature_list.json)** to see current feature state
6. **Read [progress.md](progress.md)** for last session's handoff
7. **Review recent commits** with `git log --oneline -5`

If baseline verification fails, repair before adding new scope.

## Project Background

We are NOT building a generic CapCut clone. We are adding ONE big capability on top of openreel:

> A `GeneratedClip` type whose content is **AI-generated TypeScript code** rendered to the existing Three.js layer pipeline, with visual parameter editing, a Monaco source editor, and multi-provider AI (Claude / OpenAI / DeepSeek).

The full design plan lives at `C:\Users\Administrator\.claude\plans\https-github-com-godotengine-godot-http-cached-melody.md` (in user-scope plans dir, not committed to repo).

Upstream `Augani/openreel-video` provides the NLE, timeline, keyframe system, WebGPU preview, and existing clip types (Text/Shape/SVG/Sticker). We **extend**, we do not rewrite.

## Working Rules

- **One feature at a time**: Pick exactly one `in-progress` (or next `not-started`) feature from `feature_list.json`. Don't interleave.
- **Verification required**: Don't claim a feature done without running `pnpm typecheck && pnpm test && pnpm lint` and capturing output in `evidence`.
- **Stay additive**: New functionality lives in `apps/web/src/ai/`, `apps/web/src/objects/`, `apps/web/src/components/AIPanel/` etc. — **don't refactor existing openreel code unless the feature demands it**. We must rebase against upstream `Augani/main`.
- **Mirror existing Clip patterns**: `GeneratedClip` follows the same shape as `ShapeClip` / `SVGClip`. Adding it = mirror create/update/delete/render hooks, NOT new architecture.
- **No secrets in code**: Anthropic/OpenAI/DeepSeek API keys live in user-managed IndexedDB at runtime, never in source.
- **Update artifacts** before ending session: `progress.md` and `feature_list.json` must reflect reality.
- **Leave clean state**: Next session must be able to run `./init.sh` immediately. No half-broken `node_modules`, no uncommitted critical files.

## Required Artifacts

- `feature_list.json` — Feature state tracker (source of truth)
- `progress.md` — Session continuity log
- `init.sh` / `init.ps1` — Startup verification (Git Bash / PowerShell)
- `SLICE0_FINDINGS.md` — Architecture exploration findings, do not delete

## Repository Layout (essentials)

```
openreel-video/
├── apps/web/                     ← Video editor (this is where 95% of our changes go)
│   └── src/
│       ├── components/editor/preview/
│       │   ├── threejs-layer-renderer.ts   ← Three.js integration point
│       │   └── canvas-renderers.ts          ← Render orchestrator
│       ├── stores/project/                  ← Track / Clip CRUD (we extend here)
│       └── (new) ai/, objects/, components/AIPanel/, components/ParamPanel/, components/SourceEditor/
├── apps/image/                   ← Standalone photo editor (do NOT modify for this initiative)
├── packages/core/                ← @openreel/core — shared types, AnimationEngine, etc.
│   └── src/graphics/types.ts     ← Where we'll add the GeneratedClip type
├── packages/ui/                  ← @openreel/ui — shared UI primitives
└── packages/image-core/          ← Photo engine (not used by us)
```

## Definition of Done

A feature is done only when ALL of these are true:

- [ ] Target behavior implemented per `feature_list.json` description
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` passes (the touched packages at minimum)
- [ ] `pnpm lint` clean for touched files
- [ ] If it adds UI: manually verified in `pnpm dev` (URL `http://localhost:5173`)
- [ ] Evidence string in `feature_list.json` describes how it was verified (command + result)
- [ ] Working tree clean enough that `./init.sh` re-runs cleanly

## Verification Commands

```bash
# Full verification
./init.sh

# Individual checks
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm dev      # for manual UI checks
```

PowerShell equivalent: `./init.ps1`.

## End of Session

Before ending a session:

1. Update `progress.md`: what got done, what's in flight, blockers, decisions
2. Update `feature_list.json`: feature statuses + evidence strings
3. Stage and commit harness files together with code changes (don't leave drift)
4. Optionally push to `origin/main` (your fork) — never to `upstream`
5. Confirm `./init.sh` still passes

## Escalation

- **Architecture decisions affecting existing Clip pipeline**: re-read SLICE0_FINDINGS.md; if still unclear, ask user before changing core code
- **AI provider quirks (tool-call format differences)**: localize translation in `src/ai/providers/<Name>Provider.ts`, never leak provider specifics to upper layers
- **Upstream conflicts on rebase**: prefer keeping our changes additive in our own files; only touch upstream files if absolutely required, and surface conflicts to user

## What This Project Is NOT

To prevent scope creep:

- Not a Godot integration (architecturally infeasible — see SLICE0_FINDINGS.md context)
- Not a backend service (everything stays client-side, IndexedDB only)
- Not a mobile app
- Not a "one-prompt → full video" generator (we are step-by-step, with user editing in between)
- Not an attempt to extend `apps/image` — that's separate
