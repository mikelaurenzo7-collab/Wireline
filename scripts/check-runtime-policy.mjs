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
const prodEnvCheck = read("scripts/check-prod-env.mjs");
const legalPage = read("src/components/LegalPage.tsx");
const privacyPage = read("src/components/PrivacyPolicyPage.tsx");
const integrationLogos = read("src/components/layout/IntegrationLogos.tsx");
const androidReadme = read("android/README.md");
const liveVoiceDoc = read("docs/GROK_LIVE_VOICE.md");
const migrationJournal = read("drizzle/migrations/meta/_journal.json");
const migrationCorpus = readdirSync(resolve(root, "drizzle/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => read(`drizzle/migrations/${name}`))
  .join("\n");

// Legacy Claude removal stays enforced.
if (packageJson.includes('"@anthropic-ai/sdk"')) fail("Anthropic SDK remains in the install manifest");
if (client.includes("@anthropic-ai/sdk") || client.includes("api.anthropic.com"))
  fail("managed runtime references Anthropic");

// Managed structured runtime is Grok-first (direct xAI) with ordered fallbacks.
if (!client.includes('const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"'))
  fail("managed runtime is not using the direct xAI Responses endpoint");
if (!client.includes("https://api.openai.com/v1/responses"))
  fail("OpenAI fallback Responses endpoint is missing");
if (!client.includes("xAI request failed; trying direct OpenAI fallback"))
  fail("xAI-to-OpenAI fallback message is missing");
if (!client.includes("OpenAI request failed; trying Gemini fallback"))
  fail("OpenAI-to-Gemini fallback order is missing");
const xaiPosition = client.indexOf('providers.push({ name: "xAI"');
const openAIPosition = client.indexOf('providers.push({ name: "OpenAI"');
const geminiPosition = client.indexOf('providers.push({ name: "Gemini"');
const gatewayPosition = client.indexOf('providers.push({ name: "AI Gateway"');
if (
  xaiPosition < 0 ||
  openAIPosition < 0 ||
  geminiPosition < 0 ||
  gatewayPosition < 0 ||
  !(
    xaiPosition < openAIPosition &&
    openAIPosition < geminiPosition &&
    geminiPosition < gatewayPosition
  )
)
  fail("managed runtime provider chain is not xAI -> OpenAI -> Gemini -> AI Gateway");
if (!client.includes("if (isAbortError(error, options?.signal)) throw error"))
  fail("aborted AI requests can still cascade into fallback providers");
if (!models.includes("export const XAI_STRUCTURED_PRIMARY_MODEL"))
  fail("ai-models does not export the xAI structured primary model");
if (!models.includes("export const STRUCTURED_PRIMARY_MODEL = XAI_STRUCTURED_PRIMARY_MODEL"))
  fail("managed structured default is not the xAI primary");
if (!models.includes('GROK_4_5: "grok-4.5"')) fail("Grok 4.5 model id is not registered");
if (!structuredModels.includes("STRUCTURED_PRIMARY_MODEL"))
  fail("structured-runtime-models does not route through the managed structured primary");

// Managed PSTN voice keeps a reliable OpenAI default with Gemini automatic fallback.
if (!models.includes('VAPI_TENANT_DEFAULT_PROVIDER = "openai"'))
  fail("managed voice default is not OpenAI");
if (!models.includes("VAPI_DEFAULT_FALLBACK_MODELS"))
  fail("managed voice does not carry fallback models");
if (!schema.includes('voiceLlmProvider: text("voice_llm_provider").default("openai")'))
  fail("Drizzle settings schema does not default managed voice to OpenAI");
if (!schema.includes('voiceLlmModel: text("voice_llm_model").default("gpt-4o")'))
  fail("Drizzle settings schema does not default managed voice model to GPT-4o");
if (!adminSettings.includes("VAPI_TENANT_DEFAULT_PROVIDER") || !adminSettings.includes("VAPI_TENANT_DEFAULT_MODEL"))
  fail("Admin settings fallback does not use managed voice defaults");
if (adminSettings.includes('"anthropic"') || adminSettings.includes('"claude-sonnet-4-6"'))
  fail("Admin settings still contains legacy Claude voice defaults");
if (!carrierPanel.includes("OpenAI is the primary call model") || !carrierPanel.includes("Gemini is the automatic fallback"))
  fail("carrier cognitive routing does not expose the managed call model default");
if (carrierPanel.includes("Claude Sonnet") || carrierPanel.includes('v: "anthropic"'))
  fail("carrier cognitive routing still presents Claude as the managed default");

// Production env + public disclosures name xAI as the primary inference sub-processor.
if (prodEnvCheck.includes("ANTHROPIC_API_KEY")) fail("production env check still asks for Anthropic");
if (!prodEnvCheck.includes("Primary managed runtime (Grok 4.5)"))
  fail("production env check does not name the xAI runtime dependency");
if (!legalPage.includes("<strong>xAI</strong>"))
  fail("public legal page does not name xAI as primary inference infrastructure");
if (!legalPage.includes("<strong>OpenAI</strong>") || !legalPage.includes("<strong>Google Gemini</strong>"))
  fail("public legal page does not name the OpenAI/Gemini fallback inference infrastructure");
if (legalPage.includes("Anthropic's Claude API") || legalPage.includes("<strong>Anthropic</strong>"))
  fail("public legal page still names Anthropic as active inference infrastructure");
if (!privacyPage.includes("<strong>xAI</strong>"))
  fail("public privacy page does not name xAI as primary inference infrastructure");
if (!integrationLogos.includes("ALL_LOGOS.xai"))
  fail("powered-by logo strip does not advertise xAI");
if (integrationLogos.includes("ALL_LOGOS.anthropic") || integrationLogos.includes('aria-label="Anthropic"'))
  fail("powered-by logo strip still advertises Anthropic");

// Realtime voice: Grok is the active contract, OpenAI Realtime is the ordered fallback.
if (!registerApiRoutes.includes("grokVoiceRouter"))
  fail("Grok realtime voice router is not registered");
if (!registerApiRoutes.includes("openaiRealtimeRouter"))
  fail("OpenAI Realtime fallback router is not registered");
if (!liveVoiceDoc.includes("Active Realtime Architecture"))
  fail("Grok live voice document is not classified as the active realtime architecture");
if (!liveVoiceDoc.includes("grok-voice-service.ts"))
  fail("Grok live voice document does not point to the active Grok realtime service");
if (!androidReadme.includes("managed xAI Grok realtime session contract"))
  fail("Android documentation does not identify the managed xAI Grok realtime contract");
if (androidReadme.includes("Legacy xAI/Grok routes and configuration are compatibility-only"))
  fail("Android documentation still frames the Grok path as legacy");

// OpenRouter override contract stays intact; production voice integrations stay registered.
if (!models.includes('provider === "openrouter" && isOpenRouterModelId(model)'))
  fail("OpenRouter model validation is missing");
if (!models.includes('return { provider: "openrouter", model, userSelected: true }'))
  fail("OpenRouter selections are not preserved exactly");
if (!/item\(\s*["']deepgram-flux["']/.test(registry))
  fail("Deepgram Flux is not registered as production voice transcription");
if (!/item\(\s*["']elevenlabs["']/.test(registry))
  fail("ElevenLabs is not registered as production voice synthesis");
if (!/item\(\s*["']openai-realtime["']/.test(registry))
  fail("OpenAI Realtime optional web/mobile mode is not registered");
if (!migrationCorpus.includes("voice_llm_provider SET DEFAULT 'openai'"))
  fail("tenant migration does not default managed voice to OpenAI");
if (!migrationCorpus.includes("voice_llm_model SET DEFAULT 'gpt-4o'"))
  fail("tenant migration does not default managed voice model to GPT-4o");
if (!migrationCorpus.includes("claude-haiku-4-5"))
  fail("tenant migration does not cover the legacy Claude Haiku managed default");
if (!migrationJournal.includes("0083_reassert_openai_voice_defaults"))
  fail("managed voice-default catch-up migration is not journaled for production deploys");

// Unmounted admin route trees and legacy Claude modules stay removed.
if (existsSync(resolve(root, "src/routes/admin-migrate"))) fail("unmounted admin migration route tree remains");
if (existsSync(resolve(root, "src/routes/admin-operating-routes.ts"))) fail("unmounted admin operating routes remain");
if (existsSync(resolve(root, "src/routes/admin-purge-accounts-routes.ts"))) fail("unmounted broad account purge route remains");
const legacyFiles = ["claude-brain.ts", "claude-client.ts", "claude-models.ts", "claude-structured.ts", "claude-audit.ts", "claude-tools.ts", "claude-recipes.ts", "claude-response-helpers.ts", "claude-supervisor-tools.ts"];
const remaining = legacyFiles.filter((file) => existsSync(resolve(root, "src/lib", file)));
if (remaining.length) fail(`legacy Claude modules remain: ${remaining.join(", ")}`);
if (existsSync(resolve(root, "src/routes/claude-routes.ts"))) fail("legacy Claude routes remain");
if (!process.exitCode) console.log("Grok-first runtime policy check passed");
