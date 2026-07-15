import { isProductionRuntime } from "./session-cookie";

const DEV_DEFAULT = "http://localhost:3000";

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
  return String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
}

/**
 * Canonical public app origin for links in email, Stripe redirects, etc.
 * Never uses request Origin/Referer — those are attacker-controlled.
 */
export function getCanonicalAppUrl(): string {
  const fromEnv = configuredAppUrl();
  if (fromEnv) return fromEnv;
  if (isProductionRuntime()) {
    throw new Error("APP_URL is required in production");
  }
  return DEV_DEFAULT;
}

/** Safe resolver for routes that must not throw when misconfigured. */
export function resolveCanonicalAppUrl(): { url: string } | { error: "APP_URL_NOT_CONFIGURED" } {
  const fromEnv = configuredAppUrl();
  if (fromEnv) return { url: fromEnv };
  if (isProductionRuntime()) return { error: "APP_URL_NOT_CONFIGURED" };
  return { url: DEV_DEFAULT };
}
