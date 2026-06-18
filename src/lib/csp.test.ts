import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import baseline from "../../scripts/csp-inventory-baseline.json";
import { buildConnectSrcs, buildCSP, generateCspNonce, INLINE_SCRIPT_HASHES } from "./csp";

/**
 * Recompute the CSP hashes of every *executable* inline <script> in index.html.
 * External (`src=`) tags and `application/ld+json` data blocks are excluded —
 * neither needs a script-src hash. This is the drift guard: if anyone edits an
 * inline boot script without updating INLINE_SCRIPT_HASHES, this fails.
 */
function liveInlineScriptHashes(): string[] {
  const indexHtmlPath = fileURLToPath(new URL("../../index.html", import.meta.url));
  const html = readFileSync(indexHtmlPath, "utf8");
  const matches = html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g);
  const hashes: string[] = [];
  for (const m of matches) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue; // external script, no inline hash
    if (/type\s*=\s*["']application\/(ld\+json|json)["']/.test(attrs)) continue; // data, not executed
    const digest = createHash("sha256").update(m[2], "utf8").digest("base64");
    hashes.push(`'sha256-${digest}'`);
  }
  return hashes;
}

describe("buildConnectSrcs", () => {
  it("includes the core third-party origins in base mode", () => {
    const out = buildConnectSrcs(false);
    expect(out).toContain("'self'");
    expect(out).toContain("https://api.anthropic.com");
    expect(out).toContain("https://api.vapi.ai");
    expect(out).toContain("wss://api.vapi.ai");
    expect(out).toContain("https://accounts.google.com");
    expect(out).toContain("https://oauth2.googleapis.com");
    expect(out).toContain("https://www.googleapis.com");
    expect(out).toContain("https://login.microsoftonline.com");
    expect(out).toContain("https://graph.microsoft.com");
    expect(out).toContain("https://api.stripe.com");
    expect(out).toContain("https://plausible.io");
  });

  it("does NOT include localhost entries in production mode", () => {
    const out = buildConnectSrcs(false);
    expect(out).not.toContain("localhost");
    expect(out).not.toContain("127.0.0.1");
  });

  it("includes localhost ws/http entries in dev mode", () => {
    const out = buildConnectSrcs(true);
    expect(out).toContain("ws://localhost:*");
    expect(out).toContain("http://localhost:*");
    expect(out).toContain("ws://127.0.0.1:*");
  });
});

describe("buildCSP", () => {
  it("starts script-src with 'self' + inline hashes (no unsafe-inline) in prod with no nonce", () => {
    const csp = buildCSP(false);
    const scriptDirective = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"))!;
    // 'self' first, then the static inline-script hashes, then marketing origins.
    expect(scriptDirective.startsWith("script-src 'self' 'sha256-")).toBe(true);
    // Every allowlisted inline hash must appear in the emitted directive.
    for (const hash of INLINE_SCRIPT_HASHES) {
      expect(scriptDirective).toContain(hash);
    }
    expect(scriptDirective).toContain("https://plausible.io");
    expect(scriptDirective).toContain("https://connect.facebook.net");
    expect(scriptDirective).toContain("https://www.googletagmanager.com");
    // script-src must never carry 'unsafe-inline' / 'unsafe-eval' in prod.
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
  });

  it("allowlists exactly the executable inline scripts in index.html (drift guard)", () => {
    // This is the test that would have caught the prod regression where the
    // Meta Pixel + GTM loader was edited but its CSP hash was left stale,
    // silently blocking analytics on every page. Hashes are derived live.
    const live = liveInlineScriptHashes().sort();
    const allow = [...INLINE_SCRIPT_HASHES].sort();
    expect(live.length).toBeGreaterThan(0);
    expect(allow).toEqual(live);
    // And the emitted prod CSP must carry each live hash (no blocked inline).
    const scriptDirective = buildCSP(false)
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"))!;
    for (const hash of live) {
      expect(scriptDirective).toContain(hash);
    }
  });

  it("vercel.json static-shell CSP stays in sync with csp.ts inline hashes", () => {
    // Vercel serves the static index.html at the edge with the header from
    // vercel.json — bypassing server.ts. That header is the CSP real users
    // get on the marketing shell, so it MUST carry the same inline hashes as
    // csp.ts (CLAUDE.md: "CSP — one source"). This guards the duplication.
    const vercelConfig = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../vercel.json", import.meta.url)), "utf8"),
    ) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
    const cspHeader = vercelConfig.headers
      .flatMap((h) => h.headers)
      .find((h) => h.key.toLowerCase() === "content-security-policy");
    expect(cspHeader).toBeTruthy();
    const scriptDirective = cspHeader!.value
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"))!;
    for (const hash of INLINE_SCRIPT_HASHES) {
      expect(scriptDirective).toContain(hash);
    }
    // No stale hashes: the only sha256 tokens in vercel.json script-src must be
    // the allowlisted ones.
    const sha256Tokens = scriptDirective.match(/'sha256-[^']+'/g) ?? [];
    expect(sha256Tokens.sort()).toEqual([...INLINE_SCRIPT_HASHES].sort());
  });

  it("injects a nonce into script-src when one is provided in prod mode", () => {
    const csp = buildCSP(false, "abc123");
    const scriptDirective = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"))!;
    expect(scriptDirective.startsWith("script-src 'self' 'nonce-abc123' 'sha256-")).toBe(true);
    expect(scriptDirective).toContain("https://plausible.io");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
  });

  it("allows 'unsafe-inline' and 'unsafe-eval' only in dev mode (for Vite HMR)", () => {
    const csp = buildCSP(true);
    const scriptDirective = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"))!;
    expect(scriptDirective).toContain("'unsafe-inline'");
    expect(scriptDirective).toContain("'unsafe-eval'");
  });

  it("always sets the hardening directives", () => {
    const csp = buildCSP(false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("style-src-elem 'self'");
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
    expect(csp).not.toMatch(/(?:^|;)\s*style-src\s[^;]*'unsafe-inline'/);
    expect(csp).not.toContain("fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).not.toContain("fonts.gstatic.com");
    expect(csp).toContain("img-src 'self' data: blob: https:");
    expect(csp).toContain("frame-src 'self' blob:");
  });

  it("threads the supplied connectSrcs string into connect-src", () => {
    const csp = buildCSP(false, undefined, "'self' https://example.com");
    expect(csp).toContain("connect-src 'self' https://example.com");
  });

  it("returns a single semicolon-delimited line", () => {
    const csp = buildCSP(false);
    expect(csp.split(";").length).toBeGreaterThan(5);
    expect(csp).not.toContain("\n");
  });

  it("production CSP uses per-request nonce when supplied (server.ts pattern)", () => {
    const nonce = generateCspNonce();
    const csp = buildCSP(false, nonce);
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("prod style-src-elem is strict while style-src-attr allows library animations", () => {
    const csp = buildCSP(false);
    const directives = Object.fromEntries(
      csp.split(";").map((d) => {
        const [key, ...rest] = d.trim().split(/\s+/);
        return [key, rest.join(" ")];
      }),
    );
    expect(directives["style-src-elem"]).toBe("'self'");
    expect(directives["style-src-attr"]).toBe("'unsafe-inline'");
    expect(baseline.total).toBe(0);
    expect(baseline.styleTags).toBe(0);
  });
});

describe("generateCspNonce", () => {
  it("returns a URL-safe base64 string", () => {
    const nonce = generateCspNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns a 16-byte nonce encoded as base64url (~22 chars)", () => {
    const nonce = generateCspNonce();
    // 16 bytes base64url -> 22 chars (no padding)
    expect(nonce.length).toBeGreaterThanOrEqual(22);
    expect(nonce.length).toBeLessThanOrEqual(24);
  });

  it("produces unique values across calls", () => {
    const a = generateCspNonce();
    const b = generateCspNonce();
    const c = generateCspNonce();
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
