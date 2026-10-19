#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];
const requireText = (source, needle, message) => {
  if (!source.includes(needle)) failures.push(message);
};
const forbidText = (source, needle, message) => {
  if (source.includes(needle)) failures.push(message);
};

const providerPolicy = read("src/lib/reasoning-provider-policy.ts");
const runtimePolicy = read("src/lib/voice/runtime-policy.ts");
const routes = read("src/server/register-api-routes.ts");
const voiceCatalog = read("src/lib/voice-catalog.ts");
const schema = read("src/db/schema-base.ts");
const envValidator = read("src/lib/env-validator.ts");
const packageJson = read("package.json");
const privacy = read("src/components/PrivacyPolicyPage.tsx");

requireText(
  providerPolicy,
  '"xai",\n  "openai",\n  "gateway"',
  "Structured runtime order must remain xAI, OpenAI, then the AI Gateway.",
);
forbidText(providerPolicy, '"gemini",', "Gemini is retired from the structured runtime order.");
requireText(
  runtimePolicy,
  'runtime: "openai_realtime"',
  "Every live voice posture must use OpenAI Realtime.",
);
requireText(runtimePolicy, 'carrier: "twilio"', "Every phone posture must use Twilio.");
requireText(routes, "openAISipRouter", "OpenAI SIP webhook routes are not registered.");
requireText(routes, "openAIOutboundRouter", "OpenAI outbound routes are not registered.");
requireText(
  voiceCatalog,
  "OPENAI_REALTIME_VOICES",
  "Voice catalog does not expose the OpenAI Realtime catalog.",
);
requireText(
  schema,
  'voiceProvider: text("voice_provider").default("openai")',
  "New Bots do not default to OpenAI voices.",
);
for (const retiredKey of ["VAPI_PRIVATE_KEY", "VAPI_WEBHOOK_SECRET", "XAI_SIP_ALLOWED_ADDRESSES"]) {
  requireText(
    envValidator,
    `"${retiredKey}"`,
    `Environment validator does not reject retired key ${retiredKey}.`,
  );
}
forbidText(packageJson, "@vapi-ai/web", "Retired browser SDK remains installed.");
requireText(
  privacy.replace(/\s+/g, " "),
  "live phone conversations, and browser voice rehearsals through our AI model providers",
  "Privacy disclosure does not describe the production voice path.",
);
// BotBound is the product: customer-facing pages never name the voice vendor.
for (const [path, source] of [
  ["src/components/PrivacyPolicyPage.tsx", privacy],
  ["src/components/LegalPage.tsx", read("src/components/LegalPage.tsx")],
  ["src/components/Security.tsx", read("src/components/Security.tsx")],
  ["src/components/PublicChangelog.tsx", read("src/components/PublicChangelog.tsx")],
  [
    "src/components/voice/SimpleVoicePicker.tsx",
    read("src/components/voice/SimpleVoicePicker.tsx"),
  ],
]) {
  forbidText(source, "Grok", `${path} names the voice vendor (Grok).`);
  forbidText(source, "xAI", `${path} names the voice vendor (xAI).`);
}

for (const retiredPath of [
  "src/routes/vapi-v2.ts",
  "src/routes/xai-voice-routes.ts",
  "src/routes/grok-voice-routes.ts",
  "src/lib/vapi-client.ts",
  "src/lib/voice/xai-sip-session.ts",
]) {
  if (existsSync(resolve(root, retiredPath))) {
    failures.push(`Retired provider module still exists: ${retiredPath}`);
  }
}

if (failures.length) {
  console.error("Runtime policy check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Runtime policy verified: OpenAI Realtime plus Twilio, with retired providers absent.");
