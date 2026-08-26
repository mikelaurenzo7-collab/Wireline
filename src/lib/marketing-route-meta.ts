import { WEDGES, type VerticalKey } from "../data/vertical-wedges";
import { BOTBOUND_BRAND_NAME, BOTBOUND_PRODUCTION_ORIGIN } from "./brand";

// Public crawl/social metadata is permanently canonical to the BotBound brand
// origin. APP_URL remains independently configurable for provider callbacks.
export const SITE_URL = BOTBOUND_PRODUCTION_ORIGIN;
const BRAND_SUFFIX = ` | ${BOTBOUND_BRAND_NAME}`;
export const HOME_TITLE = "BotBound | Put Your Bot on the Line";
export const HOME_DESCRIPTION = "Your Bot for calls, texts, and email.";
const HOME_ROBOTS_TAG =
  '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />';
const HOME_GOOGLEBOT_TAG =
  '<meta name="googlebot" content="index, follow, max-image-preview:large" />';

/** Customer-facing wedge slugs; stored wedge keys remain compatibility-safe. */
export function publicWedgeSlug(key: VerticalKey): string {
  return key === "personal" ? "everyday" : key;
}

function wedgeKeyForPublicSlug(slug: string): VerticalKey | null {
  if (slug === "everyday" || slug === "personal") return "personal";
  return slug in WEDGES ? (slug as VerticalKey) : null;
}

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

export function withBotBoundBrand(value: string): string {
  return value
    .replace(/\bWIRELINE\b/g, BOTBOUND_BRAND_NAME)
    .replace(/\bWireline\b/gi, BOTBOUND_BRAND_NAME);
}

function withBrand(title: string): string {
  const branded = withBotBoundBrand(title);
  return branded.toLowerCase().includes(BOTBOUND_BRAND_NAME.toLowerCase())
    ? branded
    : `${branded}${BRAND_SUFFIX}`;
}

const STATIC_ROUTE_META: Record<string, StaticRouteMeta> = {
  "/pricing": {
    title: "PRICING | BOTBOUND VOICE BOTS FROM $19/MONTH",
    description:
      "Build a voice-first Bot free and launch from $19/month. Included numbers, voice capacity, text, email, Lead Hunt, and prepaid usage controls stay clear.",
  },
  "/features": {
    title: "FEATURES | BOTBOUND VOICE BOTS",
    description:
      "Build and train a voice-first Bot that calls, holds natural conversations, texts, emails, books, follows up, updates connected systems, and logs outcomes under shared rules and memory.",
  },
  "/compare": {
    title: "WHY BOTBOUND | COMPARE BOTS",
    description:
      "Compare BotBound's Bot workspace with per-agent, per-call, and developer voice infrastructure pricing.",
  },
  "/about": {
    title: "ABOUT BOTBOUND | BOTS FOR CALLS AND FOLLOW-THROUGH",
    description:
      "BotBound is an independent platform for Phone Bots, Conversation Bots, Human Bots, and role-based Bots. See how we build, what the runtime enforces, and how to reach the people who make it.",
  },
  "/showcase": {
    title: "TRY BOTBOUND | HEAR A PHONE BOT",
    description:
      "Hear the Phone Bot first. Then wire one for calls, email, text, and the work that should happen next.",
  },
  "/blog": {
    title: "BOTBOUND NOTES | BOT GUIDES FOR SMALL BUSINESS",
    description:
      "Practical guides for Bots: calling, appointment booking, live conversations, text and email follow-up, support queues, handoff boundaries, and getting routine communication work off your plate.",
  },
  "/support": {
    title: "Support | BotBound",
    description: "Get help building, training, launching, or running a BotBound Bot.",
  },
  "/contact": {
    title: "Contact BotBound",
    description: "Talk to BotBound about building a Bot, a team rollout, partnerships, or support.",
  },
  "/security": {
    title: "Security and Compliance | BotBound",
    description:
      "How BotBound handles encryption, tenant isolation, browser privacy, call compliance, billing safety, and honest security proof.",
  },
  "/trust": {
    title: "Trust Center | BotBound",
    description:
      "How BotBound handles encryption, tenant isolation, browser privacy, call compliance, billing safety, and honest security proof.",
  },
  "/trust/medical": {
    title: "Trust Pack: Healthcare sensitive workflows | BotBound",
    description:
      "Controls before credentials. A practical review of safeguards and explicit boundaries for protected health information.",
  },
  "/trust/legal": {
    title: "Trust Pack: Legal and professional services | BotBound",
    description:
      "Controls for structured intake and client communication without pretending software can determine privilege, conflicts, or legal advice.",
  },
  "/trust/insurance": {
    title: "Trust Pack: Insurance agencies | BotBound",
    description:
      "Operational controls for policyholder communication while regulated advice stays with qualified people.",
  },
  "/trust/enterprise": {
    title: "Trust Pack: Enterprise review | BotBound",
    description:
      "A concise starting point for security, procurement, and operations teams evaluating BotBound.",
  },
  "/developers": {
    title: "DEVELOPER PORTAL | BotBound",
    description:
      "Connect BotBound to ChatGPT, Claude, and Cursor. Create an account, build your first Voice Bot in the chat you already use, then continue in the same BotBound workspace. No public API keys.",
  },
  "/changelog": {
    title: "Changelog | BotBound",
    description:
      "Every shipped improvement to BotBound: features, infrastructure, polish, security. Updated when we ship.",
  },
  "/privacy": {
    title: "Privacy Policy",
    description:
      "Privacy for BotBound's Bot platform: account, conversation, authorized voice, billing, and measurement data. Last updated August 17, 2026.",
  },
  "/terms": {
    title: "Terms of Service",
    description:
      "BotBound's terms of service: acceptable use, authorized synthetic voices, billing, telemarketing compliance, messaging, privacy, and governing law. Last updated August 1, 2026.",
  },
  "/solutions/sales": {
    title: "EVERY GOOD LEAD GETS A NEXT STEP | BotBound",
    description:
      "Give a trained Sales Bot your offer, qualification rules, calendar, and follow-up playbook.",
  },
  "/solutions/support": {
    title: "A FRONT DESK THAT ANSWERS BEFORE DEMAND GOES COLD | BotBound",
    description: "Give a trained Front Desk Bot your policies, calendar, and handoff rules.",
  },
};

const NON_INDEXED_ROUTE_META: Record<string, StaticRouteMeta> = {
  "/signin": {
    title: "Sign in",
    description: "Access your BotBound account.",
    noIndex: true,
  },
  "/signup": {
    title: "Create your account",
    description: "Create a BotBound account and build your first Bot.",
    noIndex: true,
  },
  "/get-started": {
    title: "Create your account",
    description: "Create a BotBound account and build your first Bot.",
    canonicalPath: "/signup",
    noIndex: true,
  },
  "/auth": {
    title: "Sign in",
    description: "Access your BotBound account.",
    canonicalPath: "/signin",
    noIndex: true,
  },
  "/login": {
    title: "Sign in",
    description: "Access your BotBound account.",
    canonicalPath: "/signin",
    noIndex: true,
  },
  "/reset": {
    title: "Sign in",
    description: "Access your BotBound account.",
    canonicalPath: "/signin",
    noIndex: true,
  },
  "/reset-password": {
    title: "Reset your password",
    description: "Choose a new password for your BotBound account.",
    noIndex: true,
  },
  "/accept-invite": {
    title: "Accept your invitation",
    description: "Join the BotBound workspace that invited you.",
    noIndex: true,
  },
  "/onboarding": {
    title: "Set up BotBound",
    description: "Finish configuring your BotBound workspace.",
    noIndex: true,
  },
  "/auth/oauth-complete": {
    title: "Completing sign in",
    description: "BotBound is completing your secure sign in.",
    noIndex: true,
  },
  "/oauth-complete": {
    title: "Completing sign in",
    description: "BotBound is completing your secure sign in.",
    canonicalPath: "/auth/oauth-complete",
    noIndex: true,
  },
  "/404": {
    title: "Page not found",
    description: "The requested BotBound page could not be found.",
    noIndex: true,
  },
  "/not-found": {
    title: "Page not found",
    description: "The requested BotBound page could not be found.",
    canonicalPath: "/404",
    noIndex: true,
  },
};

export const PRERENDERED_ROUTE_SHELLS: readonly string[] = [
  ...Object.keys(WEDGES).map((slug) => `/for/${publicWedgeSlug(slug as VerticalKey)}`),
  "/for/personal",
  ...Object.keys(STATIC_ROUTE_META),
  ...Object.keys(NON_INDEXED_ROUTE_META),
];
export const PRERENDERED_MARKETING_ROUTES = PRERENDERED_ROUTE_SHELLS;

export function resolveRouteMeta(pathname: string): RouteMeta | null {
  if (typeof pathname !== "string" || !pathname) return null;
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (clean === "/") return null;
  const forMatch = clean.match(/^\/for\/([a-z-]+)$/);
  if (forMatch) {
    const wedgeKey = wedgeKeyForPublicSlug(forMatch[1]);
    if (!wedgeKey) return null;
    const wedge = WEDGES[wedgeKey];
    const canonicalPath = `/for/${publicWedgeSlug(wedgeKey)}`;
    return {
      title: withBrand(wedge.metaTitle),
      description: withBotBoundBrand(wedge.metaDescription),
      canonical: `${SITE_URL}${canonicalPath}`,
      ...(clean === "/for/personal" ? { noIndex: true } : {}),
    };
  }
  const staticMeta = STATIC_ROUTE_META[clean] ?? NON_INDEXED_ROUTE_META[clean];
  if (!staticMeta) return null;
  return {
    title: withBrand(staticMeta.title),
    description: withBotBoundBrand(staticMeta.description),
    canonical: `${SITE_URL}${staticMeta.canonicalPath ?? clean}`,
    ...(staticMeta.noIndex ? { noIndex: true } : {}),
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${description}" />`,
    )
    .replace(
      /<link rel="canonical" href="[^"]*" \/>/,
      `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
    )
    .replace(
      /<meta property="og:url" content="[^"]*" \/>/,
      `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
    )
    .replace(
      /<meta property="og:title" content="[^"]*" \/>/,
      `<meta property="og:title" content="${title}" />`,
    )
    .replace(
      /<meta property="og:description" content="[^"]*" \/>/,
      `<meta property="og:description" content="${description}" />`,
    )
    .replace(
      /<meta name="twitter:title" content="[^"]*" \/>/,
      `<meta name="twitter:title" content="${title}" />`,
    )
    .replace(
      /<meta name="twitter:description" content="[^"]*" \/>/,
      `<meta name="twitter:description" content="${description}" />`,
    )
    .replace(/<meta name="robots" content="[^"]*" \/>/, robots)
    .replace(/<meta name="googlebot" content="[^"]*" \/>/, googlebot);
}
