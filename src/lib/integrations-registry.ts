/**
 * Wireline integrations registry — single source of truth for every external
 * service this app talks to (Anthropic, Gemini, Vapi, Supabase, Stripe, …).
 *
 * Used by:
 *   - GET /api/health                   — `capabilities` block (public probe)
 *   - GET /api/health/integrations      — authenticated, full structured list
 *   - AdminSettings → System tab        — Platform Health panel
 *
 * NOTE: distinct from `./integrations.ts`, which is the runtime client for
 * per-user Calendar / Mail OAuth accounts. This file is *server configuration*
 * for the *app deployment* itself.
 *
 * Adding a new integration?
 *   1. Append an entry to `INTEGRATIONS` in the canonical group order below.
 *   2. Add its env var(s) to `.env.example` in the matching section.
 *   3. Add a note to `AGENTS.md` if it's load-bearing or has a fallback.
 *
 * The order in this file is the canonical order surfaced everywhere in the
 * UI and docs. Do not re-sort alphabetically — group ordering matters.
 */
import * as claudeBrain from "./claude-brain";
import { apolloPlatformConfigured } from "./apollo-service";
import { microsoftGraphConfigured } from "./microsoft-graph-service";
import { slackOAuthConfigured } from "./slack-service";

export type IntegrationStatus = "configured" | "missing" | "fallback";

export type IntegrationGroup =
  | "core" // app cannot function without these
  | "ai" // LLM providers
  | "voice" // voice provider
  | "oauth" // OAuth-based identity / mailbox connections
  | "billing" // payment provider
  | "actions" // optional integrations wired into the Action Engine
  | "infra" // rate-limit / observability / data-plane plumbing
  | "security"; // crypto / secret material

export interface IntegrationDescriptor {
  /** Stable identifier (kebab-case). Surface this in API responses. */
  id: string;
  /** Human-readable label for UI. */
  label: string;
  /** One-sentence summary of what it does. */
  description: string;
  /** Display group. */
  group: IntegrationGroup;
  /** True if the app is non-functional without it. */
  required: boolean;
  /** Env vars that gate this integration. */
  envVars: readonly string[];
  /** Optional behaviour note shown in UI tooltips & docs. */
  fallback?: string;
  /** Optional doc link displayed in UI. */
  docsUrl?: string;
}

/**
 * Canonical registry. Order here is the order surfaced in API responses and UI.
 * Keep groups contiguous and in this fixed order:
 *   core → ai → voice → oauth → billing → actions → infra → security
 */
export const INTEGRATIONS: readonly IntegrationDescriptor[] = [
  // ─── core ───────────────────────────────────────────────────────────────
  {
    id: "drizzle",
    label: "Vercel Postgres (Drizzle)",
    description: "Sovereign Postgres database and ORM.",
    group: "core",
    required: true,
    envVars: ["POSTGRES_URL", "INTERNAL_JWT_SECRET"],
    docsUrl: "https://orm.drizzle.team/docs/overview",
  },

  // ─── ai ─────────────────────────────────────────────────────────────────
  {
    id: "anthropic",
    label: "Anthropic Claude",
    description:
      "Primary brain — every /api/claude/* endpoint, post-call enrichment, Daily Brief, Triage, Insights, recipes.",
    group: "ai",
    required: true,
    envVars: ["ANTHROPIC_API_KEY"],
    fallback: "Without it, /api/claude/* returns 503 and Gemini handles legacy paths.",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Fast fallback for Anthropic voice outages plus grounded-search legacy paths.",
    group: "ai",
    required: true,
    envVars: ["GEMINI_API_KEY"],
    docsUrl: "https://aistudio.google.com/app/apikey",
  },

  // ─── voice ──────────────────────────────────────────────────────────────
  {
    id: "vapi",
    label: "Wireline Voice Network",
    description:
      "Inbound and outbound phone calls on your Wireline numbers. Uses VAPI_PRIVATE_KEY (Bearer) plus public key for embedding.",
    group: "voice",
    required: true,
    envVars: ["VAPI_PRIVATE_KEY", "VITE_VAPI_PUBLIC_KEY", "VAPI_WEBHOOK_SECRET"],
    fallback:
      "When VAPI_WEBHOOK_SECRET is unset in dev, webhook auth is skipped. Production rejects webhooks until it matches Vapi dashboard header + assistant serverUrlSecret.",
  },

  // ─── oauth ──────────────────────────────────────────────────────────────
  {
    id: "google-oauth",
    label: "Google OAuth / Gmail",
    description: "Connects operator Gmail mailboxes for the email agent and Daily Brief delivery.",
    group: "oauth",
    required: false,
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    fallback:
      "Without it, Gmail-based email agents and the scheduled Daily Brief email are disabled.",
  },
  {
    id: "microsoft-oauth",
    label: "Microsoft OAuth / Outlook",
    description: "Connects Microsoft 365 / Outlook mailboxes for the email agent.",
    group: "oauth",
    required: false,
    envVars: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    fallback: "Without it, only Gmail accounts can be linked to email agents.",
  },

  // ─── billing ────────────────────────────────────────────────────────────
  {
    id: "stripe",
    label: "Stripe",
    description: "Subscription billing, plan gating, and Customer Portal.",
    group: "billing",
    required: false,
    envVars: [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PERSONAL_PRICE_ID",
      "STRIPE_STARTER_PRICE_ID",
      "STRIPE_PRO_PRICE_ID",
      "STRIPE_BUSINESS_PRICE_ID",
      "STRIPE_ENTERPRISE_PRICE_ID",
      "STRIPE_VOICE_OVERAGE_METER_EVENT_NAME",
    ],
    fallback:
      "Without it, /api/billing/* returns 503 and the legacy subscription_status simulator handles plan gating.",
    docsUrl: "https://dashboard.stripe.com/apikeys",
  },

  // ─── actions ────────────────────────────────────────────────────────────
  {
    id: "apollo",
    label: "Apollo.io",
    description: "Autonomous lead prospecting for the `prospect_leads` action type.",
    group: "actions",
    required: false,
    envVars: ["APOLLO_API_KEY", "APOLLO_CLIENT_ID", "APOLLO_CLIENT_SECRET"],
    fallback:
      "Set APOLLO_API_KEY for platform prospecting, and/or APOLLO_CLIENT_ID + APOLLO_CLIENT_SECRET for per-tenant OAuth in Admin.",
    docsUrl: "https://app.apollo.io/#/settings/integrations/api",
  },
  {
    id: "docusign",
    label: "DocuSign",
    description: "E-signature for the `send_contract` action type.",
    group: "actions",
    required: false,
    envVars: ["DOCUSIGN_ACCOUNT_ID"],
    fallback:
      "Without ACCOUNT_ID + (JWT_TOKEN or ACCESS_TOKEN), sendContract() logs a warning and the operator-approval draft path still runs.",
  },
  {
    id: "salesforce",
    label: "Salesforce CRM",
    description: "Bi-directional contact + opportunity sync via OAuth 2.0 Web Server flow.",
    group: "actions",
    required: false,
    envVars: ["SALESFORCE_CLIENT_ID", "SALESFORCE_CLIENT_SECRET"],
    fallback:
      "Operators connect via Admin → Integrations → Salesforce. Without CLIENT_ID/SECRET the 'Connect Salesforce' button is hidden.",
    docsUrl: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/",
  },
  {
    id: "hubspot",
    label: "HubSpot CRM",
    description: "Bi-directional contact + deal sync via OAuth 2.0 authorization_code flow.",
    group: "actions",
    required: false,
    envVars: ["HUBSPOT_CLIENT_ID", "HUBSPOT_CLIENT_SECRET"],
    fallback:
      "Operators connect via Admin → Integrations → HubSpot. Without CLIENT_ID/SECRET the 'Connect HubSpot' button is hidden.",
    docsUrl: "https://developers.hubspot.com/docs/api/overview",
  },
  {
    id: "twilio",
    label: "Wireline Messaging Network",
    description: "Texting, number intelligence, and manager alerts for agent workflows.",
    group: "actions",
    required: false,
    envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    fallback:
      "Without messaging credentials, Wireline texting, phone lookups, and manager alerts stay disabled while voice agents continue to run.",
  },
  {
    id: "slack",
    label: "Slack",
    description:
      "Real-time team notifications — agent books a meeting, closes a deal, or escalates.",
    group: "actions",
    required: false,
    envVars: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
    fallback:
      "Set SLACK_CLIENT_ID/SECRET once on Vercel. Tenants only click Connect in Admin → Integrations (OAuth).",
    docsUrl: "https://api.slack.com/apps",
  },
  {
    id: "zoom",
    label: "Zoom",
    description: "Auto-generates meeting links when agents book calendar appointments.",
    group: "actions",
    required: false,
    envVars: ["ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"],
    fallback:
      "Operators connect via Admin → Integrations → Zoom. Without CLIENT_ID/SECRET the 'Connect Zoom' button is hidden.",
    docsUrl: "https://marketplace.zoom.us/develop/create",
  },
  {
    id: "shopify",
    label: "Shopify",
    description:
      "Per-store OAuth — voice agents can look up orders/customers, check inventory, start returns, cancel unshipped orders, fix addresses, create draft orders, and add merchant notes.",
    group: "actions",
    required: false,
    envVars: ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"],
    fallback:
      "Operators connect a myshopify.com store in Admin → Integrations. Without CLIENT_ID/SECRET the Connect Shopify button is hidden.",
    docsUrl: "https://shopify.dev/docs/apps/build/authentication-authorization",
  },
  {
    id: "microsoft-teams",
    label: "Microsoft Teams",
    description:
      "Posts call alerts to the operator's default Teams channel via Microsoft Graph (separate OAuth from Outlook mail).",
    group: "actions",
    required: false,
    envVars: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    fallback:
      "Uses the same Azure app as Outlook. Operators connect Teams in Admin → Integrations → Microsoft Teams.",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/channel-post-messages",
  },
  {
    id: "microsoft-excel",
    label: "Microsoft Excel (OneDrive)",
    description:
      "Appends call rows to a managed Wireline Call Log workbook in the operator's OneDrive.",
    group: "actions",
    required: false,
    envVars: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    fallback:
      "Uses the same Azure app registration. Operators connect Excel logging in Admin → Integrations.",
    docsUrl: "https://learn.microsoft.com/en-us/graph/api/table-post-rows",
  },
  {
    id: "meta",
    label: "Meta (Facebook + Instagram Ads)",
    description:
      "OAuth + Lead Ads webhook ingest + Conversions API (Schedule/Lead events). Connect in Admin → Integrations; set META_PIXEL_ID + META_CAPI_ACCESS_TOKEN for attribution.",
    group: "actions",
    required: false,
    envVars: ["META_APP_ID", "META_APP_SECRET"],
    fallback:
      "Without META_APP_ID/SECRET the Connect button is hidden. CAPI also needs META_PIXEL_ID and META_CAPI_ACCESS_TOKEN on the platform deployment.",
    docsUrl: "https://developers.facebook.com/apps",
  },

  // ─── infra ──────────────────────────────────────────────────────────────
  {
    id: "upstash-redis",
    label: "Upstash Redis",
    description:
      "Distributed rate-limit and spend-cap counters. Strongly recommended on serverless.",
    group: "infra",
    required: false,
    envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    fallback:
      "Without it, rate limits fall back to per-process in-memory state. On Vercel this means near-zero protection against runaway spend.",
    docsUrl: "https://console.upstash.com",
  },

  // ─── security ───────────────────────────────────────────────────────────
  {
    id: "secret-vault",
    label: "Secret Vault",
    description: "AES-256-GCM encryption-at-rest for webhook signing secrets.",
    group: "security",
    required: false,
    envVars: ["WIRELINE_DATA_KEY"],
    fallback:
      "Without it, POST/PATCH /api/webhooks with a signing secret returns 503 VAULT_UNCONFIGURED.",
  },
] as const;

/** Pretty group labels for UI rendering. */
export const GROUP_LABELS: Record<IntegrationGroup, string> = {
  core: "Core",
  ai: "AI",
  voice: "Voice",
  oauth: "OAuth",
  billing: "Billing",
  actions: "Action Engine",
  infra: "Infrastructure",
  security: "Security",
};

export interface IntegrationStatusResult {
  id: string;
  label: string;
  description: string;
  group: IntegrationGroup;
  required: boolean;
  status: IntegrationStatus;
  /** Per-env-var presence map so the UI can show *which* var is missing. */
  envVars: Array<{ name: string; present: boolean }>;
  fallback?: string;
  docsUrl?: string;
}

function envIsPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

/**
 * Special-case overrides for integrations whose "configured" check is not a
 * pure env-presence test (Anthropic delegates to claudeBrain to stay
 * consistent with the rest of the server; DocuSign needs either JWT or
 * access token alongside the account id; Sentry can be partially configured).
 */
function evaluateStatus(d: IntegrationDescriptor): IntegrationStatus {
  switch (d.id) {
    case "anthropic":
      return claudeBrain.isClaudeAvailable() ? "configured" : "missing";
    case "docusign": {
      const haveAccount = envIsPresent("DOCUSIGN_ACCOUNT_ID");
      const haveToken = envIsPresent("DOCUSIGN_JWT_TOKEN") || envIsPresent("DOCUSIGN_ACCESS_TOKEN");
      return haveAccount && haveToken ? "configured" : "missing";
    }
    case "salesforce": {
      const haveOAuth =
        envIsPresent("SALESFORCE_CLIENT_ID") && envIsPresent("SALESFORCE_CLIENT_SECRET");
      return haveOAuth ? "configured" : "missing";
    }
    case "hubspot": {
      const haveOAuth = envIsPresent("HUBSPOT_CLIENT_ID") && envIsPresent("HUBSPOT_CLIENT_SECRET");
      return haveOAuth ? "configured" : "missing";
    }
    case "apollo":
      return apolloPlatformConfigured() ? "configured" : "missing";
    case "upstash-redis": {
      const have =
        envIsPresent("UPSTASH_REDIS_REST_URL") && envIsPresent("UPSTASH_REDIS_REST_TOKEN");
      if (have) return "configured";
      return process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT === "true" ? "fallback" : "missing";
    }
    default:
      return d.envVars.every(envIsPresent) ? "configured" : "missing";
  }
}

/**
 * Snapshot the configuration status of every registered integration.
 * Pure read of process.env — safe to call from any request handler.
 */
export function getIntegrationsStatus(): IntegrationStatusResult[] {
  return INTEGRATIONS.map((d) => ({
    id: d.id,
    label: d.label,
    description: d.description,
    group: d.group,
    required: d.required,
    status: evaluateStatus(d),
    envVars: d.envVars.map((name) => ({ name, present: envIsPresent(name) })),
    fallback: d.fallback,
    docsUrl: d.docsUrl,
  }));
}

/**
 * Back-compat capability flags surfaced by GET /api/health. Keys are stable —
 * external monitors may depend on them.
 */
export function getHealthCapabilities() {
  return {
    claude: claudeBrain.isClaudeAvailable(),
    gemini: envIsPresent("GEMINI_API_KEY"),
    vapi: envIsPresent("VAPI_PRIVATE_KEY"),
    drizzle: envIsPresent("POSTGRES_URL"),
    google_oauth: envIsPresent("GOOGLE_CLIENT_ID"),
    microsoft_oauth: envIsPresent("MICROSOFT_CLIENT_ID"),
    stripe: envIsPresent("STRIPE_SECRET_KEY"),
    apollo: apolloPlatformConfigured(),
    docusign:
      envIsPresent("DOCUSIGN_ACCOUNT_ID") &&
      (envIsPresent("DOCUSIGN_JWT_TOKEN") || envIsPresent("DOCUSIGN_ACCESS_TOKEN")),
    salesforce: envIsPresent("SALESFORCE_CLIENT_ID") && envIsPresent("SALESFORCE_CLIENT_SECRET"),
    hubspot: envIsPresent("HUBSPOT_CLIENT_ID") && envIsPresent("HUBSPOT_CLIENT_SECRET"),
    twilio: envIsPresent("TWILIO_ACCOUNT_SID") && envIsPresent("TWILIO_AUTH_TOKEN"),
    upstash: envIsPresent("UPSTASH_REDIS_REST_URL") && envIsPresent("UPSTASH_REDIS_REST_TOKEN"),
    secret_vault: envIsPresent("WIRELINE_DATA_KEY"),
    shopify: envIsPresent("SHOPIFY_CLIENT_ID") && envIsPresent("SHOPIFY_CLIENT_SECRET"),
    microsoft_teams: microsoftGraphConfigured(),
    microsoft_excel: microsoftGraphConfigured(),
    slack: slackOAuthConfigured(),
    meta: envIsPresent("META_APP_ID") && envIsPresent("META_APP_SECRET"),
  };
}
