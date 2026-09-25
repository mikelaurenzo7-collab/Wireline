import { BOTBOUND_PRODUCTION_ORIGIN } from "./brand";
import { getDeploymentIdentity, isProductionDeployment } from "./deployment-environment";
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

/** Accept an explicit origin env. Never treat Host / X-Forwarded-Host as input. */
export function parsePublicOrigin(raw: string | undefined, allowHttpLocal = false): string {
  const trimmed = String(raw || "")
    .trim()
    .replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.username || url.password) return "";
    if (url.pathname && url.pathname !== "/") return "";
    if (url.search || url.hash) return "";
    if (!url.hostname) return "";
    const localHttp =
      allowHttpLocal &&
      url.protocol === "http:" &&
      /^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
    if (url.protocol !== "https:" && !localHttp) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function isRenderWebService(): boolean {
  return (
    getDeploymentIdentity().provider === "render" &&
    String(process.env.RENDER || "")
      .trim()
      .toLowerCase() === "true"
  );
}

/**
 * Env-only browser/OAuth origin. Empty when the caller should use APP_URL.
 * Request Host is never consulted — adjacent or spoofed hosts must not mint
 * a different callback origin.
 */
export function envPublicRuntimeOrigin(): string {
  const identity = getDeploymentIdentity();
  const publicUrl = parsePublicOrigin(process.env.PUBLIC_URL, true);

  if (identity.provider === "vercel" || identity.provider === "conflict") {
    return "";
  }

  if (isRenderWebService()) {
    if (publicUrl) return publicUrl;
    return parsePublicOrigin(process.env.RENDER_EXTERNAL_URL);
  }

  return publicUrl;
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
 *
 * Marketing canonical/OG stay BOTBOUND_PRODUCTION_ORIGIN. Production APP_URL
 * stays https://botbound.me and is never rewritten from Render metadata.
 *
 * Origin is env-driven only:
 *   PUBLIC_URL → Render RENDER_EXTERNAL_URL → APP_URL
 * Vercel (and Vercel+Render conflict) always use APP_URL / preview URL so a
 * leaked RENDER_EXTERNAL_URL cannot mint onrender callbacks on botbound.me.
 * Render dogfood therefore keeps OAuth on *.onrender.com even when APP_URL is
 * the canonical production origin, without consulting Host / X-Forwarded-Host.
 *
 * `req` is accepted for call-site compatibility and is not an origin source.
 */
export function getPublicRuntimeOrigin(_req?: RequestHostLike): string {
  const fromEnv = envPublicRuntimeOrigin();
  if (fromEnv) return fromEnv;
  return getCanonicalAppUrl();
}
