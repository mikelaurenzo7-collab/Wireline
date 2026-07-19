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
  oneOfEnvVars?: readonly (readonly string[])[];
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
  oneOfEnvVars?: readonly (readonly string[])[],
): IntegrationDescriptor => ({
  id,
  label,
  description,
  group,
  required,
  envVars,
  fallback,
  oneOfEnvVars,
});
export const RUNTIME_INTEGRATIONS: readonly IntegrationDescriptor[] = [
  item("drizzle", "Supabase Postgres", "Tenant data plane and persistence.", "core", true, [
    "POSTGRES_URL",
    "INTERNAL_JWT_SECRET",
  ]),
  item(
    "xai",
    "xAI Grok",
    "Primary structured runtime and authenticated Studio live voice.",
    "ai",
    true,
    ["XAI_API_KEY"],
    "OpenAI, Gemini, and AI Gateway remain ordered structured fallbacks.",
  ),
  item(
    "openai",
    "OpenAI",
    "Structured fallback, primary Vapi PSTN call model, and optional Realtime continuity.",
    "ai",
    true,
    ["OPENAI_API_KEY"],
    "Gemini is the automatic PSTN call-model fallback.",
  ),
  item(
    "gemini",
    "Google Gemini",
    "Automatic fallback for managed AI work and grounded search.",
    "ai",
    false,
    ["GEMINI_API_KEY"],
  ),
  item(
    "ai-gateway",
    "Vercel AI Gateway",
    "Last-resort multi-model routing for the managed runtime.",
    "ai",
    false,
    [],
    "Vercel deployments can use OIDC instead of a static Gateway key.",
    [["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"]],
  ),
  item("vapi", "Vapi", "PSTN inbound and outbound call handling.", "voice", true, [
    "VAPI_PRIVATE_KEY",
    "VAPI_WEBHOOK_SECRET",
  ]),
  item(
    "twilio",
    "Twilio",
    "SMS, WhatsApp, phone-number lookup, and imported number provisioning.",
    "voice",
    false,
    ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  ),
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
    "Optional TTS, voice cloning, pronunciation tools, and showcase voices.",
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
    "heygen",
    "HeyGen presenter voices",
    "Presenter voice previews and matched avatar voice generation.",
    "voice",
    false,
    ["HEYGEN_API_KEY"],
    "Requires a HeyGen Studio API key; LiveAvatar credentials are intentionally not reused.",
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
  item(
    "resend",
    "Resend",
    "Transactional email for verification, billing, support, and lifecycle messages.",
    "infra",
    false,
    ["RESEND_API_KEY"],
    "Development can log verification email instead of sending.",
  ),
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
  item(
    "docusign",
    "DocuSign",
    "E-signature envelope dispatch and status lookup.",
    "actions",
    false,
    ["DOCUSIGN_ACCOUNT_ID"],
    "DOCUSIGN_JWT_TOKEN can replace DOCUSIGN_ACCESS_TOKEN.",
    [["DOCUSIGN_ACCESS_TOKEN", "DOCUSIGN_JWT_TOKEN"]],
  ),
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
  item(
    "x-ads",
    "X Ads API",
    "Campaign listing and performance stats for social attribution.",
    "actions",
    false,
    [
      "X_API_KEY",
      "X_API_SECRET",
      "X_ADS_ACCESS_TOKEN",
      "X_ADS_ACCESS_TOKEN_SECRET",
      "X_ADS_ACCOUNT_ID",
    ],
  ),
  item("upstash", "Upstash Redis", "Distributed rate limits and spend controls.", "infra", false, [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ]),
  item(
    "chatgpt-mcp",
    "ChatGPT MCP",
    "Account-bound ChatGPT app tools, private simulation, and agent drafting widgets.",
    "infra",
    false,
    ["MCP_OAUTH_TOKEN_PEPPER"],
  ),
  item("secret-vault", "Secret Vault", "Encrypted integration secrets.", "security", false, [
    "WIRELINE_DATA_KEY",
  ]),
  item(
    "pwned-passwords",
    "Have I Been Pwned Pwned Passwords",
    "K-anonymity breach screening for Wireline's custom password auth.",
    "security",
    false,
    [],
    "Signup degrades open only if the external range endpoint is temporarily unavailable.",
  ),
] as const;
const present = (name: string) => !!process.env[name];
const configured = (entry: IntegrationDescriptor) =>
  entry.envVars.every(present) && (entry.oneOfEnvVars ?? []).every((group) => group.some(present));
export function getRuntimeIntegrationStatus() {
  return RUNTIME_INTEGRATIONS.map((entry) => ({
    ...entry,
    status: configured(entry) ? ("configured" as const) : ("missing" as const),
    envVars: [
      ...entry.envVars.map((name) => ({ name, present: present(name) })),
      ...(entry.oneOfEnvVars ?? []).flatMap((group) =>
        group.map((name) => ({
          name,
          present: present(name),
          alternative_group: group.join(" | "),
        })),
      ),
    ],
  }));
}
export function getRuntimeCapabilities() {
  return Object.fromEntries(
    RUNTIME_INTEGRATIONS.map((entry) => [entry.id.replace(/-/g, "_"), configured(entry)]),
  );
}
