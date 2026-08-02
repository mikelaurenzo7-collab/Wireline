/**
 * Per-route head metadata for build-time prerendering of the marketing SPA.
 *
 * The app is a client-rendered SPA: on Vercel, `vercel.json` rewrites every
 * marketing route to the static `/index.html` served straight from the CDN,
 * and per-page `<title>`/description/canonical/OG/Twitter tags are only
 * applied client-side by `PageMeta` (`src/lib/page-meta.tsx`). Social/link
 * crawlers (X, LinkedIn, Slack, Facebook, iMessage, Discord) do not execute
 * JS, so every share of a campaign landing page (`/for/*`, `/pricing`,
 * `/solutions/*`, …) unfurled as the generic homepage card, and every page's
 * raw canonical pointed at `/` (a duplicate-content risk for the exact pages
 * paid campaigns target).
 *
 * `scripts/prerender-marketing-meta.mts` runs after `vite build` and writes a
 * per-route `dist/<route>/index.html` with these values injected. Vercel
 * serves filesystem matches before applying rewrites, so crawlers get the
 * right head; if a file were ever missing, the SPA rewrite still serves the
 * generic shell — the failure mode is the status quo, never a broken page.
 * After hydration, `PageMeta` keeps the head in sync exactly as before.
 *
 * The `/for/:slug` values come straight from `WEDGES` so there is one source
 * of truth; the handful of inline-page values below are kept verbatim in sync
 * with each page's `PageMeta` call by `tests/marketing-route-meta-contract.test.ts`.
 */
import { WEDGES, type VerticalKey } from "../data/vertical-wedges";

const SITE_URL = "https://trywireline.com";
const BRAND_SUFFIX = " | Wireline";

/** Exact static strings in `index.html` that carry the homepage defaults. */
export const HOME_TITLE = "Wireline | Voice agents that get work done";
export const HOME_DESCRIPTION =
  "Build one for your business or your life. It can call, answer, text, email, book, and follow through while you stay in control.";
const HOME_CANONICAL_TAG =
  '<link rel="canonical" href="https://trywireline.com/" />';
const HOME_OG_URL_TAG =
  '<meta property="og:url" content="https://trywireline.com/" />';

export interface RouteMeta {
  title: string;
  description: string;
  canonical: string;
}

/** Mirror `PageMeta`'s brand-suffix rule so server + client titles match. */
function withBrand(title: string): string {
  return /\bWireline\b/i.test(title) ? title : `${title}${BRAND_SUFFIX}`;
}

/**
 * Commercial routes whose meta lives inline in their page component, kept
 * verbatim in sync with each page's `PageMeta` call (contract-tested).
 * `/for/*` is intentionally absent here — it derives from `WEDGES`.
 */
const STATIC_ROUTE_META: Record<
  string,
  { title: string; description: string }
> = {
  "/pricing": {
    title: "Pricing | Wireline Voice Agents from $19/month",
    description:
      "Build a voice agent free, then launch from $19/month with an included Wireline number, voice capacity, SMS, email, Lead Hunt, and prepaid usage controls.",
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
    title: "About Wireline | Voice Agents for Calls and Follow-up",
    description:
      "Wireline is a customizable agent platform built for calls, texts, follow-up, browser context, email, and integrations.",
  },
  "/showcase": {
    title: "Try Wireline",
    description:
      "Hear the voice agent your customers will meet first, then build one for voice, SMS, and email.",
  },
  "/blog": {
    title:
      "Wireline Notes | Voice agent guides for small business phone coverage",
    description:
      "Practical guides for voice agents: appointment booking, support queues, handoff boundaries, and getting routine phone work off your plate.",
  },
  "/support": {
    title: "Support | Wireline",
    description:
      "Get help with Wireline for personal call support or business call coverage.",
  },
  "/contact": {
    title: "Contact Wireline",
    description:
      "Talk to Wireline about personal call coverage, team rollout, partnerships, or support.",
  },
  "/status": {
    title: "System Status | Wireline",
    description:
      "Live operational status of Wireline's voice runtime, fallback path, and reasoning layer. Updated every 60 seconds.",
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
  "/developers": {
    title: "Developer Portal | Wireline",
    description:
      "Wireline MCP apps for ChatGPT, Claude, and Cursor — account-bound draft, simulate, and continue in Studio. No public API keys.",
  },
  "/changelog": {
    title: "Changelog | Wireline",
    description:
      "Every shipped improvement to Wireline: features, infrastructure, polish, security. Updated when we ship.",
  },
  "/privacy": {
    title: "Privacy Policy",
    description:
      "Privacy for Wireline's AI voice agent platform: account, conversation, authorized voice, billing, and measurement data. Last updated August 1, 2026.",
  },
  "/terms": {
    title: "Terms of Service",
    description:
      "Wireline's terms of service — acceptable use, authorized synthetic voices, billing, telemarketing compliance, messaging, privacy, and governing law. Last updated August 1, 2026.",
  },
  "/solutions/sales": {
    title: "Every good lead gets a next step. | Wireline",
    description:
      "Give a trained voice agent your offer, qualification rules, calendar, and follow up. It calls, texts, and emails until the next step is booked or clearly logged.",
  },
  "/solutions/support": {
    title: "A front desk that answers before demand goes cold. | Wireline",
    description:
      "Give a trained voice agent your policies, calendar, and handoff rules. It answers calls, texts, and email, then resolves or routes the next step.",
  },
};

/** Every route the build prerenders — the campaign/commercial landing set. */
export const PRERENDERED_MARKETING_ROUTES: readonly string[] = [
  ...Object.keys(WEDGES).map((slug) => `/for/${slug}`),
  ...Object.keys(STATIC_ROUTE_META),
];

/** Resolve per-route marketing meta, or `null` to serve the static HTML as-is. */
export function resolveRouteMeta(pathname: string): RouteMeta | null {
  if (typeof pathname !== "string" || !pathname) return null;
  // Normalize: drop query/hash (defensive) and trailing slashes.
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (clean === "/") return null; // homepage defaults are already correct

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

  const staticMeta = STATIC_ROUTE_META[clean];
  if (staticMeta) {
    return {
      title: withBrand(staticMeta.title),
      description: staticMeta.description,
      canonical: `${SITE_URL}${clean}`,
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
 * Rewrite the homepage title/description/canonical/OG/Twitter tags in the
 * static HTML shell with `meta`. Uses exact-string replacement of the known
 * homepage values (each appears only in its meta tags), so it never touches
 * unrelated markup, the JSON-LD graph, or the hashed asset tags.
 */
export function injectMarketingMeta(html: string, meta: RouteMeta): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  return html
    .split(HOME_TITLE)
    .join(title) // <title>, og:title, twitter:title
    .split(HOME_DESCRIPTION)
    .join(description) // description, og:description, twitter:description
    .replace(
      HOME_CANONICAL_TAG,
      `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
    )
    .replace(
      HOME_OG_URL_TAG,
      `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
    );
}
