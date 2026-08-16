/**
 * Per-route head metadata for build-time prerendering of the public SPA.
 *
 * The app is a client-rendered SPA: on Vercel, `vercel.json` rewrites routes
 * to the static `/index.html` served straight from the CDN, and per-page
 * `<title>`/description/canonical/robots/OG/Twitter tags are otherwise applied
 * client-side by `PageMeta` (`src/lib/page-meta.tsx`). Social/link crawlers and
 * first-wave search indexing do not reliably execute JS, so campaign pages need
 * route-specific share metadata and account/transition pages need `noindex`
 * before hydration.
 *
 * `scripts/prerender-marketing-meta.mts` runs after `vite build` and writes a
 * per-route `dist/<route>/index.html` with these values injected. Vercel serves
 * filesystem matches before applying rewrites, so crawlers get the intended
 * head. After hydration, `PageMeta` keeps the head in sync exactly as before.
 *
 * The `/for/:slug` values come straight from `WEDGES` so there is one source of
 * truth; inline-page values below are kept verbatim in sync with each page's
 * `PageMeta` call by `tests/marketing-route-meta-contract.test.ts`.
 */
import { WEDGES, type VerticalKey } from "../data/vertical-wedges";

const SITE_URL = "https://trywireline.com";
const BRAND_SUFFIX = " | Wireline";

/** Exact static strings in `index.html` that carry the homepage defaults. */
export const HOME_TITLE = "Wireline | Voice agents that get the work done";
export const HOME_DESCRIPTION =
  "Build one for your business or your life. It can call, answer, text, email, book, and follow through while you stay in control.";
const HOME_CANONICAL_TAG = '<link rel="canonical" href="https://trywireline.com/" />';
const HOME_OG_URL_TAG = '<meta property="og:url" content="https://trywireline.com/" />';
const HOME_ROBOTS_TAG =
  '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />';
const HOME_GOOGLEBOT_TAG =
  '<meta name="googlebot" content="index, follow, max-image-preview:large" />';

export interface RouteMeta {
  title: string;
  description: string;
  canonical: string;
  noIndex?: boolean;
}

type StaticRouteMeta = {
  title: string;
  description: string;
  canonicalPath?: string;
  noIndex?: boolean;
};

/** Mirror `PageMeta`'s brand-suffix rule so server + client titles match. */
function withBrand(title: string): string {
  return /\bWireline\b/i.test(title) ? title : `${title}${BRAND_SUFFIX}`;
}

/**
 * Commercial routes whose meta lives inline in their page component, kept
 * verbatim in sync with each page's `PageMeta` call (contract-tested).
 * `/for/*` is intentionally absent here because it derives from `WEDGES`.
 */
const STATIC_ROUTE_META: Record<string, StaticRouteMeta> = {
  "/pricing": {
    title: "Pricing | Wireline Voice Agents from $19/month",
    description:
      "Build a voice agent free, launch from $19/month, and optionally add Live Video for business agents. Included numbers, voice capacity, SMS, email, Lead Hunt, and prepaid usage controls stay clear.",
  },
  "/features": {
    title: "Features | Wireline Voice Agents",
    description:
      "Build and train voice agents that call, text, email, book, follow up, update connected systems, and log outcomes under shared rules and memory.",
  },
  "/compare": {
    title: "Why Wireline",
    description:
      "Compare Wireline's owner ready voice agent with per agent, per call, and developer voice infrastructure pricing.",
  },
  "/about": {
    title: "About Wireline | Voice Agents for Calls and Follow up",
    description:
      "Wireline is an independent voice agent platform. How we build, what we enforce in the runtime, and how to reach the people who make it.",
  },
  "/showcase": {
    title: "Try Wireline",
    description:
      "Hear the voice agent your customers will meet first, then build one for voice, SMS, and email.",
  },
  "/blog": {
    title: "Wireline Notes | Voice agent guides for small business phone coverage",
    description:
      "Practical guides for voice agents: appointment booking, support queues, handoff boundaries, and getting routine phone work off your plate.",
  },
  "/support": {
    title: "Support | Wireline",
    description: "Get help with Wireline for personal call support or business call coverage.",
  },
  "/contact": {
    title: "Contact Wireline",
    description:
      "Talk to Wireline about personal call coverage, team rollout, partnerships, or support.",
  },
  "/status": {
    title: "Provider Status | Wireline",
    description:
      "Live access checks for Wireline's managed voice control plane and reasoning runtime. Page refreshes every 60 seconds.",
  },
  "/security": {
    title: "Security and Compliance | Wireline",
    description:
      "How Wireline handles encryption, tenant isolation, browser privacy, call compliance, billing safety, and honest security proof.",
  },
  "/trust": {
    title: "Trust Center | Wireline",
    description:
      "How Wireline handles encryption, tenant isolation, browser privacy, call compliance, billing safety, and honest security proof.",
  },
  "/trust/medical": {
    title: "Trust Pack: Healthcare sensitive workflows | Wireline",
    description:
      "Controls before credentials. A practical review of the safeguards available today, with explicit boundaries for protected health information.",
  },
  "/trust/legal": {
    title: "Trust Pack: Legal and professional services | Wireline",
    description:
      "Confidentiality aware, never presumptive. Controls for structured intake and client communication without pretending software can determine privilege, conflicts, or legal advice.",
  },
  "/trust/insurance": {
    title: "Trust Pack: Insurance agencies | Wireline",
    description:
      "Logged work, licensed decisions. Operational controls for policyholder communication while keeping regulated advice and carrier specific decisions with qualified people.",
  },
  "/trust/enterprise": {
    title: "Trust Pack: Enterprise review | Wireline",
    description:
      "Proof that matches the product. A concise starting point for security, procurement, and operations teams evaluating Wireline today.",
  },
  "/developers": {
    title: "Developer Portal | Wireline",
    description:
      "Wireline MCP apps for ChatGPT, Claude, and Cursor. Draft and simulate with an account bound connector, then continue in Studio. No public API keys.",
  },
  "/changelog": {
    title: "Changelog | Wireline",
    description:
      "Every shipped improvement to Wireline: features, infrastructure, polish, security. Updated when we ship.",
  },
  "/privacy": {
    title: "Privacy Policy",
    description:
      "Privacy for Wireline's voice agent platform: account, conversation, authorized voice, billing, and measurement data. Last updated August 1, 2026.",
  },
  "/terms": {
    title: "Terms of Service",
    description:
      "Wireline's terms of service: acceptable use, authorized synthetic voices, billing, telemarketing compliance, messaging, privacy, and governing law. Last updated August 1, 2026.",
  },
  "/solutions/sales": {
    title: "Every good lead gets a next step | Wireline",
    description:
      "Give a trained voice agent your offer, qualification rules, calendar, and follow up. It calls, texts, and emails until the next step is booked or clearly logged.",
  },
  "/solutions/support": {
    title: "A front desk that answers before demand goes cold | Wireline",
    description:
      "Give a trained voice agent your policies, calendar, and handoff rules. It answers calls, texts, and email, then resolves or routes the next step.",
  },
};

/**
 * Account and transition routes are publicly reachable but must never be search
 * results. Their client components already set `PageMeta noIndex`; this registry
 * closes the pre-hydration gap and gives aliases one canonical destination.
 */
const NON_INDEXED_ROUTE_META: Record<string, StaticRouteMeta> = {
  "/signin": {
    title: "Sign in",
    description: "Access your Wireline account.",
    noIndex: true,
  },
  "/signup": {
    title: "Create your account",
    description: "Create a Wireline account and build your first voice agent.",
    noIndex: true,
  },
  "/get-started": {
    title: "Create your account",
    description: "Create a Wireline account and build your first voice agent.",
    canonicalPath: "/signup",
    noIndex: true,
  },
  "/auth": {
    title: "Sign in",
    description: "Access your Wireline account.",
    canonicalPath: "/signin",
    noIndex: true,
  },
  "/login": {
    title: "Sign in",
    description: "Access your Wireline account.",
    canonicalPath: "/signin",
    noIndex: true,
  },
  "/reset": {
    title: "Sign in",
    description: "Access your Wireline account.",
    canonicalPath: "/signin",
    noIndex: true,
  },
  "/reset-password": {
    title: "Reset your password",
    description: "Choose a new password for your Wireline account.",
    noIndex: true,
  },
  "/accept-invite": {
    title: "Accept your invitation",
    description: "Join the Wireline workspace that invited you.",
    noIndex: true,
  },
  "/onboarding": {
    title: "Set up Wireline",
    description: "Finish configuring your Wireline workspace.",
    noIndex: true,
  },
  "/auth/oauth-complete": {
    title: "Completing sign in",
    description: "Wireline is completing your secure sign in.",
    noIndex: true,
  },
  "/oauth-complete": {
    title: "Completing sign in",
    description: "Wireline is completing your secure sign in.",
    canonicalPath: "/auth/oauth-complete",
    noIndex: true,
  },
  "/404": {
    title: "Page not found",
    description: "The requested Wireline page could not be found.",
    noIndex: true,
  },
  "/not-found": {
    title: "Page not found",
    description: "The requested Wireline page could not be found.",
    canonicalPath: "/404",
    noIndex: true,
  },
};

/** Every route for which the build emits a route-specific static shell. */
export const PRERENDERED_ROUTE_SHELLS: readonly string[] = [
  ...Object.keys(WEDGES).map((slug) => `/for/${slug}`),
  ...Object.keys(STATIC_ROUTE_META),
  ...Object.keys(NON_INDEXED_ROUTE_META),
];

/** Resolve per-route public meta, or `null` to serve the static HTML as-is. */
export function resolveRouteMeta(pathname: string): RouteMeta | null {
  if (typeof pathname !== "string" || !pathname) return null;
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (clean === "/") return null;

  const forMatch = clean.match(/^\/for\/([a-z-]+)$/);
  if (forMatch) {
    const wedge = WEDGES[forMatch[1] as VerticalKey];
    if (!wedge) return null;
    return {
      title: withBrand(wedge.metaTitle),
      description: wedge.metaDescription,
      canonical: `${SITE_URL}${clean}`,
    };
  }

  const staticMeta = STATIC_ROUTE_META[clean] ?? NON_INDEXED_ROUTE_META[clean];
  if (staticMeta) {
    return {
      title: withBrand(staticMeta.title),
      description: staticMeta.description,
      canonical: `${SITE_URL}${staticMeta.canonicalPath ?? clean}`,
      ...(staticMeta.noIndex ? { noIndex: true } : {}),
    };
  }

  return null;
}

/** Minimal HTML-escaping for values placed into text content and attributes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Rewrite the homepage defaults in the static shell with `meta`. Exact-string
 * replacement keeps unrelated markup, JSON-LD, and hashed asset tags intact.
 */
export function injectMarketingMeta(html: string, meta: RouteMeta): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const robots = meta.noIndex
    ? '<meta name="robots" content="noindex, nofollow" />'
    : HOME_ROBOTS_TAG;
  const googlebot = meta.noIndex
    ? '<meta name="googlebot" content="noindex, nofollow" />'
    : HOME_GOOGLEBOT_TAG;

  return html
    .split(HOME_TITLE)
    .join(title)
    .split(HOME_DESCRIPTION)
    .join(description)
    .replace(HOME_CANONICAL_TAG, `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`)
    .replace(HOME_OG_URL_TAG, `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`)
    .replace(HOME_ROBOTS_TAG, robots)
    .replace(HOME_GOOGLEBOT_TAG, googlebot);
}
