# One-shot migration: arbitrary text-[10px] micro labels → design-system classes.
# Excludes marketing surfaces and integration vendor mocks.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$skipPathParts = @(
  "\components\marketing\",
  "\pages\LandingPage.tsx",
  "\pages\Pricing.tsx",
  "\pages\About.tsx",
  "\pages\Blog.tsx",
  "\pages\BlogPost.tsx",
  "\pages\Showcase.tsx",
  "\pages\Compare.tsx",
  "\pages\VerticalLanding.tsx",
  "\pages\Developers.tsx",
  "PreviewCards.tsx",
  "IntegrationLogos.tsx"
)

$replacements = [ordered]@{
  "text-[10px] uppercase tracking-[0.3em] text-brand" = "wl-label text-brand"
  "text-[10px] uppercase tracking-[0.28em] text-brand" = "wl-label text-brand"
  "text-[10px] uppercase tracking-[0.32em] text-brand" = "wl-label text-brand"
  "text-[10px] uppercase tracking-[0.16em] text-brand" = "wl-label text-brand"
  "text-[10px] uppercase tracking-[0.3em] text-muted" = "wl-label-muted"
  "text-[10px] uppercase tracking-[0.22em] text-muted" = "wl-label-muted"
  "text-[10px] uppercase tracking-[0.18em] text-muted" = "wl-label-muted"
  "text-[10px] uppercase tracking-[0.2em] text-muted" = "wl-label-muted"
  "text-[10px] uppercase tracking-[0.16em] text-muted/80" = "wl-label-muted opacity-80"
  "text-[10px] uppercase tracking-[0.5em] text-muted/70" = "wl-label-muted opacity-70"
  "text-[10px] uppercase tracking-[0.4em] text-center" = "wl-label text-center"
  "text-[10px] uppercase tracking-[0.4em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.3em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.28em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.22em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.2em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.18em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.16em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.14em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.12em]" = "wl-label"
  "text-[10px] text-muted/80" = "wl-micro-meta--muted"
  "text-[10px] text-muted/70" = "wl-micro-meta--muted"
  "text-[10px] text-ink/40" = "wl-micro-meta"
  "text-[10px] text-ink/50" = "wl-micro-meta"
  "text-[10px] font-mono text-muted" = "wl-micro-badge font-mono text-muted"
  "text-[10px] font-mono text-ink" = "wl-micro-badge font-mono text-ink"
  "text-[10px] font-mono" = "wl-micro-badge font-mono"
  "text-[10px] text-destructive" = "wl-micro-meta text-destructive"
  "text-[10px] text-muted" = "wl-micro-meta--muted"
  "text-[10px] uppercase tracking-widest" = "wl-label"
  "text-[10px] uppercase tracking-wider" = "wl-label"
  "text-[10px] uppercase tracking-[0.25em] text-brand" = "wl-label text-brand"
  "text-[10px] uppercase tracking-[0.25em] text-muted/80" = "wl-label-muted opacity-80"
  "text-[10px] uppercase tracking-[0.25em] text-ink/40" = "wl-micro-meta"
  "text-[10px] uppercase tracking-[0.25em] text-ink/70" = "wl-micro-meta"
  "text-[10px] uppercase tracking-[0.25em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.24em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.26em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.35em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.1em]" = "wl-label"
  "text-[10px] text-ink/65" = "wl-micro-meta opacity-90"
  "text-[10px] text-ink/55" = "wl-micro-meta opacity-80"
  "text-[10px] font-medium tabular-nums" = "wl-micro-badge font-medium"
  "text-[10px] font-semibold text-brand" = "wl-label text-brand"
  "text-[10px] font-bold" = "wl-label font-bold"
  "text-[10px] tabular-nums" = "wl-micro-badge tabular-nums"
  "text-[10px] opacity-70" = "wl-micro-meta opacity-70"
  "text-[10px] leading-snug" = "wl-micro-meta leading-snug"
  "text-[10px] leading-relaxed" = "wl-micro-meta leading-relaxed"
  "text-[10px] font-medium" = "wl-micro-meta font-medium"
  "text-[10px] uppercase tracking-[0.42em] text-ink/40" = "wl-micro-meta"
  "text-[10px] uppercase tracking-[0.42em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.36em] text-muted/80" = "wl-label-muted opacity-80"
  "text-[10px] uppercase tracking-[0.36em]" = "wl-label"
  "text-[10px] uppercase tracking-[0.32em] text-ink/40" = "wl-micro-meta"
  "text-[10px] uppercase tracking-[0.32em] text-muted" = "wl-label-muted"
  "text-[10px] uppercase tracking-[0.32em]" = "wl-label"
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-brand" = "wl-label text-brand font-semibold"
  "text-[10px] font-semibold border" = "wl-label font-semibold border"
  "rounded-md text-[10px] font-semibold" = "rounded-md wl-label font-semibold"
  "rounded-md text-[10px] border" = "rounded-md wl-label border"
  "px-2.5 py-1 rounded-md text-[10px] font-semibold" = "px-2.5 py-1 rounded-md wl-label font-semibold"
  "px-2.5 py-1 rounded-md text-[10px] border" = "px-2.5 py-1 rounded-md wl-label border"
  "text-ink/40 ml-0.5 text-[10px]" = "text-ink/40 ml-0.5 wl-micro-meta"
  "text-ink/40 text-[10px]" = "wl-micro-meta"
  "text-[10px] text-rose-500 leading-snug" = "wl-micro-meta text-rose-500 leading-snug"
  "text-[10px] text-rose-500" = "wl-micro-meta text-rose-500"
  "text-[10px] text-brand/80 leading-snug" = "wl-micro-meta text-brand/80 leading-snug"
  "rounded-full text-[10px] tracking-wide" = "rounded-full wl-label tracking-wide"
  "rounded-full text-[10px] tracking-[0.25em]" = "rounded-full wl-label"
  "text-[10px] text-ink/85" = "wl-micro-meta text-ink/85"
  "w-full text-[10px] rounded-md" = "w-full wl-micro-meta rounded-md"
  "text-[10px] uppercase tracking-[0.5em] text-rose-500/60" = "wl-label text-rose-500/60"
  "flex items-center justify-between text-[10px]" = "flex items-center justify-between wl-micro-meta"
  "flex items-center gap-2 px-2.5 py-1.5 text-[10px]" = "flex items-center gap-2 px-2.5 py-1.5 wl-micro-meta"
  "text-[10px] leading-none uppercase tracking-[0.2em]" = "wl-label leading-none"
  "text-[10px] uppercase tracking-[0.5em] text-ink/40" = "wl-micro-meta"
  "text-[10px] tracking-[0.24em] uppercase text-brand" = "wl-label text-brand"
  "text-[10px] text-brand/70" = "wl-micro-meta text-brand/70"
  "text-[10px] text-brand/70 font-mono" = "wl-micro-badge font-mono text-brand/70"
  "text-[10px] text-brand/70 line-clamp-2" = "wl-micro-meta text-brand/70 line-clamp-2"
  "text-brand/60 shrink-0 font-mono text-[10px]" = "text-brand/60 shrink-0 font-mono wl-micro-badge"
  "text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium" = "wl-label px-1.5 py-0.5 rounded-full bg-brand/10 text-brand font-medium"
  "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-brand/8 text-[10px] text-brand/70 font-mono tabular-nums" = "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-brand/8 wl-micro-badge text-brand/70 font-mono tabular-nums"
  "text-[10px] font-semibold text-ink shadow-lg" = "wl-label font-semibold text-ink shadow-lg"
  "w-full h-auto justify-start px-1.5 py-0.5 rounded text-[10px]" = "w-full h-auto justify-start px-1.5 py-0.5 rounded wl-micro-meta"
  "w-full h-auto justify-start rounded-none px-3 py-2 text-[10px]" = "w-full h-auto justify-start rounded-none px-3 py-2 wl-micro-meta"
  "text-[10px] px-1.5 py-0.5 rounded wl-status-success" = "wl-micro-badge px-1.5 py-0.5 rounded wl-status-success"
  "text-rose-600 text-[10px] bg-rose-500/5" = "wl-micro-meta text-rose-600 bg-rose-500/5"
}

$files = Get-ChildItem -Path (Join-Path $root "src\components"), (Join-Path $root "src\pages") -Recurse -Include *.tsx
$changed = 0
$totalSubs = 0

foreach ($file in $files) {
  $rel = $file.FullName.Substring($root.Length)
  $skip = $false
  foreach ($part in $skipPathParts) {
    if ($rel -like "*$part*") { $skip = $true; break }
  }
  if ($skip) { continue }

  $content = [IO.File]::ReadAllText($file.FullName)
  $original = $content
  foreach ($kv in $replacements.GetEnumerator()) {
    if ($content.Contains($kv.Key)) {
      $count = ([regex]::Matches($content, [regex]::Escape($kv.Key))).Count
      $content = $content.Replace($kv.Key, $kv.Value)
      $totalSubs += $count
    }
  }
  if ($content -ne $original) {
    [IO.File]::WriteAllText($file.FullName, $content)
    $changed++
    Write-Host "updated: $rel"
  }
}

Write-Host "Done. $changed files, $totalSubs substitutions."
