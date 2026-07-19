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

// Managed structured runtime is OpenAI-first with ordered continuity fallbacks.
if (!client.includes("https://api.openai.com/v1/responses"))
  fail("managed runtime is not using the direct OpenAI Responses endpoint");
if (!client.includes("OpenAI request failed; trying Gemini fallback"))
  fail("OpenAI-to-Gemini fallback order is missing");
if (!client.includes("Gemini request failed; trying AI Gateway fallback"))
  fail("Gemini-to-AI-Gateway fallback order is missing");
const openAIPosition = client.indexOf('providers.push({ name: "OpenAI"');
const geminiPosition = client.indexOf('providers.push({ name: "Gemini"');
const gatewayPosition = client.indexOf('providers.push({ name: "AI Gateway"');
const xaiPosition = client.indexOf('providers.push({ name: "xAI"');
if (
  openAIPosition < 0 ||
  geminiPosition < 0 ||
  gatewayPosition < 0 ||
  !(openAIPosition < geminiPosition && geminiPosition < gatewayPosition)
)
  fail("managed runtime provider chain is not OpenAI -> Gemini -> AI Gateway");
if (xaiPosition >= 0 && !(gatewayPosition < xaiPosition))
  fail("optional direct xAI fallback appears before the governed AI Gateway route");
if (!client.includes("WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK"))
  fail("direct xAI fallback is not protected by an explicit opt-in switch");
if (!client.includes("if (isAbortError(error, options?.signal)) throw error"))
  fail("aborted AI requests can still cascade into fallback providers");
if (!models.includes("export const OPENAI_STRUCTURED_PRIMARY_MODEL"))
  fail("ai-models does not export the OpenAI structured primary model");
if (!models.includes("export const STRUCTURED_PRIMARY_MODEL = OPENAI_STRUCTURED_PRIMARY_MODEL"))
  fail("managed structured default is not the OpenAI primary");
if (!models.includes('GPT_5: "gpt-5"')) fail("GPT-5 model id is not registered");
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

// Production env + public disclosures describe the actual launch and optional layers.
if (prodEnvCheck.includes("ANTHROPIC_API_KEY")) fail("production env check still asks for Anthropic");
if (!prodEnvCheck.includes("Primary managed runtime and OpenAI Realtime sessions"))
  fail("production env check does not name the OpenAI runtime dependency");
if (!prodEnvCheck.includes("Optional xAI experiments"))
  fail("production env check does not classify xAI as optional");
if (!legalPage.includes("<strong>OpenAI</strong>"))
  fail("public legal page does not name OpenAI inference infrastructure");
if (!legalPage.includes("<strong>Google Gemini</strong>"))
  fail("public legal page does not name Gemini fallback infrastructure");
if (!legalPage.includes("<strong>xAI</strong>"))
  fail("public legal page does not disclose the optional xAI infrastructure");
if (legalPage.includes("Anthropic's Claude API") || legalPage.includes("<strong>Anthropic</strong>"))
  fail("public legal page still names Anthropic as active inference infrastructure");
if (!privacyPage.includes("<strong>OpenAI</strong>"))
  fail("public privacy page does not name OpenAI inference infrastructure");
if (!integrationLogos.includes("ALL_LOGOS.openai"))
  fail("powered-by logo strip does not advertise OpenAI");
if (integrationLogos.includes("ALL_LOGOS.anthropic") || integrationLogos.includes('aria-label="Anthropic"'))
  fail("powered-by logo strip still advertises Anthropic");

// Realtime voice: OpenAI is registered and xAI remains an optional parallel route.
if (!registerApiRoutes.includes("openaiRealtimeRouter"))
  fail("OpenAI Realtime router is not registered");
if (!registerApiRoutes.includes("grokVoiceRouter"))
  fail("optional Grok realtime voice router is not registered");

// OpenRouter is retired: the Vercel AI Gateway is the only multi-model route.
if (/openrouter/i.test(models)) fail("ai-models still references the retired OpenRouter path");
if (!/item\(\s*["']ai-gateway["']/.test(registry))
  fail("Vercel AI Gateway is not registered as the multi-model route");
if (!/item\(\s*["']deepgram-flux["']/.test(registry))
  fail("Deepgram Flux is not registered as production voice transcription");
if (!/item\(\s*["']elevenlabs["']/.test(registry))
  fail("ElevenLabs is not registered as an optional voice synthesis layer");
if (!/item\(\s*["']openai-realtime["']/.test(registry))
  fail("OpenAI Realtime web/mobile mode is not registered");
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
if (existsSync(resolve(root, "src/routes/admin-operating-routes.ts")))
  fail("unmounted admin operating routes remain");
if (existsSync(resolve(root, "src/routes/admin-purge-accounts-routes.ts")))
  fail("unmounted broad account purge route remains");
const legacyFiles = ["claude-brain.ts", "claude-client.ts", "claude-models.ts", "claude-structured.ts", "claude-audit.ts", "claude-tools.ts", "claude-recipes.ts", "claude-response-helpers.ts", "claude-supervisor-tools.ts"];
const remaining = legacyFiles.filter((file) => existsSync(resolve(root, "src/lib", file)));
if (remaining.length) fail(`legacy Claude modules remain: ${remaining.join(", ")}`);
if (existsSync(resolve(root, "src/routes/claude-routes.ts"))) fail("legacy Claude routes remain");
if (!process.exitCode) console.log("OpenAI-first runtime policy check passed");
