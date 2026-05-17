// SourceEditorDialog — feat-008's Monaco-based code editor for
// GeneratedClip.source. Opened by double-clicking a generated clip on
// the timeline (see ui-store.openSourceEditor). Save commits the edits
// via project-store.updateGeneratedClipSource, which disposes the old
// sandbox; the renderer's next ensure() rebuilds it with the new
// source. We then await SandboxRegistry.awaitReady(clipId) to either
// close the dialog on success or surface the compile error inline.
//
// This module is lazy-loaded from App.tsx so Monaco doesn't bloat the
// main bundle. Side-effecting setupMonacoEnv import happens here, in
// the same chunk, so worker registration completes before <Editor />
// mounts.

import "./setupMonacoEnv";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Editor, type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openreel/ui";
import { useUIStore } from "../../stores/ui-store";
import { useProjectStore } from "../../stores/project-store";
import { SandboxRegistry } from "../../objects/SandboxRegistry";
import {
  SCENE_DESCRIPTION_TYPINGS,
  SCENE_DESCRIPTION_TYPINGS_PATH,
} from "./sceneDescriptionTypes";

export function SourceEditorDialog() {
  const clipId = useUIStore((s) => s.sourceEditorClipId);
  const closeSourceEditor = useUIStore((s) => s.closeSourceEditor);
  // Subscribe to project.modifiedAt so a fresh getGeneratedClip() runs
  // after external mutations (e.g. someone else edits via ParamPanel).
  const modifiedAt = useProjectStore((s) => s.project.modifiedAt);

  const clip = useMemo(() => {
    if (!clipId) return null;
    return useProjectStore.getState().getGeneratedClip(clipId) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, modifiedAt]);

  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset draft whenever the editor opens for a different clip.
  useEffect(() => {
    if (clip) {
      setDraft(clip.source);
      setSaveError(null);
    }
  }, [clip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard isolation is handled in services/keyboard-shortcuts.ts via
  // a target-whitelist (contentEditable / [role="dialog"] /
  // .monaco-editor). We deliberately do NOT add a window-level capture
  // listener here: doing so cuts off Monaco's own keydown listeners
  // (Ctrl+Z / arrows / Tab / Home/End live in Monaco internals, not in
  // textarea defaults), breaking everything except basic typing.

  const onMount = useCallback(
    (editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
      // Inject the SceneDescription type definitions so the editor's
      // TypeScript language service offers intellisense for
      // SceneDescription / Shape / GeneratedObject when writing
      // AI-style sources.
      const ts = monaco.languages.typescript;
      ts.typescriptDefaults.addExtraLib(
        SCENE_DESCRIPTION_TYPINGS,
        SCENE_DESCRIPTION_TYPINGS_PATH,
      );
      // Loosen TS for the editor model — AI-generated source is a single
      // expression, not a module, so default strict checks complain a
      // lot. We keep intellisense, drop the semantic-error noise.
      ts.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
      });
      ts.typescriptDefaults.setCompilerOptions({
        target: ts.ScriptTarget.ES2020,
        allowNonTsExtensions: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        module: ts.ModuleKind.ESNext,
        allowJs: true,
      });
      // Radix Dialog's auto-focus targets the first focusable element
      // (usually a footer button). We override that with onOpenAutoFocus
      // preventDefault on DialogContent, but the editor still needs to
      // grab focus itself for its keybindings to dispatch.
      editor.focus();
    },
    [],
  );

  const onSave = useCallback(async () => {
    if (!clip || !clipId) return;
    if (draft === clip.source) {
      closeSourceEditor();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const updated = useProjectStore
        .getState()
        .updateGeneratedClipSource(clipId, draft);
      if (!updated) {
        setSaveError("Failed to update clip source. Clip no longer exists?");
        return;
      }
      // updateGeneratedClipSource disposed the old Sandbox. The renderer
      // would normally call SandboxRegistry.ensure(clip) on its next
      // frame, but if playback is paused and the playhead is outside the
      // clip's range, that frame may never come — awaitReady would then
      // see "clip not in registry". So we explicitly rebuild here so the
      // dialog has something to wait on.
      SandboxRegistry.ensure(updated);
      const { ready, error } = await SandboxRegistry.awaitReady(clipId, 3000);
      if (!ready) {
        setSaveError(
          error?.message ?? "Sandbox failed to initialize for unknown reason.",
        );
        return;
      }
      closeSourceEditor();
    } finally {
      setSaving(false);
    }
  }, [clip, clipId, draft, closeSourceEditor]);

  const onCancel = useCallback(() => {
    closeSourceEditor();
  }, [closeSourceEditor]);

  const onReset = useCallback(() => {
    if (clip) setDraft(clip.source);
    setSaveError(null);
  }, [clip]);

  const open = clipId !== null;
  const isDirty = clip ? draft !== clip.source : false;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSourceEditor();
      }}
    >
      <DialogContent
        className="max-w-5xl w-[95vw] h-[90vh] flex flex-col"
        // Keyboard event isolation: the global keyboard-shortcuts
        // Disable Radix's focus-scope Tab trap. Without this Radix
        // captures Tab to cycle focus among the dialog's focusable
        // descendants — but Monaco binds Tab to "insert indent" via its
        // own native listener and never gets to run because Radix
        // preventDefault's first.
        onOpenAutoFocus={(e) => {
          // Stop Radix from auto-focusing the first button on open.
          // We want the editor to receive focus instead.
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit AI Object Source</DialogTitle>
          <DialogDescription>
            {clip ? (
              <>
                <code className="text-text-secondary">{clip.providerId}</code>
                {clip.model ? (
                  <>
                    {" · "}
                    <code className="text-text-secondary">{clip.model}</code>
                  </>
                ) : null}
                {" · "}
                <span className="text-text-muted">
                  Save commits new code and rebuilds the sandbox; compile
                  errors keep this dialog open with the message inline.
                </span>
              </>
            ) : (
              "No clip selected."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 border border-border rounded overflow-hidden">
          {clip ? (
            <Editor
              language="typescript"
              value={draft}
              onChange={(v) => setDraft(v ?? "")}
              onMount={onMount}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                tabSize: 2,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                wordWrap: "on",
              }}
            />
          ) : null}
        </div>

        {saveError && (
          <div
            role="alert"
            className="rounded bg-red-900/40 border border-red-700 px-3 py-2 text-red-200 text-xs whitespace-pre-wrap"
          >
            <span className="font-medium text-red-100">Sandbox error:</span>{" "}
            {saveError}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onReset} disabled={saving || !isDirty}>
            Reset
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || !isDirty}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
