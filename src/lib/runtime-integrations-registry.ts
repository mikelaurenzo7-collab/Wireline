export type IntegrationStatus = "configured" | "missing" | "fallback";
export type IntegrationGroup =
  | "core"
  | "ai"
  | "voice"
  | "oauth"
  | "billing"
  | "actions"
  | "infra"
  | "security";
export type IntegrationDescriptor = {
  id: string;
  label: string;
  description: string;
  group: IntegrationGroup;
  required: boolean;
  envVars: readonly string[];
  fallback?: string;
};
const item = (
  id: string,
  label: string,
  description: string,
  group: IntegrationGroup,
  required: boolean,
  envVars: readonly string[],
  fallback?: string,
): IntegrationDescriptor => ({ id, label, description, group, required, envVars, fallback });
export const RUNTIME_INTEGRATIONS: readonly IntegrationDescriptor[] = [
  item("drizzle", "Vercel Postgres", "Tenant data plane and persistence.", "core", true, [
    "POSTGRES_URL",
    "INTERNAL_JWT_SECRET",
  ]),
  item(
    "openai",
    "OpenAI",
    "Managed primary for training, QA, insights, and post-call intelligence.",
    "ai",
    true,
    ["OPENAI_API_KEY"],
    "Gemini is the automatic failure fallback.",
  ),
  item(
    "gemini",
    "Google Gemini",
    "Automatic fallback for managed AI work and grounded search.",
    "ai",
    false,
    ["GEMINI_API_KEY"],
  ),
  item("openrouter", "OpenRouter", "Explicit per-agent custom-model pass-through.", "ai", false, [
    "OPENROUTER_API_KEY",
  ]),
  item("vapi", "Vapi", "PSTN inbound and outbound call handling.", "voice", true, [
    "VAPI_PRIVATE_KEY",
    "VAPI_WEBHOOK_SECRET",
  ]),
  item(
    "deepgram-flux",
    "Deepgram Flux",
    "Production transcription and end-of-turn behavior through Vapi.",
    "voice",
    true,
    ["VAPI_PRIVATE_KEY"],
  ),
  item(
    "elevenlabs",
    "ElevenLabs",
    "Primary customer-facing TTS, agent voices, and pronunciations.",
    "voice",
    false,
    ["ELEVENLABS_API_KEY"],
  ),
  item(
    "openai-realtime",
    "OpenAI Realtime",
    "Optional web/mobile voice mode, separate from phone routing.",
    "voice",
    false,
    ["OPENAI_API_KEY"],
  ),
  item(
    "liveavatar",
    "Live video presenter",
    "Photoreal on-screen agent for business receptionists and embeds (LiveAvatar LITE).",
    "voice",
    false,
    ["LIVEAVATAR_API_KEY", "LIVEAVATAR_DEFAULT_AVATAR_ID"],
    "Wireline SVG face remains the always-on fallback.",
  ),
  item(
    "google-workspace",
    "Google Workspace",
    "Gmail, Calendar, Contacts, Drive, and Sheets.",
    "oauth",
    false,
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ),
  item(
    "microsoft-365",
    "Microsoft 365",
    "Outlook, Calendar, Teams, Excel, OneDrive, and PowerPoint.",
    "oauth",
    false,
    ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
  ),
  item("yahoo", "Yahoo Mail", "Yahoo mailbox connection.", "oauth", false, [
    "YAHOO_CLIENT_ID",
    "YAHOO_CLIENT_SECRET",
  ]),
  item("icloud", "iCloud Mail", "Personal iCloud mailbox connection.", "oauth", false, [
    "ICLOUD_APPLE_ID",
    "ICLOUD_APP_PASSWORD",
  ]),
  item("stripe", "Stripe", "Subscriptions, billing, and portal.", "billing", false, [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ]),
  item("hubspot", "HubSpot", "CRM contacts, deals, and activity.", "actions", false, [
    "HUBSPOT_CLIENT_ID",
    "HUBSPOT_CLIENT_SECRET",
  ]),
  item(
    "salesforce",
    "Salesforce",
    "Accounts, contacts, opportunities, and tasks.",
    "actions",
    false,
    ["SALESFORCE_CLIENT_ID", "SALESFORCE_CLIENT_SECRET"],
  ),
  item("slack", "Slack", "Team alerts and escalations.", "actions", false, [
    "SLACK_CLIENT_ID",
    "SLACK_CLIENT_SECRET",
  ]),
  item("zoom", "Zoom", "Meeting links for bookings.", "actions", false, [
    "ZOOM_CLIENT_ID",
    "ZOOM_CLIENT_SECRET",
  ]),
  item("apollo", "Apollo", "Lead enrichment and prospect intelligence.", "actions", false, [
    "APOLLO_API_KEY",
  ]),
  item("meta", "Meta", "Lead follow-up and attribution.", "actions", false, [
    "META_APP_ID",
    "META_APP_SECRET",
  ]),
  item("shopify", "Shopify", "Commerce support actions.", "actions", false, [
    "SHOPIFY_CLIENT_ID",
    "SHOPIFY_CLIENT_SECRET",
  ]),
  item("square", "Square", "Commerce and payment actions.", "actions", false, [
    "SQUARE_APPLICATION_ID",
    "SQUARE_APPLICATION_SECRET",
  ]),
  item("x", "X", "Approved social engagement and reporting.", "actions", false, [
    "X_CLIENT_ID",
    "X_CLIENT_SECRET",
  ]),
  item("upstash", "Upstash Redis", "Distributed rate limits and spend controls.", "infra", false, [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ]),
  item("secret-vault", "Secret Vault", "Encrypted integration secrets.", "security", false, [
    "WIRELINE_DATA_KEY",
  ]),
] as const;
const present = (name: string) => !!process.env[name];
export function getRuntimeIntegrationStatus() {
  return RUNTIME_INTEGRATIONS.map((entry) => ({
    ...entry,
    status: entry.envVars.every(present) ? ("configured" as const) : ("missing" as const),
    envVars: entry.envVars.map((name) => ({ name, present: present(name) })),
  }));
}
export function getRuntimeCapabilities() {
  return Object.fromEntries(
    RUNTIME_INTEGRATIONS.map((entry) => [
      entry.id.replace(/-/g, "_"),
      entry.envVars.every(present),
    ]),
  );
}
