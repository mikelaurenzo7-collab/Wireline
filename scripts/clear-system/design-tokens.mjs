/**
 * Design tokens and palette — the Wireline dark system runs on the Aurora
 * violet action token everywhere tokens are generated, and the retired
 * purple/blue palette must not reappear on any active design surface.
 */
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
  const publicIcon = read("public/wireline-icon.svg");
  const favicon = read("public/favicon.svg");
  const ogImage = read("public/og-image.svg");
  const extensionIcon = read("apps/browser-extension/assets/icon.svg");
  const androidLauncherBg = read("android/app/src/main/res/drawable/ic_launcher_background.xml");

  mustInclude(
    "design-tokens/wireline.tokens.json",
    tokenSource,
    /"\$description"\s*:\s*"Wireline dark design tokens/,
    "token source must describe the Wireline dark system",
  );
  mustInclude(
    "design-tokens/wireline.tokens.json",
    tokenSource,
    /"default"\s*:\s*\{\s*"\$type"\s*:\s*"color",\s*"\$value"\s*:\s*"#A78BFA"\s*\}/,
    "token source primary action must be the Aurora electric violet #A78BFA",
  );
  mustInclude(
    "design-tokens/wireline.tokens.json",
    tokenSource,
    /"tertiary"/,
    "token source must define tertiary text role",
  );
  mustInclude(
    "src/styles/tokens.generated.css",
    webTokens,
    /--wireline-color-action-primary-default:\s*#A78BFA/,
    "web tokens must carry the Aurora violet token",
  );
  mustInclude(
    "apps/browser-extension/panel/tokens.generated.css",
    browserTokens,
    /--wireline-color-action-primary-default:\s*#A78BFA/,
    "browser tokens must carry the Aurora violet token",
  );
  mustInclude(
    "src/constants/generated-design-tokens.ts",
    tokenConstants,
    /"color\.action\.primary\.default": "#A78BFA"/,
    "TS tokens must carry the Aurora violet token",
  );
  mustInclude(
    "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
    androidTokens,
    /colorActionPrimaryDefault = Color\(0xFFA78BFA\)/,
    "Android tokens must carry the Aurora violet token",
  );
  mustInclude(
    "ios/Wireline/Theme/WirelineDesignTokens.generated.swift",
    iosTokens,
    /colorActionPrimaryDefault = Color\(hex: 0xA78BFA\)/,
    "iOS tokens must carry the Aurora violet token",
  );
  mustInclude(
    "ios/WirelineShared/WirelineWidgetSnapshot.swift",
    iosWidget,
    /public static let accent = "A78BFA"/,
    "iOS widget snapshot must carry the Aurora violet token",
  );

  mustInclude(
    "public/static-legal.css",
    legalCss,
    /--wireline-color-action-primary-default: #A78BFA/,
    "static legal pages must use the Wireline dark tokens",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /"theme_color": "#0A0A0E"/,
    "manifest must use the dark theme color",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /"background_color": "#0A0A0E"/,
    "manifest must use the dark canvas background",
  );
  mustInclude(
    "public/wireline-icon.svg",
    publicIcon,
    /fill="#6D28D9"/,
    "public app icon must use the Aurora violet brand mark",
  );
  mustInclude(
    "public/favicon.svg",
    favicon,
    /fill="#6D28D9"/,
    "favicon must use the Aurora violet brand mark",
  );
  mustInclude("public/og-image.svg", ogImage, /fill="#0A0A0E"/, "OG image must use the dark canvas");
  mustInclude(
    "public/og-image.svg",
    ogImage,
    /C7CCD6/,
    "OG image must carry the silver wire signature",
  );
  mustInclude(
    "apps/browser-extension/assets/icon.svg",
    extensionIcon,
    /fill="#6D28D9"/,
    "browser extension icon must use the Aurora violet brand mark",
  );
  mustInclude(
    "android/app/src/main/res/drawable/ic_launcher_background.xml",
    androidLauncherBg,
    /android:fillColor="#6D28D9"/,
    "Android launcher background must use the Aurora violet brand mark",
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
    "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
    "android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt",
    "ios/Wireline/Theme/WirelineDesignTokens.generated.swift",
    "ios/WirelineShared/WirelineWidgetSnapshot.swift",
    "ios/Wireline/Views/RootTabView.swift",
    "ios/Wireline/Views/WorkspaceView.swift",
    "ios/Wireline/Views/AssistantLibraryView.swift",
    "ios/Wireline/Views/AssistantSetupViews.swift",
    "ios/Wireline/CarPlay/CarPlaySceneDelegate.swift",
    "src/components/MobileBrowserUtilities.tsx",
    "src/pages/SettingsPage.tsx",
    "src/pages/Developers.tsx",
    "src/components/KnowledgeBaseClaude.tsx",
    "src/components/AssistantComposer.tsx",
    "src/components/marketing/BrowserCallWidget.tsx",
    "src/components/marketing/TrustSignals.tsx",
    "src/data/wireline-knowledge.ts",
    "src/lib/chatgpt-mcp.ts",
    "src/lib/chatgpt-mcp-account.ts",
    "public/static-legal.css",
    "public/site.webmanifest",
    "public/wireline-icon.svg",
    "public/favicon.svg",
    "public/og-image.svg",
    "apps/browser-extension/assets/icon.svg",
    "android/app/src/main/res/drawable/ic_launcher_background.xml",
    "src/styles/letterpress-polish.css",
  ];
  for (const file of paletteSweep) {
    mustExclude(
      file,
      read(file),
      OLD_PALETTE,
      "old purple/blue palette must not appear in active design surfaces",
    );
  }

  mustExclude(
    "src/styles/studio-operations.css",
    read("src/styles/studio-operations.css"),
    /#0a0c12|#0d1017|#12151d|#191e2a|#f7f8fc|#91a8ff/i,
    "Studio must not define a separate dark theme",
  );
}
