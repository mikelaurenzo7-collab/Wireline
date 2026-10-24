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
const phoneProvider = read("src/lib/voice/realtime-provider.ts");
const sipTarget = read("src/lib/voice/realtime-sip-target.ts");
const sipSession = read("src/lib/voice/openai-sip-session.ts");
const sipRoutes = read("src/routes/openai-sip-routes.ts");
const studioVoice = read("src/lib/voice/openai-live-agent-service.ts");
const mcpVoice = read("src/routes/chatgpt-mcp-account-routes.ts");
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
  studioVoice,
  "await createServerManagedOpenAIRealtimeCall({",
  "Studio private microphone rehearsal must use server-managed OpenAI Realtime.",
);
requireText(
  mcpVoice,
  "await createOpenAIRealtimeSimulationCall({",
  "MCP private voice simulation must use OpenAI Realtime.",
);
requireText(
  phoneProvider,
  'env.WIRELINE_PHONE_VOICE_PROVIDER || ""',
  "Phone routing must require explicit provider configuration.",
);
requireText(
  phoneProvider,
  '=== "openai"\n    ? "openai"\n    : "xai"',
  "xAI must be the default new-call provider, with OpenAI only as the explicit opt-out.",
);
requireText(
  sipTarget,
  'configuredPhoneVoiceProvider() !== "xai" || !xaiSipConfigured()',
  "xAI SIP targets must honor the operator opt-out and require configuration.",
);
requireText(
  sipTarget,
  "await xaiSipCredentialsFor(ourNumber)",
  "xAI SIP targets must require registration credentials for the called number.",
);
requireText(
  sipTarget,
  "if (!credentials)",
  "Unregistered phone numbers must fall back before xAI admission.",
);
requireText(
  sipTarget,
  "registerNumberInBackground(ourNumber)",
  "Unregistered phone numbers must self-register with xAI instead of needing manual registration.",
);
for (const uri of [
  "buildOpenAIInboundSipUri(input.token)",
  "buildOpenAIOutboundSipUri(input.token)",
]) {
  requireText(
    sipTarget,
    uri,
    "OpenAI must remain the inbound and outbound fallback before a call starts.",
  );
}
requireText(
  phoneProvider,
  'callId.startsWith(XAI_CALL_ID_PREFIX) ? "xai" : "openai"',
  "An admitted call's provider must be encoded by its call id.",
);
for (const [path, source] of [
  ["src/lib/voice/openai-sip-session.ts", sipSession],
  ["src/routes/openai-sip-routes.ts", sipRoutes],
]) {
  requireText(
    source,
    "realtimeProviderForCallId(callId)",
    `${path} must route call control by the admitted call id.`,
  );
  requireText(
    source,
    "realtimeCallControlUrl(callId, action)",
    `${path} must control the same provider throughout a call.`,
  );
  forbidText(
    source,
    "configuredPhoneVoiceProvider(",
    `${path} must not switch an admitted call with the new-call provider flag.`,
  );
}
requireText(
  sipSession,
  "buildRealtimeSipSocketUrl(input.callId)",
  "The persistent SIP socket must use the admitted call's provider.",
);
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
console.log(
  "Source runtime policy checked: OpenAI private rehearsal; default xAI phone routing with self-registration and OpenAI fallback over Twilio; call-id-bound control. Live workflow evidence remains separate.",
);
