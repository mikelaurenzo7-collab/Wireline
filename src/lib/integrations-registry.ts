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

export type IntegrationStatus = "configured" | "missing" | "fallback";

export type IntegrationGroup =
  | "core"          // app cannot function without these
  | "ai"            // LLM providers
  | "voice"         // voice provider
  | "oauth"         // OAuth-based identity / mailbox connections
  | "billing"       // payment provider
  | "actions"       // optional integrations wired into the Action Engine
  | "infra"         // rate-limit / observability / data-plane plumbing
  | "security";     // crypto / secret material

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
    id: "supabase",
    label: "Supabase",
    description: "Postgres database, RLS, and auth.",
    group: "core",
    required: true,
    envVars: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    docsUrl: "https://supabase.com/docs",
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
    description: "Legacy fallback for non-Claude paths and the live voice model.",
    group: "ai",
    required: true,
    envVars: ["GEMINI_API_KEY"],
    docsUrl: "https://aistudio.google.com/app/apikey",
  },

  // ─── voice ──────────────────────────────────────────────────────────────
  {
    id: "vapi",
    label: "Wireline Voice Network",
    description: "Inbound and outbound phone calls on your Wireline numbers.",
    group: "voice",
    required: true,
    envVars: ["VAPI_PRIVATE_KEY", "VITE_VAPI_PUBLIC_KEY"],
  },

  // ─── oauth ──────────────────────────────────────────────────────────────
  {
    id: "google-oauth",
    label: "Google OAuth / Gmail",
    description: "Connects operator Gmail mailboxes for the email agent and Daily Brief delivery.",
    group: "oauth",
    required: false,
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    fallback: "Without it, Gmail-based email agents and the scheduled Daily Brief email are disabled.",
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
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
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
    envVars: ["APOLLO_API_KEY"],
    fallback: "Without it, searchLeads()/enrichLead() return empty and the prospecting recipe is a no-op.",
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
    description: "Bi-directional contact + opportunity sync for voice and email agents.",
    group: "actions",
    required: false,
    envVars: ["SALESFORCE_INSTANCE_URL", "SALESFORCE_ACCESS_TOKEN"],
    fallback:
      "Current server-side sync needs SALESFORCE_INSTANCE_URL + SALESFORCE_ACCESS_TOKEN. Connected App client credentials stay documented for the future OAuth refresh-token flow.",
    docsUrl: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/",
  },
  {
    id: "hubspot",
    label: "HubSpot CRM",
    description: "Bi-directional contact + deal sync for voice and email agents.",
    group: "actions",
    required: false,
    envVars: ["HUBSPOT_ACCESS_TOKEN"],
    fallback:
      "Without an access token, CRM actions (log_call, sync_contact, create_deal) return no-op. Agents still function without CRM.",
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

  // ─── infra ──────────────────────────────────────────────────────────────
  {
    id: "upstash-redis",
    label: "Upstash Redis",
    description: "Distributed rate-limit and spend-cap counters. Strongly recommended on serverless.",
    group: "infra",
    required: false,
    envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    fallback:
      "Without it, rate limits fall back to per-process in-memory state. On Vercel this means near-zero protection against runaway spend.",
    docsUrl: "https://console.upstash.com",
  },
  {
    id: "sentry",
    label: "Sentry",
    description: "Backend + frontend error monitoring and release source maps.",
    group: "infra",
    required: false,
    envVars: ["SENTRY_DSN", "VITE_SENTRY_DSN"],
    fallback: "Without it, exceptions only surface in runtime logs — no alerting, no aggregation.",
    docsUrl: "https://sentry.io/",
  },

  // ─── security ───────────────────────────────────────────────────────────
  {
    id: "secret-vault",
    label: "Secret Vault",
    description: "AES-256-GCM encryption-at-rest for webhook signing secrets.",
    group: "security",
    required: false,
    envVars: ["WIRELINE_DATA_KEY"],
    fallback: "Without it, POST/PATCH /api/webhooks with a signing secret returns 503 VAULT_UNCONFIGURED.",
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
      const haveInstance = envIsPresent("SALESFORCE_INSTANCE_URL");
      const haveToken = envIsPresent("SALESFORCE_ACCESS_TOKEN");
      const haveConnectedApp = envIsPresent("SALESFORCE_CLIENT_ID") && envIsPresent("SALESFORCE_CLIENT_SECRET");
      if (haveInstance && haveToken) return "configured";
      if (haveInstance || haveToken || haveConnectedApp) return "fallback";
      return "missing";
    }
    case "sentry": {
      const be = envIsPresent("SENTRY_DSN");
      const fe = envIsPresent("VITE_SENTRY_DSN");
      if (be && fe) return "configured";
      if (be || fe) return "fallback";
      return "missing";
    }
    case "upstash-redis": {
      const have = envIsPresent("UPSTASH_REDIS_REST_URL") && envIsPresent("UPSTASH_REDIS_REST_TOKEN");
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
    claude:          claudeBrain.isClaudeAvailable(),
    gemini:          envIsPresent("GEMINI_API_KEY"),
    vapi:            envIsPresent("VAPI_PRIVATE_KEY"),
    supabase:        envIsPresent("VITE_SUPABASE_URL"),
    google_oauth:    envIsPresent("GOOGLE_CLIENT_ID"),
    microsoft_oauth: envIsPresent("MICROSOFT_CLIENT_ID"),
    stripe:          envIsPresent("STRIPE_SECRET_KEY"),
    apollo:          envIsPresent("APOLLO_API_KEY"),
    docusign:        envIsPresent("DOCUSIGN_ACCOUNT_ID") &&
                       (envIsPresent("DOCUSIGN_JWT_TOKEN") || envIsPresent("DOCUSIGN_ACCESS_TOKEN")),
    twilio:          envIsPresent("TWILIO_ACCOUNT_SID") && envIsPresent("TWILIO_AUTH_TOKEN"),
    upstash:         envIsPresent("UPSTASH_REDIS_REST_URL") && envIsPresent("UPSTASH_REDIS_REST_TOKEN"),
    sentry:          envIsPresent("SENTRY_DSN") || envIsPresent("VITE_SENTRY_DSN"),
    secret_vault:    envIsPresent("WIRELINE_DATA_KEY"),
  };
}
