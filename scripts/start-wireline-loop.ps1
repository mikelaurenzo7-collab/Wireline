# Monitored Wireline agent loop — emits AGENT_LOOP_TICK_wireline_ai every N minutes.
# Run from repo root or anywhere (script cd's to repo root).
param(
  [int] $IntervalMinutes = 30
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$tickPath = Join-Path $RepoRoot "docs\loop-ticks\wireline-ai-tick.md"
if (-not (Test-Path $tickPath)) {
  Write-Error "Missing tick file: $tickPath"
  exit 1
}

$sec = [Math]::Max(60, $IntervalMinutes * 60)
Write-Host "Wireline overnight loop armed: repo=$RepoRoot tick=docs/loop-ticks/wireline-ai-tick.md interval=${IntervalMinutes}m (first tick after sleep)."
Write-Host "Stop: close this terminal or Ctrl+C."

while ($true) {
  Start-Sleep -Seconds $sec
  $body = (Get-Content -Raw $tickPath).Trim()
  $json = (@{ prompt = $body } | ConvertTo-Json -Compress)
  Write-Output "AGENT_LOOP_TICK_wireline_ai $json"
}
