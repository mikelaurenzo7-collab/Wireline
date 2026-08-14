import { isFederalDncVendorConfigured } from "./federal-dnc-config";
import { perplexityRuntimeAvailable } from "./platform-integration-flags";
import { resendWebhookSecretConfigured } from "./resend-webhook-signature";

export type IntegrationStatus = "configured" | "missing" | "fallback";
export type IntegrationGroup =
  "core" | "ai" | "voice" | "oauth" | "billing" | "actions" | "infra" | "security";
export type IntegrationDescriptor = {
  id: string;
  label: string;
  description: string;
  group: IntegrationGroup;
  required: boolean;
  envVars: readonly string[];
  oneOfEnvVars?: readonly (readonly string[])[];
  fallback?: string;
  /**
   * Optional value-shape validation on top of env presence. Presence-only
   * checks have lied before (a pasted Vercel token as FEDERAL_DNC_API_KEY made
   * readiness claim a vendor the runtime rejects), so integrations whose
   * runtime validates credential shape must apply the same rule here.
   */
  validate?: () => boolean;
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
    "openai",
    "OpenAI",
    "Primary structured runtime, primary Vapi PSTN call model, and optional Realtime voice.",
    "ai",
    true,
    ["OPENAI_API_KEY"],
    "Gemini and the Vercel AI Gateway provide ordered continuity.",
  ),
  item(
    "gemini",
    "Google Gemini",
    "First automatic continuity fallback for managed AI work and grounded search.",
    "ai",
    false,
    ["GEMINI_API_KEY"],
  ),
  {
    ...item(
      "perplexity",
      "Perplexity",
      "Optional first route for approved live public research tools.",
      "ai",
      false,
      [],
      "Gemini grounded search covers live research when unset.",
      [["PERPLEXITY_API_KEY", "PERPLEXITY_PREVIEW_API_KEY"]],
    ),
    // Production keys are intentionally inert on Vercel previews (a preview
    // needs its own PERPLEXITY_PREVIEW_API_KEY), so configured-ness follows the
    // runtime's key policy, not raw variable presence.
    validate: perplexityRuntimeAvailable,
  },
  item(
    "ai-gateway",
    "Vercel AI Gateway",
    "Governed final multi-model route with centralized budgets and observability.",
    "ai",
    false,
    [],
    "Vercel deployments can use OIDC instead of a static Gateway key.",
    [["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"]],
  ),
  item(
    "xai",
    "xAI Grok",
    "Grok structured continuity lane and Wireline Preview voice rendering.",
    "ai",
    false,
    ["XAI_API_KEY"],
    "Active whenever XAI_API_KEY is configured; OpenAI stays the managed primary. Set WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=false to disable.",
  ),
  item("vapi", "Vapi", "Managed PSTN inbound and outbound call orchestration.", "voice", true, [
    "VAPI_PRIVATE_KEY",
    "VAPI_WEBHOOK_SECRET",
  ]),
  item(
    "elevenlabs",
    "ElevenLabs",
    "Managed low-latency studio speech and founder-approved private voice cloning.",
    "voice",
    true,
    ["ELEVENLABS_API_KEY"],
    "Every ElevenLabs phone voice carries a curated Vapi fallback.",
  ),
  item(
    "twilio",
    "Twilio",
    "Required production phone-number carrier and two-way SMS layer; WhatsApp remains private beta until an approved sender and templates are live.",
    "voice",
    true,
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
    "openai-realtime",
    "OpenAI Realtime",
    "Studio, ChatGPT, and guest browser/mobile live-voice demos (separate from phone routing).",
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
  item(
    "stripe",
    "Stripe",
    "Subscriptions, prepaid balances, billing, and portal.",
    "billing",
    true,
    ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  ),
  item(
    "resend",
    "Resend",
    "Transactional email for verification, billing, support, and lifecycle messages.",
    "infra",
    true,
    ["RESEND_API_KEY"],
    "A verified production sending domain is also required.",
  ),
  {
    ...item(
      "resend-feedback",
      "Resend delivery feedback",
      "Signed bounce, complaint, suppression, failure, and delay feedback for safe email operations.",
      "infra",
      false,
      ["RESEND_WEBHOOK_SECRET"],
      "Email sending remains available, but provider delivery risk and failure evidence are incomplete.",
    ),
    validate: resendWebhookSecretConfigured,
  },
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
  item("upstash", "Upstash Redis", "Distributed rate limits and spend controls.", "infra", true, [
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
  item(
    "apns",
    "Apple Push (APNs)",
    "Wakes the native iOS app for inbound calls and urgent owner alerts.",
    "infra",
    false,
    ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_AUTH_KEY", "APNS_BUNDLE_ID"],
    "Missing push configuration degrades safely; web and API behavior is unaffected.",
  ),
  item(
    "fcm",
    "Firebase Cloud Messaging",
    "Wakes the native Android app for inbound calls and urgent owner alerts.",
    "infra",
    false,
    ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"],
    "Missing push configuration degrades safely; web and API behavior is unaffected.",
  ),
  item("secret-vault", "Secret Vault", "Encrypted integration secrets.", "security", false, [
    "WIRELINE_DATA_KEY",
  ]),
  {
    ...item(
      "federal-dnc",
      "Federal DNC scrub",
      "Marketing/campaign outbound scrub against the federal Do Not Call registry.",
      "security",
      false,
      ["FEDERAL_DNC_API_URL", "FEDERAL_DNC_API_KEY"],
      "Runtime validates the vendor credential shape and fails closed when unconfigured.",
    ),
    // Same rule the runtime applies — presence of a misplaced Vercel token or
    // an http URL must not report the scrub vendor as configured.
    validate: isFederalDncVendorConfigured,
  },
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
const present = (name: string) => {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
};
const configured = (entry: IntegrationDescriptor) =>
  entry.envVars.every(present) &&
  (entry.oneOfEnvVars ?? []).every((group) => group.some(present)) &&
  (entry.validate?.() ?? true);
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
