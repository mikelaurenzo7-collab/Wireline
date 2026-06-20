import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  console.error(`OpenAI runtime policy check failed: ${message}`);
  process.exitCode = 1;
};

const client = read("src/lib/claude-client.ts");
const models = read("src/lib/claude-models.ts");
const voice = read("src/lib/voice-model-defaults.ts");
const director = read("src/lib/director-model-policy.ts");
const migration = read("drizzle/migrations/0061_openai_primary_gemini_fallback.sql");

if (client.includes("@anthropic-ai/sdk") || client.includes("api.anthropic.com")) {
  fail("the managed runtime adapter still references Anthropic");
}
if (!client.includes("https://api.openai.com/v1/responses")) {
  fail("the managed runtime adapter is not using OpenAI Responses");
}
if (!client.includes("OpenAI request failed; trying Gemini fallback")) {
  fail("OpenAI-to-Gemini fallback order is missing");
}
if (!models.includes('VAPI_TENANT_DEFAULT_PROVIDER = "openai"')) {
  fail("managed voice default is not OpenAI");
}
if (!voice.includes('VAPI_VOICE_FALLBACK_PROVIDER: DefaultVoiceProvider = "google"')) {
  fail("managed voice fallback is not Gemini");
}
if (!director.includes("process.env.OPENAI_API_KEY")) {
  fail("Director managed model validation does not require OpenAI");
}
if (!migration.includes("voice_llm_provider SET DEFAULT 'openai'")) {
  fail("tenant migration does not default managed voice to OpenAI");
}

if (!process.exitCode) console.log("OpenAI-first runtime policy check passed");
