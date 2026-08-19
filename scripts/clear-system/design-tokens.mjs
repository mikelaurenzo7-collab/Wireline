/**
 * WIRELINE Design System tokens and brand geometry. The semantic base token
 * source carries the dark appearance, while Light overrides it at runtime for
 * first visits. Electric violet is action, platinum is wire, and the folded W
 * keeps its own dark-field asset treatment. Retired palette values must not
 * reappear on active design surfaces.
 */
const OLD_PALETTE = /#5D3FD3|#451EBB|#F8F9FF|#EFF4FF|#E5EEFF|#0B1C30|rgba\(93,\s*63,\s*211/i;
const FOLDED_W_PATH = /M42[ ,]106H68L100[ ,]14H74Z/;

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
  const androidLauncherForeground = read(
    "android/app/src/main/res/drawable/ic_launcher_foreground.xml",
  );

  mustInclude(
    "design-tokens/wireline.tokens.json",
    tokenSource,
    /"\$description"\s*:\s*"Wireline dark design tokens/,
    "token source must identify the semantic dark appearance it generates",
  );
  mustInclude(
    "design-tokens/wireline.tokens.json",
    tokenSource,
    /"default"\s*:\s*\{\s*"\$type"\s*:\s*"color",\s*"\$value"\s*:\s*"#A78BFA"\s*\}/,
    "token source primary action must be electric violet #A78BFA",
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
    "web tokens must carry the WIRELINE violet action token",
  );
  mustInclude(
    "apps/browser-extension/panel/tokens.generated.css",
    browserTokens,
    /--wireline-color-action-primary-default:\s*#A78BFA/,
    "browser tokens must carry the WIRELINE violet action token",
  );
  mustInclude(
    "src/constants/generated-design-tokens.ts",
    tokenConstants,
    /"color\.action\.primary\.default": "#A78BFA"/,
    "TS tokens must carry the WIRELINE violet action token",
  );
  mustInclude(
    "android/app/src/main/java/com/wireline/app/ui/theme/WirelineDesignTokens.kt",
    androidTokens,
    /colorActionPrimaryDefault = Color\(0xFFA78BFA\)/,
    "Android tokens must carry the WIRELINE violet action token",
  );
  mustInclude(
    "ios/Wireline/Theme/WirelineDesignTokens.generated.swift",
    iosTokens,
    /colorActionPrimaryDefault = Color\(hex: 0xA78BFA\)/,
    "iOS tokens must carry the WIRELINE violet action token",
  );
  mustInclude(
    "ios/WirelineShared/WirelineWidgetSnapshot.swift",
    iosWidget,
    /public static let accent = "A78BFA"/,
    "iOS widget snapshot must carry the WIRELINE violet action token",
  );

  mustInclude(
    "public/static-legal.css",
    legalCss,
    /--wireline-color-action-primary-default: #A78BFA/,
    "static legal pages must use the WIRELINE semantic tokens",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /"theme_color": "#F6F5FA"/,
    "manifest must use the Light first-visit theme color",
  );
  mustInclude(
    "public/site.webmanifest",
    manifest,
    /"background_color": "#F6F5FA"/,
    "manifest must use the Light first-visit canvas",
  );
  mustInclude(
    "public/wireline-icon.svg",
    publicIcon,
    FOLDED_W_PATH,
    "public app icon must use the canonical folded W geometry",
  );
  mustInclude(
    "public/wireline-icon.svg",
    publicIcon,
    /#8B5CF6/,
    "public app icon must carry the violet ribbon",
  );
  mustInclude(
    "public/wireline-icon.svg",
    publicIcon,
    /#E4E6ED/,
    "public app icon must carry the platinum ribbon",
  );
  mustInclude(
    "public/favicon.svg",
    favicon,
    FOLDED_W_PATH,
    "favicon must use the canonical folded W geometry",
  );
  mustInclude(
    "public/og-image.svg",
    ogImage,
    /fill="#0A0A0E"/,
    "OG image may use the dark brand field for contrast",
  );
  mustInclude(
    "public/og-image.svg",
    ogImage,
    /C7CCD6/,
    "OG image must carry the platinum wire signature",
  );
  mustInclude(
    "apps/browser-extension/assets/icon.svg",
    extensionIcon,
    FOLDED_W_PATH,
    "browser extension icon must use the canonical folded W geometry",
  );
  mustInclude(
    "apps/browser-extension/assets/icon.svg",
    extensionIcon,
    /#0A0A0E|#0D0D12/,
    "browser extension icon must preserve the dark brand field",
  );
  mustInclude(
    "android/app/src/main/res/drawable/ic_launcher_background.xml",
    androidLauncherBg,
    /android:fillColor="#0A0A0E"/,
    "Android launcher background must preserve the dark brand field",
  );
  mustInclude(
    "android/app/src/main/res/drawable/ic_launcher_foreground.xml",
    androidLauncherForeground,
    FOLDED_W_PATH,
    "Android launcher foreground must use the canonical folded W geometry",
  );
  mustInclude(
    "android/app/src/main/res/drawable/ic_launcher_foreground.xml",
    androidLauncherForeground,
    /android:fillColor="#E4E6ED"/,
    "Android launcher foreground must carry the platinum ribbon",
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
    "src/components/marketing/BrowserCallWidget.tsx",
    "src/components/marketing/TrustSignals.tsx",
    "src/data/wireline-knowledge.ts",
    "src/lib/chatgpt-mcp-account.ts",
    "public/static-legal.css",
    "public/site.webmanifest",
    "public/wireline-icon.svg",
    "public/favicon.svg",
    "public/og-image.svg",
    "apps/browser-extension/assets/icon.svg",
    "android/app/src/main/res/drawable/ic_launcher_background.xml",
    "android/app/src/main/res/drawable/ic_launcher_foreground.xml",
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
