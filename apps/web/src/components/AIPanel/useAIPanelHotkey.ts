// Tiny hook: listen for Ctrl+Shift+G (Cmd+Shift+G on Mac) and toggle the
// supplied open/close pair. Lives in its own module so the keyboard
// binding is easy to swap if it conflicts with something else.

import { useEffect } from "react";

export const AI_PANEL_HOTKEY_LABEL =
  navigator.userAgent.includes("Mac") ? "⌘+⇧+G" : "Ctrl+Shift+G";

export function useAIPanelHotkey(toggle: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const modifier = e.ctrlKey || e.metaKey;
      if (modifier && e.shiftKey && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);
}
