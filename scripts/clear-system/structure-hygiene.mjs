/**
 * Structural hygiene — CSS ownership, responsive foundations, shared control
 * contracts, theme parity, package guards, and tombstones for retired systems.
 */
export function checkStructureHygiene({ read, mustInclude, mustExclude, mustBeDeleted }) {
  const packageJson = read("package.json");
  const mainTsx = read("src/main.tsx");
  const foundationCss = read("src/styles/foundation.css");
  const designSystemCss = read("src/styles/design-system.css");
  const compatibilityPolish = read("src/styles/letterpress-polish.css");
  const indexCss = read("src/index.css");
  const responsiveCss = read("src/styles/responsive.css");
  const safeAreaOwnership = read("src/styles/safe-area-ownership.css");
  const lightTheme = read("src/styles/theme-light.css");
  const themeContext = read("src/contexts/ThemeContext.tsx");
  const input = read("src/components/atoms/Input.tsx");
  const nativeSelect = read("src/components/atoms/NativeSelect.tsx");
  const textarea = read("src/components/atoms/Textarea.tsx");
  const radixSelect = read("src/components/ui/shadcn/Select.tsx");
  const designVisionSource = read("src/lib/wireline-design-vision.ts");
  const surfaceContract = read("src/lib/surface-contract.ts");

  mustInclude(
    "package.json",
    packageJson,
    /"design:check"\s*:\s*"node scripts\/check-wireline-clear-system\.mjs(?:\s*&&\s*node scripts\/[\w-]+\.mjs)*"/,
    "design:check must run the executable design contract",
  );
  mustExclude(
    "package.json",
    packageJson,
    /stripe:sync-secrets|sync-stripe-secrets-to-vercel/,
    "package scripts must not expose retired Stripe secret helpers",
  );

  mustInclude(
    "src/main.tsx",
    mainTsx,
    /import "\.\/index\.css"/,
    "application bootstrap must use one CSS entrypoint",
  );
  mustExclude(
    "src/main.tsx",
    mainTsx,
    /styles\/(?:foundation|responsive|ruthless-mobile-cleanup|agent-tabs-compact)\.css/,
    "application bootstrap must not duplicate design-system tiers",
  );
  mustInclude(
    "src/index.css",
    indexCss,
    /system-hardening\.css";[\s\S]*responsive\.css";[\s\S]*ruthless-mobile-cleanup\.css";[\s\S]*agent-tabs-compact\.css";/,
    "root CSS entrypoint must own the documented terminal responsive order",
  );
  mustInclude(
    "src/index.css",
    indexCss,
    /@media \(max-width: 767px\)[\s\S]*font-size:\s*max\(16px,\s*1rem\)/,
    "mobile editors must respect enlarged text while retaining the Safari zoom floor",
  );

  mustInclude(
    "src/styles/foundation.css",
    foundationCss,
    /color-scheme:\s*dark/,
    "the default WIRELINE appearance must declare dark color-scheme",
  );
  mustInclude(
    "src/styles/foundation.css",
    foundationCss,
    /overflow:\s*hidden/,
    "the outer application viewport must stay locked",
  );
  mustInclude(
    "src/styles/foundation.css",
    foundationCss,
    /--wl-text-tertiary:\s*var\(--wireline-color-text-tertiary\)/,
    "foundation must map tertiary text to the generated token",
  );
  mustInclude(
    "src/styles/theme-light.css",
    lightTheme,
    /:root\.light[\s\S]*color-scheme:\s*light/,
    "optional Light appearance must declare light color-scheme",
  );
  mustInclude(
    "src/styles/theme-light.css",
    lightTheme,
    /--wireline-color-text-tertiary:\s*#5c5f66/i,
    "Light tertiary text must retain the audited AA-safe value",
  );
  mustInclude(
    "src/contexts/ThemeContext.tsx",
    themeContext,
    /export type Theme = "light" \| "dark" \| "system"/,
    "theme architecture must preserve Dark, Light, and System appearances",
  );
  mustInclude(
    "src/lib/wireline-design-vision.ts",
    designVisionSource,
    /appearance:\s*\{\s*default:\s*"light"/,
    "the canonical design manifest must retain the light first-visit default",
  );
  mustInclude(
    "src/contexts/ThemeContext.tsx",
    themeContext,
    /import\s*\{\s*WIRELINE_DESIGN_VISION\s*\}\s*from\s*"\.\.\/lib\/wireline-design-vision"/,
    "theme runtime must use the canonical design manifest",
  );
  mustInclude(
    "src/contexts/ThemeContext.tsx",
    themeContext,
    /const DEFAULT_THEME = WIRELINE_DESIGN_VISION\.appearance\.default;/,
    "theme runtime must derive its first-visit default from the design manifest",
  );
  mustInclude(
    "src/contexts/ThemeContext.tsx",
    themeContext,
    /function readStoredTheme\(\): Theme \{[\s\S]*?return DEFAULT_THEME;\s*\}\s*function systemPrefersDark/,
    "first-visit appearance must remain light unless the customer explicitly chose otherwise",
  );
  mustInclude(
    "src/contexts/ThemeContext.tsx",
    themeContext,
    /classList\.toggle\("light"/,
    "resolved appearance must be reflected on the document root",
  );

  mustInclude(
    "src/styles/safe-area-ownership.css",
    safeAreaOwnership,
    /@media \(max-width: 1023px\)[\s\S]*\.wl-workspace-shell \.wl-workspace-content \{[^}]*padding-bottom:\s*calc\(\s*var\(--wl-workspace-dock-height, 5\.25rem\) \+ 1rem - env\(safe-area-inset-bottom, 0px\)\s*\);/,
    "workspace scrollers must clear the measured dock without repeating the device inset",
  );
  mustExclude(
    "src/styles/responsive.css",
    responsiveCss,
    /padding-bottom:\s*calc\(5\.25rem \+ env\(safe-area-inset-bottom\)\)/,
    "responsive.css must not restack dock clearance on the main column",
  );
  for (const [file, source] of [
    ["src/components/atoms/Input.tsx", input],
    ["src/components/atoms/NativeSelect.tsx", nativeSelect],
  ]) {
    mustInclude(file, source, /h-11/, "shared form control must be at least 44px tall");
    mustInclude(
      file,
      source,
      /text-base[\s\S]*md:text-sm/,
      "shared form control must use 16px mobile text",
    );
  }
  mustInclude(
    "src/components/atoms/Textarea.tsx",
    textarea,
    /text-base[\s\S]*md:text-sm/,
    "shared textarea must use 16px mobile text",
  );
  mustInclude(
    "src/components/ui/shadcn/Select.tsx",
    radixSelect,
    /min-h-11[\s\S]*text-base[\s\S]*md:text-sm/,
    "Radix select options must provide readable 44px mobile rows",
  );

  mustInclude(
    "src/lib/wireline-design-vision.ts",
    designVisionSource,
    /system:\s*"BotBound Design System"/,
    "canonical vision must name the single BotBound Design System",
  );
  mustInclude(
    "src/lib/surface-contract.ts",
    surfaceContract,
    /system:\s*"BotBound Design System"/,
    "authenticated surface contract must use the same single system name",
  );
  mustExclude(
    "src/lib/wireline-design-vision.ts",
    designVisionSource,
    /system:\s*"BotBound (?:Letterpress|Obsidian|Aurora)"/,
    "canonical vision must not declare a themed sub-system",
  );
  mustInclude(
    "src/styles/design-system.css",
    designSystemCss,
    /\.wl-composer-dock/,
    "design system must expose the shared composer dock",
  );
  mustInclude(
    "src/styles/design-system.css",
    designSystemCss,
    /\.wl-panel-elevated/,
    "design system must expose an elevated panel primitive",
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
    "index.css must retain the legacy polish compatibility layer until aliases are migrated",
  );
  mustInclude(
    "src/styles/letterpress-polish.css",
    compatibilityPolish,
    /\.wl-paper\s*\{[\s\S]*var\(--wireline-elevation-inset\)/,
    "legacy paper alias must remain behaviorally stable during semantic migration",
  );
  mustInclude(
    "src/styles/letterpress-polish.css",
    compatibilityPolish,
    /\.wl-focus-ring:focus-visible\s*\{[\s\S]*var\(--wireline-color-focus-default\)/,
    "shared focus ring must remain on the WIRELINE action token",
  );
  mustInclude(
    "src/styles/letterpress-polish.css",
    compatibilityPolish,
    /\.wl-metric-tile[\s\S]*var\(--wireline-font-family-display\)/,
    "shared metric tiles must retain display hierarchy",
  );
  mustInclude(
    "src/styles/letterpress-polish.css",
    compatibilityPolish,
    /\.wl-empty[\s\S]*var\(--wireline-color-surface-subtle\)/,
    "shared empty state must remain on semantic surfaces",
  );
  mustInclude(
    "src/styles/letterpress-polish.css",
    compatibilityPolish,
    /\.wl-eyebrow::before[\s\S]*var\(--wireline-color-action-secondary-default\)/,
    "wired eyebrows must use the platinum wire token",
  );
  mustInclude(
    "src/lib/wireline-design-vision.ts",
    designVisionSource,
    /"wl-panel"[\s\S]*"wl-panel-elevated"[\s\S]*"wl-metric-tile"[\s\S]*"wl-empty"/,
    "design vision manifest must list canonical shared surface and layout primitives",
  );
  mustInclude(
    "src/lib/wireline-design-vision.ts",
    designVisionSource,
    /retiredDesignNames:\s*\[[\s\S]*"Letterpress"[\s\S]*"Obsidian"[\s\S]*"Aurora"/,
    "design vision must explicitly retire competing design-system codenames",
  );

  for (const [path, reason] of [
    ["src/components/ExperimentalConsole.tsx", "experimental console should not be revived"],
    ["src/components/LegacySidebar.tsx", "legacy sidebar should not be revived"],
    ["src/components/marketing/HeroCallPreview.tsx", "retired call preview must stay deleted"],
    ["src/components/StudioAssistantWorkspace.tsx", "dead legacy Studio rail must stay deleted"],
    ["src/components/ui/NebulaPulse.tsx", "unused nebula primitive must stay deleted"],
    [
      "src/components/ui/AssistantConstellation.tsx",
      "unused constellation primitive must stay deleted",
    ],
    ["src/components/ui/ConstellationField.tsx", "unused constellation field must stay deleted"],
    [
      "src/components/migration/ZipLanding.tsx",
      "wrong-palette migration landing must stay deleted",
    ],
    ["src/styles/zip-platform-tokens.css", "wrong-palette token shim must stay deleted"],
    ["src/styles/zip-landing.css", "wrong-palette landing CSS must stay deleted"],
    ["src/styles/zip-landing-sections.css", "wrong-palette section CSS must stay deleted"],
    ["src/styles/source-migration.css", "temporary migration CSS must stay deleted"],
    ["src/lib/wireline-signal-design.ts", "retired signal bridge must stay deleted"],
    ["scripts/sync-stripe-secrets-to-vercel.mjs", "retired Stripe secret helper must stay deleted"],
    ["scripts/og-image.svg", "retired OG source must stay deleted"],
    ["scripts/check-active-surface-drift.mjs", "retired surface contract must stay deleted"],
    ["src/routes/director-routes.ts", "unmounted Director API must stay deleted"],
    ["src/components/director", "unmounted Director UI must stay deleted"],
    ["src/components/layout/DirectorLayout.tsx", "unmounted Director layout must stay deleted"],
  ]) {
    mustBeDeleted(path, reason);
  }
}
