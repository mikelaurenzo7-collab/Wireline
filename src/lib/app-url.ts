import { BOTBOUND_PRODUCTION_ORIGIN } from "./brand";
import { isProductionDeployment } from "./deployment-environment";
import { isProductionRuntime } from "./session-cookie";

const DEV_DEFAULT = "http://localhost:3000";

export type RequestHostLike = {
  get?(name: string): string | undefined;
  hostname?: string;
  protocol?: string;
};

function previewDeploymentUrl(): string {
  if (process.env.VERCEL_ENV !== "preview") return "";
  const host = String(process.env.VERCEL_URL || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  return host ? `https://${host}` : "";
}

function configuredAppUrl(): string {
  const previewUrl = previewDeploymentUrl();
  if (previewUrl) return previewUrl;
  return String(process.env.APP_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

function requestHostname(req?: RequestHostLike): string {
  const forwarded = String(req?.get?.("x-forwarded-host") || "")
    .split(",")[0]
    .trim();
  const host = forwarded || String(req?.get?.("host") || req?.hostname || "").trim();
  return host.replace(/:\d+$/, "").toLowerCase();
}

function renderExternalOrigin(): string {
  if (
    String(process.env.RENDER || "")
      .trim()
      .toLowerCase() !== "true"
  )
    return "";
  const raw = String(process.env.RENDER_EXTERNAL_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" || !url.hostname) return "";
    return url.origin;
  } catch {
    return "";
  }
}

/**
 * Canonical public app origin for links in email, Stripe redirects, etc.
 * Never uses request Origin/Referer — those are attacker-controlled.
 */
export function getCanonicalAppUrl(): string {
  const fromEnv = configuredAppUrl();
  if (fromEnv) {
    if (isProductionDeployment() && fromEnv !== BOTBOUND_PRODUCTION_ORIGIN) {
      throw new Error(`APP_URL must be exactly ${BOTBOUND_PRODUCTION_ORIGIN} in production`);
    }
    return fromEnv;
  }
  if (isProductionRuntime()) {
    throw new Error("APP_URL is required in production");
  }
  return DEV_DEFAULT;
}

/** Safe resolver for routes that must not throw when misconfigured. */
export function resolveCanonicalAppUrl():
  { url: string } | { error: "APP_URL_NOT_CONFIGURED" | "APP_URL_NOT_CANONICAL" } {
  const fromEnv = configuredAppUrl();
  if (fromEnv) {
    if (isProductionDeployment() && fromEnv !== BOTBOUND_PRODUCTION_ORIGIN) {
      return { error: "APP_URL_NOT_CANONICAL" };
    }
    return { url: fromEnv };
  }
  if (isProductionRuntime()) return { error: "APP_URL_NOT_CONFIGURED" };
  return { url: DEV_DEFAULT };
}

/**
 * Browser-facing origin for OAuth redirects and Studio handoff.
 * Marketing canonical/OG stay BOTBOUND_PRODUCTION_ORIGIN. Production APP_URL
 * stays https://botbound.me. Render dogfood uses RENDER_EXTERNAL_URL only
 * when the request is actually on that host, so onrender can sign in without
 * a DNS cutover or rewriting production APP_URL.
 */
export function getPublicRuntimeOrigin(req?: RequestHostLike): string {
  const renderOrigin = renderExternalOrigin();
  if (renderOrigin) {
    let renderHost = "";
    try {
      renderHost = new URL(renderOrigin).hostname.toLowerCase();
    } catch {
      renderHost = "";
    }
    if (renderHost && requestHostname(req) === renderHost) return renderOrigin;
  }
  return getCanonicalAppUrl();
}
