import { WEDGES, type VerticalKey } from "../data/vertical-wedges";
import { BOTBOUND_BRAND_NAME, BOTBOUND_PRODUCTION_ORIGIN } from "./brand";
import { ACCOUNT_PRIVACY_DESCRIPTION, ACCOUNT_TERMS_DESCRIPTION } from "./legal-consent";

// Public crawl/social metadata is permanently canonical to the BotBound brand
// origin. APP_URL remains independently configurable for provider callbacks.
export const SITE_URL = BOTBOUND_PRODUCTION_ORIGIN;
const BRAND_SUFFIX = ` | ${BOTBOUND_BRAND_NAME}`;
export const HOME_TITLE = "BotBound | A Bot for You";
export const HOME_DESCRIPTION =
  "Voice Bots with a computer, phone number, and email address. Answer calls, handle requests, and get everyday work done for you or your business.";
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
  return Object.hasOwn(WEDGES, slug) ? (slug as VerticalKey) : null;
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
    title: "Pricing | Calls, Email, and a Computer",
    description:
      "Monthly plans for calls, SMS, email and Computer. Compare included numbers, email addresses and shared work.",
  },
  "/features": {
    title: "Product",
    description:
      "Create Bots for calls, SMS, email, and Computer work. Give each its own knowledge, voice, and rules.",
  },
  "/compare": {
    title: "Why BotBound | Compare Bots",
    description:
      "Compare BotBound's Bot workspace with flat subscriptions, usage pricing, and developer voice infrastructure.",
  },
  "/about": {
    title: "About BotBound | A Bot for Your Life and Work",
    description:
      "BotBound is an independent platform for calls, email, and cloud browser tasks. Set your knowledge and rules, review outcomes, and reach the founder directly for support.",
  },
  "/blog": {
    title: "BotBound Notes | Guides for Your Life and Work",
    description:
      "Practical guides to calls, appointments, conversations, and computer tasks. Give your Bot a clear job and keep control of the outcome.",
  },
  "/support": {
    title: "Support | BotBound",
    description: "Contact BotBound support.",
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
    title: "Trust Pack: Healthcare Sensitive Workflows | BotBound",
    description:
      "Controls before credentials. A practical review of safeguards and explicit boundaries for protected health information.",
  },
  "/trust/legal": {
    title: "Trust Pack: Legal and Professional Services | BotBound",
    description:
      "Controls for structured intake and client communication without pretending software can determine privilege, conflicts, or legal advice.",
  },
  "/trust/insurance": {
    title: "Trust Pack: Insurance Agencies | BotBound",
    description:
      "Operational controls for policyholder communication while regulated advice stays with qualified people.",
  },
  "/trust/enterprise": {
    title: "Trust Pack: Enterprise Review | BotBound",
    description:
      "A concise starting point for security, procurement, and operations teams evaluating BotBound.",
  },
  "/developers": {
    title: "Developers | BotBound",
    description:
      "Connect BotBound to ChatGPT, Claude, and Cursor. Create an account, build your first phone bot in the chat you already use, then continue in the same BotBound workspace. No public API keys.",
  },
  "/changelog": {
    title: "Changelog | BotBound",
    description:
      "Every shipped improvement to BotBound: features, infrastructure, polish, security. Updated when we ship.",
  },
  "/privacy": {
    title: "Privacy Policy",
    description: ACCOUNT_PRIVACY_DESCRIPTION,
  },
  "/terms": {
    title: "Terms of Service",
    description: ACCOUNT_TERMS_DESCRIPTION,
  },
  "/sms-consent": {
    title: "SMS Consent | BotBound",
    description:
      "BotBound customer care SMS: permission script, message examples, and instructions to stop messages.",
    noIndex: true,
  },
  "/solutions/sales": {
    title: "Your Next Sales Bot. | BotBound",
    description:
      "Research prospects, make outbound calls, qualify interest, and move deals forward with SMS and email.",
  },
  "/solutions/support": {
    title: "Meet Your Front Desk | BotBound",
    description:
      "Give a Front Desk Bot your policies, calendar, and rules. It answers calls, captures requests, books available times, and keeps the outcome in your workspace. Add email for written replies and recaps.",
  },
};

const NON_INDEXED_ROUTE_META: Record<string, StaticRouteMeta> = {
  "/signin": {
    title: "Sign In",
    description: "Access your BotBound account.",
    noIndex: true,
  },
  "/signup": {
    title: "Create Your Account",
    description: "Create a BotBound account and build your first Bot.",
    noIndex: true,
  },
  "/get-started": {
    title: "Create Your Account",
    description: "Create a BotBound account and build your first Bot.",
    canonicalPath: "/signup",
    noIndex: true,
  },
  "/auth": {
    title: "Sign In",
    description: "Access your BotBound account.",
    canonicalPath: "/signin",
    noIndex: true,
  },
  "/login": {
    title: "Sign In",
    description: "Access your BotBound account.",
    canonicalPath: "/signin",
    noIndex: true,
  },
  "/reset": {
    title: "Sign In",
    description: "Access your BotBound account.",
    canonicalPath: "/signin",
    noIndex: true,
  },
  "/reset-password": {
    title: "Reset Your Password",
    description: "Choose a new password for your BotBound account.",
    noIndex: true,
  },
  "/accept-invite": {
    title: "Accept Your Invitation",
    description: "Join the BotBound workspace that invited you.",
    noIndex: true,
  },
  "/onboarding": {
    title: "Set Up BotBound",
    description: "Finish configuring your BotBound workspace.",
    noIndex: true,
  },
  "/auth/oauth-complete": {
    title: "Completing Sign In",
    description: "BotBound is completing your secure sign in.",
    noIndex: true,
  },
  "/oauth-complete": {
    title: "Completing Sign In",
    description: "BotBound is completing your secure sign in.",
    canonicalPath: "/auth/oauth-complete",
    noIndex: true,
  },
  "/404": {
    title: "Page Not Found",
    description: "The requested BotBound page could not be found.",
    noIndex: true,
  },
  "/not-found": {
    title: "Page Not Found",
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
