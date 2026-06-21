import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const activeFiles = [
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

const failures = [];
const read = (file) => readFileSync(resolve(root, file), "utf8");
const report = (file, message) => failures.push(`${file}: ${message}`);

for (const file of activeFiles) {
  if (!existsSync(resolve(root, file))) {
    report(file, "required active-surface file is missing");
    continue;
  }

  const source = read(file);
  if (/api\.anthropic\.com|ANTHROPIC_API_KEY|@anthropic-ai\/sdk/.test(source)) {
    report(file, "must not reference Anthropic in the active product surface");
  }

  if (/(?:from|to|bg|text|border)-(?:violet|purple|indigo|fuchsia|pink)-|#7C3AED|#1d1d1f|#000000\b|\bbg-black\b|\bbackdrop-blur\b/i.test(source)) {
    report(file, "contains a retired or non-Professional-Heritage visual token");
  }
}

const foundation = read("src/styles/foundation.css");
for (const [pattern, message] of [
  [/--wl-page:\s*#f9f9f7/i, "must use warm root surface #f9f9f7"],
  [/--wl-accent:\s*#1a3c34/i, "must use Stitch forest accent #1a3c34"],
  [/--wl-surface-subtle:\s*#f4f4f2/i, "must use layered secondary surface #f4f4f2"],
  [/--wl-line:\s*#dadad8/i, "must use #dadad8 as the primary divider"],
  [/--radius-md:\s*0\.5rem/i, "must retain 8px standard geometry"],
  [/transform:\s*scale\(0\.98\)/i, "must retain tactile 0.98 press feedback"],
  [/font-feature-settings:\s*"cv05",\s*"cv08",\s*"ss01"/i, "must retain headline precision features"],
]) {
  if (!pattern.test(foundation)) report("src/styles/foundation.css", message);
}

const indexCss = read("src/index.css");
for (const [pattern, message] of [
  [/family=Source\+Serif\+4/i, "must load Source Serif 4 for editorial hierarchy"],
  [/family=Work\+Sans/i, "must load Work Sans for operational UI"],
  [/family=JetBrains\+Mono/i, "must load JetBrains Mono for metadata"],
  [/--wl-font-display:\s*"Source Serif 4"/i, "must map display typography to Source Serif 4"],
  [/--wl-font-sans:\s*"Work Sans"/i, "must map UI typography to Work Sans"],
  [/--wl-font-mono:\s*"JetBrains Mono"/i, "must map metadata typography to JetBrains Mono"],
]) {
  if (!pattern.test(indexCss)) report("src/index.css", message);
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
  if (!landing.includes(copy)) {
    report("src/components/marketing/PrecisionLanding.tsx", `must render meaningful product content: ${copy}`);
  }
}
if (/h-(?:2|3|4|7)\s+w-(?:\d|full|\d\/\d).*bg-\[color:var\(--wl-surface-variant\)\]/.test(landing)) {
  report("src/components/marketing/PrecisionLanding.tsx", "must not use gray placeholder bars as product imagery");
}
if (/BrowserCallWidget/.test(landing)) {
  report("src/components/marketing/PrecisionLanding.tsx", "must not make the landing explanation depend on an optional browser-call demo");
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
if (!runtime.includes("https://api.openai.com/v1/responses")) {
  report("src/lib/ai-client.ts", "must use OpenAI Responses as the managed runtime");
}
if (!runtime.includes("OpenAI request failed; trying Gemini fallback")) {
  report("src/lib/ai-client.ts", "must preserve the OpenAI-to-Gemini fallback order");
}

const voiceDefaults = read("src/lib/voice-model-defaults.ts");
if (!/VAPI_TENANT_DEFAULT_PROVIDER[^=]*=\s*"openai"/.test(voiceDefaults)) {
  report("src/lib/voice-model-defaults.ts", "must default managed voice agents to OpenAI");
}

if (failures.length) {
  console.error("Professional Heritage v2 contract check failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Professional Heritage v2 contract check passed");
}
