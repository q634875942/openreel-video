#!/bin/bash
# Harness initialization script — runs verification end-to-end.
# Use ./init.ps1 on native PowerShell instead.

set -e

echo "=== openreel-video fork: Harness Init ==="
echo ""

# Ensure pnpm is in PATH (Windows shells often miss it after install)
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[!] pnpm not on PATH. On Windows, run from a shell where Node's user PATH is loaded."
  echo "    Try opening a fresh PowerShell or running:"
  echo "    export PATH=\"\$PATH:/d/Nodejs\""
  exit 1
fi

echo "--- Installing dependencies (pnpm install) ---"
pnpm install

echo ""
echo "--- Type check (pnpm typecheck) ---"
pnpm typecheck

echo ""
echo "--- Lint (pnpm lint) ---"
pnpm lint || echo "[!] Lint reported issues — review before claiming feature done."

echo ""
echo "--- Tests (pnpm test) ---"
pnpm test

echo ""
echo "=== Verification Complete ==="
echo ""
echo "Next steps:"
echo "  1. Read feature_list.json — pick exactly ONE feature to work on"
echo "  2. Read progress.md to see where the last session left off"
echo "  3. Implement only that feature"
echo "  4. Run pnpm dev (http://localhost:5173) for manual UI checks"
echo "  5. Re-run ./init.sh before claiming the feature done"
