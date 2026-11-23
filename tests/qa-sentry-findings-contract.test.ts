import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("fixes for production errors found in Sentry", () => {
  it("lowers syntax older iPhones cannot parse (WIRELINE-BACKEND-S)", () => {
    // Safari before 16.4 throws "Unexpected token '{'" on class static blocks,
    // which es2022 alone passes through from @radix-ui/react-collection.
    const vite = read("vite.config.ts");
    expect(vite).toContain('target: ["es2022", "safari15", "ios15"]');
    expect(vite).not.toMatch(/build:\s*\{[\s\S]*?target:\s*"es2022"/);
  });

  it("answers a held billing lease with 409 and a warning, not a paging 500 (WIRELINE-BACKEND-T)", () => {
    const billing = read("src/routes/billing-routes.ts");
    const failure = billing.slice(
      billing.indexOf("const contended = isBillingSyncInProgress(err);"),
    );
    expect(failure).toContain('log.warn("Stripe webhook deferred');
    expect(failure).toContain('throw new AppError(409, "BILLING_SYNC_IN_PROGRESS"');
    expect(failure).toContain('res.setHeader("Retry-After", "30")');
    // The claim is still released before either answer, and every other failure stays a 500.
    expect(failure.indexOf("releaseStripeEventClaim(claim)")).toBeLessThan(
      failure.indexOf("throw new AppError(409"),
    );
    expect(failure).toContain('throw AppError.fromHttpStatus(500, "Webhook handler failed")');
    // 4xx never reaches Sentry; only 5xx does (server.ts error handler).
    expect(read("server.ts")).toContain("if (status >= 500) {");
  });
});
