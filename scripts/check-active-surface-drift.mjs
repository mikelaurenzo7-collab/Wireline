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
  "src/components/PhoneAgentBlueprint.tsx",
  "src/components/marketing/PublicSiteHeader.tsx",
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
  "src/lib/stitch-design-system.ts",
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

  if (/from-(violet|purple|indigo|fuchsia|pink)-|to-(violet|purple|indigo|fuchsia|pink)-|bg-(violet|purple|indigo|fuchsia|pink)-|text-(violet|purple|indigo|fuchsia|pink)-|#7C3AED/i.test(source)) {
    report(file, "contains a retired colored design token");
  }
}

const foundation = read("src/styles/foundation.css");
if (!/--wl-accent:\s*#1a3c34/i.test(foundation)) {
  report("src/styles/foundation.css", "must use Stitch forest accent #1a3c34");
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
  console.error("Active-surface drift check failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Active-surface drift check passed");
}
