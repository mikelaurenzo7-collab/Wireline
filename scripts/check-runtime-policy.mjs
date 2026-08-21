import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  console.error(`Runtime policy check failed: ${message}`);
  process.exitCode = 1;
};
const packageJson = read("package.json");
const client = read("src/lib/ai-client.ts");
const models = read("src/lib/ai-models.ts");
const structuredModels = read("src/lib/structured-runtime-models.ts");
const registry = read("src/lib/runtime-integrations-registry.ts");
const registerApiRoutes = read("src/server/register-api-routes.ts");
const schema = read("src/db/schema.ts");
const adminSettings = read("src/components/AdminSettings.tsx");
const carrierPanel = read("src/components/admin/CarrierPanel.tsx");
// Prettier reflows long JSX copy across lines, so prose assertions against
// this file compare whitespace-collapsed source; the invariant is the copy,
// not its line wrapping.
const carrierPanelProse = carrierPanel.replace(/\s+/g, " ");
const prodEnvCheck = read("scripts/check-prod-env.mjs");
const legalPage = read("src/components/LegalPage.tsx");
const privacyPage = read("src/components/PrivacyPolicyPage.tsx");
const privacyPageProse = privacyPage.replace(/\s+/g, " ");
const integrationLogos = read("src/components/layout/IntegrationLogos.tsx");
const migrationJournal = read("drizzle/migrations/meta/_journal.json");
const runtimeCohesionMigration = read(
  "drizzle/migrations/0156_openai_runtime_cohesion.sql",
);
const migrationCorpus = readdirSync(resolve(root, "drizzle/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => read(`drizzle/migrations/${name}`))
  .join("\n");

if (packageJson.includes('"@anthropic-ai/sdk"'))
  fail("Anthropic SDK remains in the install manifest");
if (client.includes("@anthropic-ai/sdk") || client.includes("api.anthropic.com"))
  fail("managed runtime references Anthropic");

if (!client.includes("https://api.openai.com/v1/responses"))
  fail("managed runtime is not using the direct OpenAI Responses endpoint");
// Eligibility and ordering live in the policy module; the client owns
// transport only. The default chain is OpenAI -> AI Gateway -> xAI -> Gemini.
const policy = read("src/lib/reasoning-provider-policy.ts");
if (
  !/REASONING_PROVIDER_ORDER[\s\S]{0,200}"openai",\s*\n\s*"gateway",\s*\n\s*"xai",\s*\n\s*"gemini",/.test(
    policy,
  )
)
  fail("managed runtime provider chain is not OpenAI -> AI Gateway -> xAI -> Gemini");
if (!policy.includes('DEFAULT_REASONING_PROVIDER: ReasoningProviderId = "openai"'))
  fail("managed structured default provider is not OpenAI");
if (!policy.includes("WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK"))
  fail("xAI lane has lost its operator opt-out switch");
if (!client.includes("orderReasoningProviders(available, resolveReasoningPreference())"))
  fail("runtime client does not delegate provider ordering to the policy module");
if (!client.includes("isXAIStructuredLaneEnabled() && Boolean(process.env.XAI_API_KEY)"))
  fail("xAI lane eligibility is not gated on the configured credential and opt-out");
if (!client.includes("if (isAbortError(error, options?.signal)) throw error"))
  fail("aborted AI requests can still cascade into fallback providers");
if (!models.includes("export const OPENAI_STRUCTURED_PRIMARY_MODEL"))
  fail("ai-models does not export the OpenAI structured primary model");
if (!models.includes("export const STRUCTURED_PRIMARY_MODEL = OPENAI_STRUCTURED_PRIMARY_MODEL"))
  fail("managed structured default is not OpenAI GPT-5.6 Terra");
if (!models.includes('GROK_4_6: "grok-4.6"')) fail("Grok 4.6 model id is not registered");
if (!models.includes("XAI_MODELS.GROK_4_6")) fail("xAI structured continuity model is not Grok 4.6");
if (!models.includes('GROK_4_3: "grok-4.3"')) fail("Grok 4.3 Vapi live-call model id is not registered");
if (!models.includes('GPT_5_6_TERRA: "gpt-5.6-terra"'))
  fail("GPT-5.6 Terra model id is not registered");
if (!models.includes("OPENAI_MODELS.GPT_5_6_TERRA"))
  fail("OpenAI continuity model is not GPT-5.6 Terra");
if (!structuredModels.includes("STRUCTURED_PRIMARY_MODEL"))
  fail("structured-runtime-models does not route through the managed structured primary");

if (!models.includes('VAPI_TENANT_DEFAULT_PROVIDER = "openai"'))
  fail("rollback Vapi workspace default provider is not OpenAI");
if (!models.includes("VAPI_TENANT_DEFAULT_MODEL = OPENAI_MODELS.GPT_4O"))
  fail("rollback Vapi workspace default model is not GPT-4o");
if (!models.includes("VAPI_DEFAULT_FALLBACK_MODELS"))
  fail("managed voice does not carry fallback models");
if (!schema.includes('voiceLlmProvider: text("voice_llm_provider").default("openai")'))
  fail("Drizzle settings schema does not default the Vapi rollback pair to OpenAI");
if (!schema.includes('voiceLlmModel: text("voice_llm_model").default("gpt-4o")'))
  fail("Drizzle settings schema does not default the Vapi rollback pair to GPT-4o");
if (!schema.includes("Rollback-only Vapi language-model pair"))
  fail("Drizzle settings schema does not document voice_llm field semantics");
if (
  !adminSettings.includes("VAPI_TENANT_DEFAULT_PROVIDER") ||
  !adminSettings.includes("VAPI_TENANT_DEFAULT_MODEL")
)
  fail("Admin settings fallback does not use managed voice defaults");
if (adminSettings.includes('"anthropic"') || adminSettings.includes('"claude-sonnet-4-6"'))
  fail("Admin settings still contains legacy Claude voice defaults");
if (
  !carrierPanelProse.includes(
    "BotBound manages the phone conversation runtime, voice selection, intelligence routing, and continuity.",
  ) ||
  !carrierPanel.includes('["Phone runtime", "BotBound managed"]') ||
  !carrierPanel.includes('["Call intelligence", "Managed automatically"]') ||
  !carrierPanel.includes('["Continuity", "Automatic failover"]')
)
  fail("carrier runtime does not present the managed provider-neutral contract");
if (
  carrierPanel.includes("Gemini is the automatic fallback") ||
  carrierPanel.includes('["Primary intelligence", "OpenAI"]') ||
  carrierPanel.includes('["Automatic fallback", "Gemini"]')
)
  fail("carrier runtime leaks internal provider or fallback details");
if (carrierPanel.includes("Claude Sonnet") || carrierPanel.includes('v: "anthropic"'))
  fail("carrier cognitive routing still presents Claude as the managed default");

if (prodEnvCheck.includes("ANTHROPIC_API_KEY"))
  fail("production env check still asks for Anthropic");
if (!prodEnvCheck.includes("Managed GPT-5.6 Terra structured runtime and OpenAI Realtime browser sessions"))
  fail("production env check does not name the OpenAI managed/Realtime dependency");
if (
  !prodEnvCheck.includes("Native Twilio SIP Speech-to-Speech") ||
  !prodEnvCheck.includes("optional Grok 4.6 structured continuity")
)
  fail("production env check does not classify xAI as PSTN plus optional continuity");
if (!prodEnvCheck.includes('"ELEVENLABS_API_KEY"'))
  fail("production env check does not require managed studio speech");
if (
  legalPage.includes("Anthropic's Claude API") ||
  legalPage.includes("<strong>Anthropic</strong>")
)
  fail("public legal page still names Anthropic as active inference infrastructure");
if (!privacyPage.includes("<strong>OpenAI</strong>: Primary managed structured inference"))
  fail("public privacy page does not name OpenAI as the primary inference infrastructure");
if (!privacyPage.includes("Grok 4.6"))
  fail("public privacy page does not name Grok 4.6");
if (!privacyPageProse.includes("Studio/ChatGPT realtime browser voice"))
  fail("public privacy page does not name OpenAI as Studio and ChatGPT realtime infrastructure");
if (!privacyPage.includes("<strong>Google Gemini</strong>"))
  fail("public privacy page does not name Gemini fallback infrastructure");
if (!privacyPage.includes("<strong>xAI</strong>"))
  fail("public privacy page does not disclose xAI infrastructure");
if (
  privacyPage.includes("Anthropic's Claude API") ||
  privacyPage.includes("<strong>Anthropic</strong>")
)
  fail("public privacy page still names Anthropic as active inference infrastructure");
if (!/^\s*openai:\s*\{/m.test(integrationLogos))
  fail("integration logo catalog does not include OpenAI");
if (
  /^\s*anthropic:\s*\{/m.test(integrationLogos) ||
  integrationLogos.includes('aria-label="Anthropic"')
)
  fail("integration logo catalog still advertises Anthropic");
if (!/^\s*xai:\s*\{/m.test(integrationLogos)) fail("integration logo catalog does not include xAI");

if (!registerApiRoutes.includes("openaiRealtimeRouter"))
  fail("OpenAI Realtime router is not registered");
if (!registerApiRoutes.includes("grokVoiceRouter"))
  fail("native xAI PSTN router is not registered");

if (/openrouter/i.test(models)) fail("ai-models still references the retired OpenRouter path");
if (!/item\(\s*["']ai-gateway["']/.test(registry))
  fail("Vercel AI Gateway is not registered as the multi-model route");
if (!/item\(\s*["']deepgram-flux["']/.test(registry))
  fail("Deepgram Flux is not registered as production voice transcription");
if (!/item\(\s*["']openai-realtime["']/.test(registry))
  fail("OpenAI Realtime web/mobile mode is not registered");
if (!/item\(\s*["']elevenlabs["']/.test(registry))
  fail("ElevenLabs managed studio speech is not registered");
if (!registerApiRoutes.includes("voicesRouter"))
  fail("managed voice library routes are not registered");
if (!privacyPage.includes("<strong>ElevenLabs</strong>"))
  fail("public privacy page does not disclose managed voice processing");
if (!legalPage.includes("Voice Cloning and Synthetic Media"))
  fail("public terms do not govern custom synthetic voices");
if (!migrationCorpus.includes("voice_llm_provider SET DEFAULT 'xai'"))
  fail("tenant migration does not default managed voice to xAI");
if (!migrationCorpus.includes("voice_llm_model SET DEFAULT 'grok-4.3'"))
  fail("tenant migration does not default managed voice model to Grok 4.3");
if (!migrationCorpus.includes("voice_llm_provider SET DEFAULT 'openai'"))
  fail("tenant migration does not cover the historical OpenAI voice default");
if (!migrationCorpus.includes("voice_llm_model SET DEFAULT 'gpt-4o'"))
  fail("tenant migration does not cover the historical GPT-4o voice default");
if (!migrationCorpus.includes("claude-haiku-4-5"))
  fail("tenant migration does not cover the legacy Claude Haiku managed default");
if (!migrationJournal.includes("0151_xai_grok_46_runtime_defaults"))
  fail("xAI runtime-default migration is not journaled for production deploys");
if (!migrationJournal.includes("0154_xai_grok_46_persisted_defaults"))
  fail("Grok 4.6 persisted-default reconciliation is not journaled for production deploys");
if (!migrationJournal.includes("0156_openai_runtime_cohesion"))
  fail("OpenAI runtime-cohesion migration is not journaled for production deploys");
if (!runtimeCohesionMigration.includes("voice_llm_provider SET DEFAULT 'openai'"))
  fail("runtime-cohesion migration does not restore the Vapi OpenAI provider default");
if (!runtimeCohesionMigration.includes("voice_llm_model SET DEFAULT 'gpt-4o'"))
  fail("runtime-cohesion migration does not restore the Vapi GPT-4o model default");
if (runtimeCohesionMigration.includes("ALTER COLUMN voice_provider"))
  fail("runtime-cohesion migration changes the independent PSTN voice provider");

if (existsSync(resolve(root, "src/routes/admin-migrate")))
  fail("unmounted admin migration route tree remains");
if (existsSync(resolve(root, "src/routes/admin-operating-routes.ts")))
  fail("unmounted admin operating routes remain");
if (existsSync(resolve(root, "src/routes/admin-purge-accounts-routes.ts")))
  fail("unmounted broad account purge route remains");
const legacyFiles = [
  "claude-brain.ts",
  "claude-client.ts",
  "claude-models.ts",
  "claude-structured.ts",
  "claude-audit.ts",
  "claude-tools.ts",
  "claude-recipes.ts",
  "claude-response-helpers.ts",
  "claude-supervisor-tools.ts",
];
const remaining = legacyFiles.filter((file) => existsSync(resolve(root, "src/lib", file)));
if (remaining.length) fail(`legacy Claude modules remain: ${remaining.join(", ")}`);
if (existsSync(resolve(root, "src/routes/claude-routes.ts"))) fail("legacy Claude routes remain");
if (!process.exitCode) console.log("OpenAI-first runtime policy check passed");
