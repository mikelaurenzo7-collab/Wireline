import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => { console.error(`OpenAI runtime policy check failed: ${message}`); process.exitCode = 1; };
const contains = (path, value) => existsSync(resolve(root, path)) && read(path).includes(value);
const packageJson = read("package.json");
const client = read("src/lib/ai-client.ts");
const models = read("src/lib/ai-models.ts");
const registry = read("src/lib/runtime-integrations-registry.ts");
const schema = read("src/db/schema.ts");
const adminSettings = read("src/components/AdminSettings.tsx");
const carrierPanel = read("src/components/admin/CarrierPanel.tsx");
const prodEnvCheck = read("scripts/check-prod-env.mjs");
const legalPage = read("src/components/LegalPage.tsx");
const integrationLogos = read("src/components/layout/IntegrationLogos.tsx");
const migrationJournal = read("drizzle/migrations/meta/_journal.json");
const migrationCorpus = readdirSync(resolve(root, "drizzle/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => read(`drizzle/migrations/${name}`))
  .join("\n");

if (packageJson.includes('"@anthropic-ai/sdk"')) fail("Anthropic SDK remains in the install manifest");
if (client.includes("@anthropic-ai/sdk") || client.includes("api.anthropic.com")) fail("managed runtime references Anthropic");
if (!client.includes("https://api.openai.com/v1/responses")) fail("managed runtime is not using OpenAI Responses");
if (!client.includes("AI Gateway request failed; trying direct OpenAI fallback")) fail("AI Gateway does not fall back through direct OpenAI");
if (!client.includes("OpenAI request failed; trying Gemini fallback")) fail("OpenAI-to-Gemini fallback order is missing");
const gatewayPosition = client.indexOf('providers.push({ name: "AI Gateway"');
const openAIPosition = client.indexOf('providers.push({ name: "OpenAI"');
const geminiPosition = client.indexOf('providers.push({ name: "Gemini"');
if (gatewayPosition < 0 || openAIPosition < 0 || geminiPosition < 0 || !(gatewayPosition < openAIPosition && openAIPosition < geminiPosition)) fail("managed runtime provider chain is not Gateway -> OpenAI -> Gemini");
if (!client.includes("if (isAbortError(error, options?.signal)) throw error")) fail("aborted AI requests can still cascade into fallback providers");
if (!models.includes('VAPI_TENANT_DEFAULT_PROVIDER = "openai"')) fail("managed voice default is not OpenAI");
if (!models.includes("VAPI_DEFAULT_FALLBACK_MODELS")) fail("managed voice does not carry Gemini fallback models");
if (!schema.includes('voiceLlmProvider: text("voice_llm_provider").default("openai")')) fail("Drizzle settings schema does not default managed voice to OpenAI");
if (!schema.includes('voiceLlmModel: text("voice_llm_model").default("gpt-4o")')) fail("Drizzle settings schema does not default managed voice model to GPT-4o");
if (!adminSettings.includes("VAPI_TENANT_DEFAULT_PROVIDER") || !adminSettings.includes("VAPI_TENANT_DEFAULT_MODEL")) fail("Admin settings fallback does not use managed OpenAI voice defaults");
if (adminSettings.includes('"anthropic"') || adminSettings.includes('"claude-sonnet-4-6"')) fail("Admin settings still contains legacy Claude voice defaults");
if (!carrierPanel.includes("OpenAI is the primary call model") || !carrierPanel.includes("Gemini is the automatic fallback")) fail("carrier cognitive routing does not expose the OpenAI default");
if (carrierPanel.includes("Claude Sonnet") || carrierPanel.includes("Anthropic voice disruptions") || carrierPanel.includes('v: "anthropic"')) fail("carrier cognitive routing still presents Claude as the managed default");
if (prodEnvCheck.includes("ANTHROPIC_API_KEY")) fail("production env check still asks for Anthropic");
if (!prodEnvCheck.includes("Direct OpenAI fallback and OpenAI Realtime sessions")) fail("production env check does not name the OpenAI runtime dependency");
if (legalPage.includes("Anthropic's Claude API") || legalPage.includes("<strong>Anthropic</strong>")) fail("public privacy page still names Anthropic as active inference infrastructure");
if (!legalPage.includes("<strong>OpenAI</strong>")) fail("public privacy page does not name OpenAI as active inference infrastructure");
if (!legalPage.includes("<strong>Google Gemini</strong>")) fail("public privacy page does not name Gemini as managed fallback inference infrastructure");
if (integrationLogos.includes("ALL_LOGOS.anthropic") || integrationLogos.includes('aria-label="Anthropic"')) fail("powered-by logo strip still advertises Anthropic");
if (!integrationLogos.includes("ALL_LOGOS.openai")) fail("powered-by logo strip does not advertise OpenAI");
if (!models.includes('provider === "openrouter" && isOpenRouterModelId(model)')) fail("OpenRouter model validation is missing");
if (!models.includes('return { provider: "openrouter", model, userSelected: true }')) fail("OpenRouter selections are not preserved exactly");
if (!/item\(\s*["']deepgram-flux["']/.test(registry)) fail("Deepgram Flux is not registered as production voice transcription");
if (!/item\(\s*["']elevenlabs["']/.test(registry)) fail("ElevenLabs is not registered as production voice synthesis");
if (!/item\(\s*["']openai-realtime["']/.test(registry)) fail("OpenAI Realtime optional web/mobile mode is not registered");
if (!migrationCorpus.includes("voice_llm_provider SET DEFAULT 'openai'")) fail("tenant migration does not default managed voice to OpenAI");
if (!migrationCorpus.includes("voice_llm_model SET DEFAULT 'gpt-4o'")) fail("tenant migration does not default managed voice model to GPT-4o");
if (!migrationCorpus.includes("claude-haiku-4-5")) fail("tenant migration does not cover the legacy Claude Haiku managed default");
if (!migrationJournal.includes("0083_reassert_openai_voice_defaults")) fail("OpenAI voice-default catch-up migration is not journaled for production deploys");
if (existsSync(resolve(root, "src/routes/admin-migrate"))) fail("unmounted admin migration route tree remains");
if (existsSync(resolve(root, "src/routes/admin-operating-routes.ts"))) fail("unmounted admin operating routes remain");
if (existsSync(resolve(root, "src/routes/admin-purge-accounts-routes.ts"))) fail("unmounted broad account purge route remains");
const legacyFiles = ["claude-brain.ts", "claude-client.ts", "claude-models.ts", "claude-structured.ts", "claude-audit.ts", "claude-tools.ts", "claude-recipes.ts", "claude-response-helpers.ts", "claude-supervisor-tools.ts"];
const remaining = legacyFiles.filter((file) => existsSync(resolve(root, "src/lib", file)));
if (remaining.length) fail(`legacy Claude modules remain: ${remaining.join(", ")}`);
if (existsSync(resolve(root, "src/routes/claude-routes.ts"))) fail("legacy Claude routes remain");
if (!process.exitCode) console.log("OpenAI-first runtime policy check passed");
