/**
 * Structural hygiene — foundation and design-system CSS invariants, the
 * Letterpress polish layer, package script guards, and tombstones for files
 * that must stay deleted.
 */
export function checkStructureHygiene({ read, mustInclude, mustExclude, mustBeDeleted }) {
  const packageJson = read("package.json");
  const foundationCss = read("src/styles/foundation.css");
  const designSystemCss = read("src/styles/design-system.css");
  const letterpressPolish = read("src/styles/letterpress-polish.css");
  const indexCss = read("src/index.css");
  const designVisionSource = read("src/lib/wireline-design-vision.ts");

  mustInclude(
    "package.json",
    packageJson,
    /"design:check"\s*:\s*"node scripts\/check-wireline-clear-system\.mjs(?:\s*&&\s*node scripts\/check-command-palette-contract\.mjs)?"/,
    "design:check must run this file",
  );
  mustExclude(
    "package.json",
    packageJson,
    /stripe:sync-secrets|sync-stripe-secrets-to-vercel/,
    "package scripts must not expose the retired Stripe secret sync helper",
  );

  mustInclude(
    "src/styles/foundation.css",
    foundationCss,
    /color-scheme:\s*dark/,
    "the product is dark-only; the root color-scheme must be dark",
  );
  mustInclude(
    "src/styles/foundation.css",
    foundationCss,
    /overflow:\s*hidden/,
    "outer viewport must stay locked",
  );
  mustInclude(
    "src/styles/foundation.css",
    foundationCss,
    /--wl-text-tertiary:\s*var\(--wireline-color-text-tertiary\)/,
    "foundation must map tertiary text to generated token",
  );
  mustInclude(
    "src/styles/design-system.css",
    designSystemCss,
    /Wireline — Letterpress design system/,
    "name the current Letterpress system",
  );
  mustInclude(
    "src/styles/design-system.css",
    designSystemCss,
    /\.wl-composer-dock/,
    "design system must expose shared composer dock utility",
  );
  mustInclude(
    "src/styles/design-system.css",
    designSystemCss,
    /\.wl-panel-elevated/,
    "design system must expose elevated panel primitive",
  );
  mustInclude(
    "src/styles/design-system.css",
    designSystemCss,
    /\.wl-chip-suggestion/,
    "design system must expose composer suggestion chips",
  );
  mustInclude(
    "src/index.css",
    indexCss,
    /@import\s+"\.\/styles\/letterpress-polish\.css"/,
    "index.css must import the Letterpress polish layer",
  );
  mustInclude(
    "src/styles/letterpress-polish.css",
    letterpressPolish,
    /\.wl-paper\s*\{[\s\S]*var\(--wireline-elevation-inset\)/,
    "letterpress polish must define the paper surface primitive with inset shadow",
  );
  mustInclude(
    "src/styles/letterpress-polish.css",
    letterpressPolish,
    /\.wl-focus-ring:focus-visible\s*\{[\s\S]*var\(--wireline-color-focus-default\)/,
    "letterpress polish must define the on-brand focus ring primitive",
  );
  mustInclude(
    "src/styles/letterpress-polish.css",
    letterpressPolish,
    /\.wl-metric-tile[\s\S]*var\(--wireline-font-family-display\)/,
    "letterpress polish must define the metric tile primitive in display type",
  );
  mustInclude(
    "src/styles/letterpress-polish.css",
    letterpressPolish,
    /\.wl-empty[\s\S]*var\(--wireline-color-surface-subtle\)/,
    "letterpress polish must define the empty state primitive",
  );
  mustInclude(
    "src/styles/letterpress-polish.css",
    letterpressPolish,
    /\.wl-eyebrow::before[\s\S]*var\(--wireline-color-action-secondary-default\)/,
    "letterpress polish must use the silver wire as the eyebrow rule",
  );
  mustInclude(
    "src/lib/wireline-design-vision.ts",
    designVisionSource,
    /"wl-paper"[\s\S]*"wl-metric-tile"[\s\S]*"wl-empty"/,
    "design vision manifest must list the polish primitives",
  );

  mustBeDeleted(
    "src/components/ExperimentalConsole.tsx",
    "experimental console should not be revived",
  );
  mustBeDeleted("src/components/LegacySidebar.tsx", "legacy sidebar should not be revived");
  mustBeDeleted(
    "src/components/marketing/HeroCallPreview.tsx",
    "retired Sarah call preview must stay deleted",
  );
  mustBeDeleted(
    "docs/superpowers/plans/2026-06-24-visual-action-public-pages.md",
    "stale visual-action plan that references the retired call preview must stay deleted",
  );
  mustBeDeleted(
    "docs/superpowers/specs/2026-06-24-visual-action-public-pages.md",
    "stale visual-action spec that references the retired call preview must stay deleted",
  );
  mustBeDeleted(
    "src/components/StudioAssistantWorkspace.tsx",
    "dead legacy Studio rail must stay deleted",
  );
  mustBeDeleted("src/components/ui/NebulaPulse.tsx", "unused nebula visual primitive must stay deleted");
  mustBeDeleted(
    "src/components/ui/AssistantConstellation.tsx",
    "unused assistant constellation visual primitive must stay deleted",
  );
  mustBeDeleted(
    "src/components/ui/ConstellationField.tsx",
    "unused constellation field visual primitive must stay deleted",
  );
  mustBeDeleted(
    "src/components/migration/ZipLanding.tsx",
    "standalone redesign landing artifact used the wrong dark/blue palette and must stay deleted",
  );
  mustBeDeleted(
    "src/styles/zip-platform-tokens.css",
    "standalone redesign token shim must not override Wireline Letterpress",
  );
  mustBeDeleted(
    "src/styles/zip-landing.css",
    "standalone redesign landing CSS must not reintroduce the wrong palette",
  );
  mustBeDeleted(
    "src/styles/zip-landing-sections.css",
    "standalone redesign landing section CSS must not reintroduce the wrong palette",
  );
  mustBeDeleted(
    "src/styles/source-migration.css",
    "temporary source-migration styling must not remain after the Letterpress migration",
  );
  mustBeDeleted("src/lib/wireline-signal-design.ts", "retired signal class bridge must stay deleted");
  mustBeDeleted(
    "scripts/sync-stripe-secrets-to-vercel.mjs",
    "retired Stripe secret sync helper must stay deleted",
  );
  mustBeDeleted("scripts/og-image.svg", "retired logo-only OG source must stay deleted");
  mustBeDeleted(
    "scripts/check-active-surface-drift.mjs",
    "retired Ametrine surface contract must stay deleted",
  );
  mustBeDeleted(
    "src/routes/director-routes.ts",
    "unmounted Director API (superseded by Studio Workroom's agent-workspace routes) must stay deleted",
  );
  mustBeDeleted(
    "src/components/director",
    "unmounted Director chat UI (superseded by StudioWorkroom) must stay deleted",
  );
  mustBeDeleted(
    "src/components/layout/DirectorLayout.tsx",
    "unmounted Director layout must stay deleted",
  );
}
