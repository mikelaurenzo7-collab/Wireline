/**
 * Security-headers contract tests.
 *
 * These are static assertions over `vercel.json` (the edge headers
 * applied to the SPA on Vercel) and the `buildCSP()` helper used by
 * Express. They prevent regressions on the strict CSP we promised in
 * the launch plan: no `'unsafe-inline'` and no `'unsafe-eval'` on
 * `script-src` in production.
 *
 * If you need to add a new external script origin, add the host to the
 * Vercel CSP `script-src` AND mirror it in `src/lib/csp.ts` if it's
 * also reachable from `/api/*` HTML pages (e.g. OAuth callback HTML).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCSP } from "./csp";

type VercelHeader = { key: string; value: string };
type VercelHeaderRule = { source: string; headers: VercelHeader[] };
type VercelConfig = { headers?: VercelHeaderRule[] };

const REPO_ROOT = resolve(__dirname, "..", "..");
const vercelJson = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "vercel.json"), "utf8"),
) as VercelConfig;

function findHeader(rule: VercelHeaderRule, key: string): string | undefined {
  return rule.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
}

function defaultRule(): VercelHeaderRule {
  const rule = vercelJson.headers?.find((r) => r.source === "/:path*");
  if (!rule) throw new Error("vercel.json must define a /:path* header rule");
  return rule;
}

// ──────────────────────────────────────────────────────────────────────────
// Vercel edge headers — applied to every SPA response
// ──────────────────────────────────────────────────────────────────────────

describe("vercel.json security headers", () => {
  const rule = defaultRule();

  it("sets a strict Content-Security-Policy", () => {
    const csp = findHeader(rule, "Content-Security-Policy");
    expect(csp, "CSP header must be set on /:path*").toBeDefined();
  });

  it("does NOT permit 'unsafe-inline' on script-src in production", () => {
    const csp = findHeader(rule, "Content-Security-Policy")!;
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src "));
    expect(scriptSrc, "script-src directive must be present").toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("does NOT permit 'unsafe-eval' on script-src in production", () => {
    const csp = findHeader(rule, "Content-Security-Policy")!;
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src "));
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("forbids any `*` wildcard in script-src", () => {
    const csp = findHeader(rule, "Content-Security-Policy")!;
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src "))!;
    // Vendor wildcards like https://*.vapi.ai are allowed; bare '*' is not.
    expect(scriptSrc.split(/\s+/)).not.toContain("*");
  });

  it("sets object-src 'none' to disable plugins", () => {
    const csp = findHeader(rule, "Content-Security-Policy")!;
    expect(csp).toContain("object-src 'none'");
  });

  it("sets frame-ancestors-equivalent X-Frame-Options DENY", () => {
    expect(findHeader(rule, "X-Frame-Options")).toBe("DENY");
  });

  it("sets COOP, CORP, and Origin-Agent-Cluster", () => {
    expect(findHeader(rule, "Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(findHeader(rule, "Cross-Origin-Resource-Policy")).toBe("same-site");
    expect(findHeader(rule, "Origin-Agent-Cluster")).toBe("?1");
  });

  it("sets a long HSTS with includeSubDomains and preload", () => {
    const hsts = findHeader(rule, "Strict-Transport-Security");
    expect(hsts).toMatch(/max-age=\d{8,}/); // ≥10⁷ seconds (~115 days)
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toContain("preload");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Express CSP — applied to /api/* and OAuth callback HTML
// ──────────────────────────────────────────────────────────────────────────

describe("Express buildCSP() in production mode", () => {
  function scriptSrcOf(csp: string): string {
    const dir = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src "));
    if (!dir) throw new Error("script-src directive missing");
    return dir;
  }

  it("uses 'self' on script-src when no nonce is provided", () => {
    const csp = buildCSP(false);
    const scriptSrc = scriptSrcOf(csp);
    expect(scriptSrc).toBe("script-src 'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("uses nonce-* on script-src when a nonce is provided", () => {
    const csp = buildCSP(false, "abc123_-");
    const scriptSrc = scriptSrcOf(csp);
    expect(scriptSrc).toBe("script-src 'self' 'nonce-abc123_-'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("forbids frame-ancestors", () => {
    expect(buildCSP(false)).toContain("frame-ancestors 'none'");
  });
});
