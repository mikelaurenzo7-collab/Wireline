/** Design-token and BotBound brand-asset contract. Technical token names remain wireline for compatibility. */
const OLD_PALETTE = /#5D3FD3|#451EBB|#F8F9FF|#EFF4FF|#E5EEFF|#0B1C30|rgba\(93,\s*63,\s*211/i;

export function checkDesignTokens({ read, mustInclude, mustExclude }) {
  const tokenSource = read("design-tokens/wireline.tokens.json");
  const webTokens = read("src/styles/tokens.generated.css");
  const browserTokens = read("apps/browser-extension/panel/tokens.generated.css");
  const tokenConstants = read("src/constants/generated-design-tokens.ts");
  const androidTokens = read(
    "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
  );
  const iosTokens = read("ios/Wireline/Theme/WirelineDesignTokens.generated.swift");
  const iosWidget = read("ios/WirelineShared/WirelineWidgetSnapshot.swift");
  const legalCss = read("public/static-legal.css");
  const manifest = read("public/site.webmanifest");
  const publicIcon = read("public/botbound-icon.svg");
  const legacyIcon = read("public/wireline-icon.svg");
  const favicon = read("public/favicon.svg");
  const ogImage = read("public/og-image.svg");
  const extensionIcon = read("apps/browser-extension/assets/icon.svg");
  const androidLauncherBg = read("android/app/src/main/res/drawable/ic_launcher_background.xml");

  mustInclude(
    "design-tokens/wireline.tokens.json",
    tokenSource,
    /"default"\s*:\s*\{\s*"\$type"\s*:\s*"color",\s*"\$value"\s*:\s*"#A78BFA"\s*\}/,
    "primary action must remain Aurora violet",
  );
  mustInclude(
    "design-tokens/wireline.tokens.json",
    tokenSource,
    /"tertiary"/,
    "token source must define tertiary text",
  );
  mustInclude(
    "src/styles/tokens.generated.css",
    webTokens,
    /--wireline-color-action-primary-default:\s*#A78BFA/,
    "web tokens must carry Aurora violet",
  );
  mustInclude(
    "apps/browser-extension/panel/tokens.generated.css",
    browserTokens,
    /--wireline-color-action-primary-default:\s*#A78BFA/,
    "browser tokens must carry Aurora violet",
  );
  mustInclude(
    "src/constants/generated-design-tokens.ts",
    tokenConstants,
    /"color\.action\.primary\.default": "#A78BFA"/,
    "TS tokens must carry Aurora violet",
  );
  mustInclude(
    "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
    androidTokens,
    /colorActionPrimaryDefault = Color\(0xFFA78BFA\)/,
    "Android tokens must carry Aurora violet",
  );
  mustInclude(
    "ios/Wireline/Theme/WirelineDesignTokens.generated.swift",
    iosTokens,
    /colorActionPrimaryDefault = Color\(hex: 0xA78BFA\)/,
    "iOS tokens must carry Aurora violet",
  );
  mustInclude(
    "ios/WirelineShared/WirelineWidgetSnapshot.swift",
    iosWidget,
    /public static let accent = "A78BFA"/,
    "iOS widget must carry Aurora violet",
  );
  mustInclude(
    "public/static-legal.css",
    legalCss,
    /--wireline-color-action-primary-default: #A78BFA/,
    "static legal pages must use canonical tokens",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /"theme_color": "#F7F7F3"/,
    "manifest must match the default light canvas",
  );

  for (const [file, source] of [
    ["public/botbound-icon.svg", publicIcon],
    ["public/favicon.svg", favicon],
    ["apps/browser-extension/assets/icon.svg", extensionIcon],
  ]) {
    mustInclude(file, source, /BotBound/, "brand icon must identify BotBound");
    mustInclude(
      file,
      source,
      /#8B5CF6|#A78BFA|#C4B5FD/,
      "brand icon must carry the violet phone signal",
    );
    mustInclude(file, source, /phone|Phone/, "brand icon must preserve the phone-Bot concept");
  }
  mustInclude(
    "public/wireline-icon.svg",
    legacyIcon,
    /Compatibility asset path rendering the BotBound phone Bot mark/,
    "legacy icon path must alias BotBound",
  );
  mustInclude("public/og-image.svg", ogImage, /BotBound/, "OG image must use BotBound");
  mustInclude(
    "public/og-image.svg",
    ogImage,
    /<rect[^>]+fill="#f7f7f3"/,
    "OG image must use the approved warm light canvas",
  );
  mustInclude(
    "android/app/src/main/res/drawable/ic_launcher_background.xml",
    androidLauncherBg,
    /android:fillColor="#0A0A0E"/,
    "Android launcher background must remain obsidian",
  );

  const paletteSweep = [
    "design-tokens/wireline.tokens.json",
    "src/styles/tokens.generated.css",
    "apps/browser-extension/panel/tokens.generated.css",
    "apps/browser-extension/manifest.base.json",
    "apps/browser-extension/background/service-worker.js",
    "apps/browser-extension/panel/index.html",
    "apps/browser-extension/panel/panel.js",
    "apps/browser-extension/panel/command.css",
    "src/constants/generated-design-tokens.ts",
    "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
    "ios/Wireline/Theme/WirelineDesignTokens.generated.swift",
    "ios/WirelineShared/WirelineWidgetSnapshot.swift",
    "src/components/MobileBrowserUtilities.tsx",
    "src/pages/SettingsPage.tsx",
    "src/pages/Developers.tsx",
    "src/components/KnowledgeBaseClaude.tsx",
    "src/components/marketing/TrustSignals.tsx",
    "src/data/wireline-knowledge.ts",
    "src/lib/chatgpt-mcp-account.ts",
    "public/static-legal.css",
    "public/site.webmanifest",
    "public/botbound-icon.svg",
    "public/favicon.svg",
    "public/og-image.svg",
    "apps/browser-extension/assets/icon.svg",
    "src/styles/letterpress-polish.css",
  ];
  for (const file of paletteSweep)
    mustExclude(file, read(file), OLD_PALETTE, "retired purple/blue palette must not reappear");
  mustExclude(
    "src/styles/studio-operations.css",
    read("src/styles/studio-operations.css"),
    /#0a0c12|#0d1017|#12151d|#191e2a|#f7f8fc|#91a8ff/i,
    "Studio must not define a separate dark theme",
  );
}
