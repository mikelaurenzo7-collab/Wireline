import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/**
 * The authz matrix and route-registry gates were blind to ~21% of the mounted
 * route surface (factory/named handlers swallowed subsequent declarations,
 * comments before the path string skipped routes, and sub-routers composed via
 * router.use(subRouter) — oauth/ providers, twilio-webhook-base,
 * video-presenter-routes-base, grok-live-profile-routes — were never scanned).
 * These assertions pin the previously-invisible surface into the generated
 * matrix so the blindness cannot regress silently.
 */
describe("authz tooling covers factory handlers, commented declarations, and sub-routers", () => {
  const matrix = read("docs/AUTHZ_MATRIX.md");

  it("reports a clean default-deny result", () => {
    expect(matrix).toContain("**Violations:** 0");
  });

  it("sees audit routes registered with factory-built handlers", () => {
    expect(matrix).toContain("| audit-routes.ts | GET | `/api/audit/events` |");
    expect(matrix).toContain("| audit-routes.ts | GET | `/api/audit/stats` |");
    expect(matrix).toContain("| audit-routes.ts | GET | `/api/audit/export` |");
    expect(matrix).toContain("| audit-routes.ts | GET | `/api/spend/budget` |");
  });

  it("sees the cron sweep routes (named handler) and marks them protected", () => {
    expect(matrix).toMatch(
      /\| job-routes\.ts \| GET \| `\/api\/jobs\/sweep` \|.*\| Protected \|/,
    );
    expect(matrix).toMatch(
      /\| job-routes\.ts \| POST \| `\/api\/jobs\/sweep` \|.*\| Protected \|/,
    );
  });

  it("sees routes with comments between the method call and the path string", () => {
    expect(matrix).toContain(
      "| job-routes.ts | GET | `/api/jobs/:id([0-9a-fA-F-]{36})` |",
    );
  });

  it("traverses sub-routers mounted via router.use(subRouter)", () => {
    // oauth/index.ts provider composition.
    expect(matrix).toContain(
      "| oauth/google.ts | GET | `/api/oauth/google/callback` |",
    );
    expect(matrix).toMatch(
      /\| oauth\/square\.ts \| GET \| `\/api\/ecommerce\/oauth\/callback` \|.*\| Public \(allowlisted\) \|/,
    );
    // twilio-webhook.ts -> twilio-webhook-base.ts.
    expect(matrix).toMatch(
      /\| twilio-webhook-base\.ts \| POST \| `\/api\/twilio-webhook\/voice-fallback` \|.*\| Public \(allowlisted\) \|/,
    );
    expect(matrix).toMatch(
      /\| twilio-webhook-base\.ts \| POST \| `\/api\/twilio-webhook\/voice-fallback-complete` \|.*\| Public \(allowlisted\) \|/,
    );
    // video-presenter-routes.ts -> video-presenter-routes-base.ts.
    expect(matrix).toMatch(
      /\| video-presenter-routes-base\.ts \| PATCH \| `\/api\/agents\/:id\/video-presenter` \|.*\| Protected \|/,
    );
    // grok-voice-routes.ts -> grok-live-profile-routes.ts.
    expect(matrix).toMatch(
      /\| grok-live-profile-routes\.ts \| GET \| `\/api\/voice\/live\/profile` \|.*\| Protected \|/,
    );
  });

  it("keeps the route-local sweep gate recognized as auth, not allowlisted", () => {
    const generator = read("scripts/generate-authz-matrix.ts");
    expect(generator).toContain('"cronOrAdminAuth"');
    expect(generator).not.toMatch(/PUBLIC_ALLOWLIST[\s\S]*jobs\\\/sweep/);
  });

  it("records provider-authenticated Resend feedback as an explicit public security decision", () => {
    expect(matrix).toMatch(
      /\| resend-webhook-routes\.ts \| POST \| `\/api\/webhooks\/resend` \|.*\| Public \(allowlisted\) \|/,
    );
  });

  it("verifies MOUNTED_ELSEWHERE claims instead of trusting prose", () => {
    const registryCheck = read("scripts/check-route-registry.mjs");
    expect(registryCheck).toContain("mountedBy");
    expect(registryCheck).toMatch(
      /does not import|never app\.use\(\)\/router\.use\(\)s it/,
    );
  });
});
