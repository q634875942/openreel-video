# Harness initialization (PowerShell). Use ./init.sh on Git Bash.

$ErrorActionPreference = "Stop"

Write-Host "=== openreel-video fork: Harness Init ===" -ForegroundColor Cyan
Write-Host ""

# Load user-scoped PATH so pnpm/node/gh are visible inside this shell
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

# Corepack/pnpm registry override (China-friendly default; safe globally)
if (-not $env:COREPACK_NPM_REGISTRY) {
  $env:COREPACK_NPM_REGISTRY = 'https://registry.npmmirror.com'
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "[!] pnpm not on PATH. Install Node.js LTS then run: npm install -g pnpm@9" -ForegroundColor Red
  exit 1
}

Write-Host "--- Installing dependencies (pnpm install) ---" -ForegroundColor Yellow
pnpm install

Write-Host ""
Write-Host "--- Type check (pnpm typecheck) ---" -ForegroundColor Yellow
pnpm typecheck

Write-Host ""
Write-Host "--- Lint (pnpm lint) ---" -ForegroundColor Yellow
pnpm lint
if ($LASTEXITCODE -ne 0) {
  Write-Host "[!] Lint reported issues — review before claiming feature done." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "--- Tests (pnpm test) ---" -ForegroundColor Yellow
pnpm test

Write-Host ""
Write-Host "=== Verification Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Read feature_list.json - pick exactly ONE feature to work on"
Write-Host "  2. Read progress.md to see where the last session left off"
Write-Host "  3. Implement only that feature"
Write-Host "  4. Run 'pnpm dev' (http://localhost:5173) for manual UI checks"
Write-Host "  5. Re-run ./init.ps1 before claiming the feature done"
