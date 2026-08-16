/**
 * Typography quality contract for shipped weights, platform rendering,
 * readable compact text, and consistent connected widget surfaces.
 */
export function checkPublicTypography({ failures, read, mustInclude, mustExclude }) {
  const appCss = read("src/index.css");
  const surfaceIndex = read("src/styles/wireline-marketing-surfaces.css");
  const readableType = read("src/styles/marketing-readable-type.css");
  const documentFlow = read("src/styles/marketing-document-flow.css");
  const safeArea = read("src/styles/safe-area-ownership.css");
  const terminalType = read("src/styles/type-integrity.css");
  const widgetType = read("src/lib/wireline-mcp-widget-styles.ts");
  const fonts = read("public/fonts.css");
  const index = read("index.html");

  mustInclude(
    "src/styles/wireline-marketing-surfaces.css",
    surfaceIndex,
    /@import "\.\/marketing-readable-type\.css";/,
    "public typography quality layer must be loaded",
  );

  const readableImport = surfaceIndex.indexOf('@import "./marketing-readable-type.css";');
  const longformImport = surfaceIndex.indexOf('@import "./landing-longform.css";');
  if (readableImport < 0 || readableImport < longformImport) {
    failures.push(
      "src/styles/wireline-marketing-surfaces.css: readable type must load after landing composition styles",
    );
  }

  for (const [pattern, description] of [
    [/--wl-public-label-size:\s*0\.75rem;/, "public labels must retain a 12px floor"],
    [
      /--wl-public-caption-size:\s*0\.8125rem;/,
      "public captions must retain a 13px floor",
    ],
    [
      /--wl-public-control-size:\s*0\.875rem;/,
      "public controls must retain a 14px floor",
    ],
    [/\.landing-stage__lane strong/, "work-lane labels must use the readable floor"],
    [/\.landing-console__channels li/, "channel labels must use the readable floor"],
    [/\.landing-demo__microcopy/, "demo disclosure must use the readable floor"],
    [/\.landing-home__price-badge/, "pricing badges must use the readable floor"],
  ]) {
    mustInclude(
      "src/styles/marketing-readable-type.css",
      readableType,
      pattern,
      description,
    );
  }

  mustExclude(
    "src/styles/marketing-readable-type.css",
    readableType,
    /font-weight:\s*(?:560|650|680|720)\s*;/,
    "public type layer must request only shipped static weights",
  );

  mustInclude(
    "src/styles/safe-area-ownership.css",
    safeArea,
    /^@import "\.\/type-integrity\.css";/,
    "terminal type integrity must load through the final visual tier",
  );
  mustInclude(
    "src/index.css",
    appCss,
    /@import "\.\/styles\/safe-area-ownership\.css";\s*body\s*\{/,
    "safe-area ownership and terminal type integrity must remain the final imported tier",
  );

  for (const [pattern, description] of [
    [/font-synthesis:\s*none;/, "synthetic font weights must be disabled globally"],
    [/-webkit-font-smoothing:\s*auto;/, "font smoothing must follow the platform globally"],
    [/-moz-osx-font-smoothing:\s*auto;/, "macOS font smoothing must follow the platform"],
    [/text-rendering:\s*auto;/, "text rendering must follow the platform globally"],
    [
      /\.marketing-surface \.marketing-hero__title,[\s\S]*font-weight:\s*700;/,
      "public hero copy must use a shipped display weight",
    ],
    [/\.wl-chip,[\s\S]*\.marketing-hero-proof span[\s\S]*font-weight:\s*600;/,
      "shared mono labels must use the shipped semibold face"],
    [/\.marketing-proof-chip,[\s\S]*\.wl-workspace-header \.wl-overline[\s\S]*font-size:\s*0\.75rem;/,
      "compact public and workspace labels must retain a 12px floor"],
  ]) {
    mustInclude("src/styles/type-integrity.css", terminalType, pattern, description);
  }

  mustExclude(
    "src/styles/type-integrity.css",
    terminalType,
    /font-weight:\s*(?:560|650|680|720)\s*;/,
    "terminal type integrity must request only shipped static weights",
  );

  for (const [pattern, description] of [
    [/font-synthesis:\s*none;/, "connected widgets must disable synthetic weights"],
    [/\.eyebrow \{[\s\S]*font-size:\s*12px;[\s\S]*font-weight:\s*600;/,
      "connected widget eyebrows must use readable static type"],
    [/\.meta strong \{[\s\S]*font-size:\s*12px;[\s\S]*font-weight:\s*600;/,
      "connected widget metadata must use readable static type"],
    [/button, a\.button \{[\s\S]*font-weight:\s*600;/,
      "connected widget controls must use a shipped weight"],
  ]) {
    mustInclude("src/lib/wireline-mcp-widget-styles.ts", widgetType, pattern, description);
  }
  mustExclude(
    "src/lib/wireline-mcp-widget-styles.ts",
    widgetType,
    /font-weight:\s*(?:560|650|680|720)\s*;/,
    "connected widgets must not request synthetic weights",
  );
  mustExclude(
    "src/lib/wireline-mcp-widget-styles.ts",
    widgetType,
    /font-size:\s*11px;/,
    "connected widget labels must not fall below 12px",
  );

  for (const [pattern, description] of [
    [/font-synthesis:\s*none;/, "public document font synthesis must remain disabled"],
    [/-webkit-font-smoothing:\s*auto;/, "public document font smoothing must follow the platform"],
    [/text-rendering:\s*auto;/, "public document text rendering must follow the platform"],
  ]) {
    mustInclude(
      "src/styles/marketing-document-flow.css",
      documentFlow,
      pattern,
      description,
    );
  }

  for (const weight of [500, 600, 700]) {
    mustInclude(
      "public/fonts.css",
      fonts,
      new RegExp(`font-weight:\\s*${weight};`),
      `self-hosted fonts must include weight ${weight}`,
    );
  }

  for (const [path, family] of [
    ["/fonts/NGSwv5HMAFg6IuGlBNMjxLsH8ag.woff2", "Inter Tight display"],
    ["/fonts/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2", "Inter body"],
    ["/fonts/-F6qfjptAgt5VM-kVkqdyU8n3pQPwlBFgg.woff2", "IBM Plex Mono labels"],
  ]) {
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    mustInclude(
      "index.html",
      index,
      new RegExp(`<link[\\s\\S]*?rel="preload"[\\s\\S]*?as="font"[\\s\\S]*?href="${escapedPath}"`),
      `${family} must be preloaded above the fold`,
    );
  }
}
