import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const activeFiles = [
  "index.html",
  "src/App.tsx",
  "src/pages/LandingPage.tsx",
  "src/pages/Features.tsx",
  "src/pages/Pricing.tsx",
  "src/pages/Showcase.tsx",
  "src/pages/Compare.tsx",
  "src/pages/About.tsx",
  "src/pages/SolutionsPage.tsx",
  "src/pages/AgentStudioHome.tsx",
  "src/components/PhoneAgentBlueprint.tsx",
  "src/components/marketing/PrecisionLanding.tsx",
  "src/components/marketing/PrecisionPublicHeader.tsx",
  "src/components/marketing/BrowserCallWidget.tsx",
  "src/components/marketing/MarketingFooter.tsx",
  "src/components/WorkspaceShell.tsx",
  "src/pages/AgentsPage.tsx",
  "src/pages/SettingsPage.tsx",
  "src/components/StudioWorkspaceV2.tsx",
  "src/components/AuthPortal.tsx",
  "src/index.css",
  "src/styles/foundation.css",
  "src/styles/stitch-patterns.css",
  "src/styles/design-system.css",
  "src/lib/ai-client.ts",
  "src/lib/voice-model-defaults.ts",
];

const nativeFiles = [
  "ios/Wireline/Theme/WirelineTheme.swift",
  "ios/Wireline/Views/RootTabView.swift",
  "ios/WirelineWidgets/WidgetColors.swift",
  "android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt",
  "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
  "android/app/src/main/java/com/wireline/app/ui/components/BrandComponents.kt",
  "android/app/src/main/java/com/wireline/app/widget/WidgetPalette.kt",
];

const failures = [];
const pathFor = (file) => resolve(root, file);
const read = (file) => readFileSync(pathFor(file), "utf8");
const report = (file, message) => failures.push(`${file}: ${message}`);
const requireFile = (file) => {
  if (!existsSync(pathFor(file))) {
    report(file, "required Professional Heritage surface is missing");
    return false;
  }
  return true;
};
const requirePatterns = (file, source, checks) => {
  for (const [pattern, message] of checks) {
    if (!pattern.test(source)) report(file, message);
  }
};

for (const file of activeFiles) {
  if (!requireFile(file)) continue;
  const source = read(file);
  if (/api\.anthropic\.com|ANTHROPIC_API_KEY|@anthropic-ai\/sdk/.test(source)) {
    report(file, "must not reference Anthropic in the active product surface");
  }
  if (/(?:from|to|bg|text|border)-(?:violet|purple|indigo|fuchsia|pink)-|#7C3AED|#1d1d1f|#000000\b|\bbg-black\b|\bbackdrop-blur\b/i.test(source)) {
    report(file, "contains a retired or non-Professional-Heritage visual token");
  }
}

const foundation = read("src/styles/foundation.css");
requirePatterns("src/styles/foundation.css", foundation, [
  [/--wl-page:\s*#f9f9f7/i, "must use warm root surface #f9f9f7"],
  [/--wl-accent:\s*#1a3c34/i, "must use Stitch forest accent #1a3c34"],
  [/--wl-on-surface:\s*#1a3c34/i, "must use #1a3c34 as primary readable text"],
  [/--wl-surface-subtle:\s*#f4f4f2/i, "must use layered secondary surface #f4f4f2"],
  [/--wl-line:\s*#dadad8/i, "must use #dadad8 as the primary divider"],
  [/--radius-md:\s*0\.5rem/i, "must retain 8px standard geometry"],
  [/transform:\s*scale\(0\.98\)/i, "must retain tactile 0.98 press feedback"],
  [/font-feature-settings:\s*"cv05",\s*"cv08",\s*"ss01"/i, "must retain headline precision features"],
  [/font-family:\s*var\(--wl-font-display,\s*Inter/i, "must use Inter headline fallbacks"],
  [/focus-visible[\s\S]*outline:\s*2px solid var\(--wl-accent\)/i, "must retain a high-contrast 2px keyboard focus indicator"],
]);

const indexCss = read("src/index.css");
requirePatterns("src/index.css", indexCss, [
  [/family=Inter/i, "must load Inter for Professional Heritage hierarchy"],
  [/family=JetBrains\+Mono/i, "must load JetBrains Mono for functional metadata"],
  [/--wl-font-display:\s*"Inter"/i, "must map display typography to Inter"],
  [/--wl-font-sans:\s*"Inter"/i, "must map UI typography to Inter"],
  [/--wl-font-mono:\s*"JetBrains Mono"/i, "must map metadata typography to JetBrains Mono"],
]);
if (/Source Serif 4|Work Sans/i.test(indexCss)) {
  report("src/index.css", "must not retain superseded display or UI font stacks");
}

const documentHead = read("index.html");
requirePatterns("index.html", documentHead, [
  [/family=Inter/i, "must preload Inter in the document head"],
  [/family=JetBrains\+Mono/i, "must preload JetBrains Mono in the document head"],
  [/theme-color" content="#F9F9F7"/i, "must preserve the warm mobile browser surface"],
]);
if (/Source Serif 4|Work Sans/i.test(documentHead)) {
  report("index.html", "must not preload superseded display or UI fonts");
}

const shell = read("src/components/WorkspaceShell.tsx");
if (!/w-\[212px\]/.test(shell) || !/lg:grid-cols-\[212px_minmax\(0,1fr\)\]/.test(shell)) {
  report("src/components/WorkspaceShell.tsx", "must retain the fixed 212px Professional Heritage workspace shell");
}
if (!/WirelineMark/.test(shell)) {
  report("src/components/WorkspaceShell.tsx", "must use the shared Wireline mark in the workspace identity");
}

const landing = read("src/components/marketing/PrecisionLanding.tsx");
for (const copy of [
  "Never wait on hold again.",
  "A real call, handled for you",
  "Your request",
  "What you receive",
  "Move my cleaning to next week.",
  "No follow-up needed",
]) {
  if (!landing.includes(copy)) report("src/components/marketing/PrecisionLanding.tsx", `must render meaningful product content: ${copy}`);
}
if (/h-(?:2|3|4|7)\s+w-(?:\d|full|\d\/\d).*bg-\[color:var\(--wl-surface-variant\)\]/.test(landing)) {
  report("src/components/marketing/PrecisionLanding.tsx", "must not use gray placeholder bars as product imagery");
}
if (/BrowserCallWidget/.test(landing)) {
  report("src/components/marketing/PrecisionLanding.tsx", "must not make the landing explanation depend on an optional browser-call demo");
}

const features = read("src/pages/Features.tsx");
if (/radial-gradient|Start free/i.test(features)) {
  report("src/pages/Features.tsx", "must use flat Professional Heritage public surfaces and current-plan CTAs");
}

const browserDemo = read("src/components/marketing/BrowserCallWidget.tsx");
if (!/active:scale-\[0\.98\]/.test(browserDemo) || /#1d1d1f|rose-/i.test(browserDemo)) {
  report("src/components/marketing/BrowserCallWidget.tsx", "must use semantic Professional Heritage colors and tactile press feedback");
}

const createAssistant = read("src/pages/AgentStudioHome.tsx");
if (!/role="dialog"/.test(createAssistant) || /bg-black|backdrop-blur/i.test(createAssistant)) {
  report("src/pages/AgentStudioHome.tsx", "must retain the accessible flat Professional Heritage create dialog");
}

const runtime = read("src/lib/ai-client.ts");
if (!runtime.includes("https://api.openai.com/v1/responses")) report("src/lib/ai-client.ts", "must use OpenAI Responses as the managed runtime");
if (!runtime.includes("OpenAI request failed; trying Gemini fallback")) report("src/lib/ai-client.ts", "must preserve the OpenAI-to-Gemini fallback order");

const voiceDefaults = read("src/lib/voice-model-defaults.ts");
if (!/VAPI_TENANT_DEFAULT_PROVIDER[^=]*=\s*"openai"/.test(voiceDefaults)) {
  report("src/lib/voice-model-defaults.ts", "must default managed voice agents to OpenAI");
}

for (const file of nativeFiles) requireFile(file);

const iosTheme = read("ios/Wireline/Theme/WirelineTheme.swift");
requirePatterns("ios/Wireline/Theme/WirelineTheme.swift", iosTheme, [
  [/canvas\s*=\s*Color\(hex:\s*0xF9F9F7\)/, "must use #F9F9F7 native root canvas"],
  [/accent\s*=\s*Color\(hex:\s*0x1A3C34\)/, "must use #1A3C34 native action color"],
  [/border\s*=\s*Color\(hex:\s*0xDADAD8\)/, "must use #DADAD8 native borders"],
  [/radiusMd:\s*CGFloat\s*=\s*8/, "must retain 8pt native card geometry"],
  [/scaleEffect\(configuration\.isPressed\s*\?\s*0\.98\s*:\s*1\)/, "must retain 0.98 tactile press feedback"],
  [/duration:\s*0\.20/, "must retain 200ms tactile press timing"],
]);
if (/LinearGradient|RadialGradient|AngularGradient/.test(iosTheme)) report("ios/Wireline/Theme/WirelineTheme.swift", "must not restore decorative gradients to the native foundation");

const iosTabs = read("ios/Wireline/Views/RootTabView.swift");
for (const tab of ["Studio", "Assistants", "Knowledge", "Actions", "Recaps"]) {
  if (!iosTabs.includes(`Label("${tab}"`)) report("ios/Wireline/Views/RootTabView.swift", `must retain ${tab} in the five-job native shell`);
}
if (/Live Ops|Fleet/.test(iosTabs)) report("ios/Wireline/Views/RootTabView.swift", "must not restore Live Ops or Fleet to native primary navigation");

const iosWidget = read("ios/WirelineWidgets/WidgetColors.swift");
if (/LinearGradient|RadialGradient|AngularGradient/.test(iosWidget)) report("ios/WirelineWidgets/WidgetColors.swift", "must use flat Professional Heritage widget surfaces");

const androidTheme = read("android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt");
requirePatterns("android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt", androidTheme, [
  [/Canvas\s*=\s*Color\(0xFFF9F9F7\)/, "must use #F9F9F7 Android root canvas"],
  [/Accent\s*=\s*Color\(0xFF1A3C34\)/, "must use #1A3C34 Android action color"],
  [/Border\s*=\s*Color\(0xFFDADAD8\)/, "must use #DADAD8 Android borders"],
  [/RadiusMd\s*=\s*8\.dp/, "must retain 8dp Android card geometry"],
  [/surfaceVariant\s*=\s*Brand\.Panel2/, "must keep layered off-white input surfaces"],
  [/headlineLarge\s*=\s*Typography\(\)\.headlineLarge\.copy\([\s\S]*?letterSpacing\s*=\s*\(-0\.48\)\.sp/, "must retain Professional Heritage headline tracking"],
]);
if (/Brush\.(linearGradient|radialGradient)|Color\(0xFF(?:7C3AED|8B5CF6|A855F7)/i.test(androidTheme)) {
  report("android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt", "must not restore gradients or purple tokens to Android theme");
}

const androidComponents = read("android/app/src/main/java/com/wireline/app/ui/components/BrandComponents.kt");
requirePatterns("android/app/src/main/java/com/wireline/app/ui/components/BrandComponents.kt", androidComponents, [
  [/targetValue\s*=\s*if\s*\(pressed\)\s*0\.98f\s*else\s*1f/, "must retain 0.98 Compose tactile press feedback"],
  [/durationMillis\s*=\s*200/, "must retain 200ms Compose tactile press timing"],
  [/RoundedCornerShape\(Brand\.RadiusMd\)/, "must use shared 8dp card geometry"],
]);

const androidShell = read("android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt");
for (const tab of ["Studio", "Assistants", "Knowledge", "Actions", "Recaps"]) {
  if (!androidShell.includes(`Text("${tab}")`)) report("android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt", `must retain ${tab} in the five-job Compose shell`);
}
if (!/NavigationBar\(/.test(androidShell)) report("android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt", "must use Material3 NavigationBar for the native shell");

const androidWidget = read("android/app/src/main/java/com/wireline/app/widget/WidgetPalette.kt");
requirePatterns("android/app/src/main/java/com/wireline/app/widget/WidgetPalette.kt", androidWidget, [
  [/Canvas\s*=\s*Color\(0xFFF9F9F7\)/, "must use #F9F9F7 widget canvas"],
  [/Accent\s*=\s*Color\(0xFF1A3C34\)/, "must use #1A3C34 widget action color"],
]);

if (failures.length) {
  console.error("Professional Heritage v2 contract check failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Professional Heritage v2 contract check passed");
}
