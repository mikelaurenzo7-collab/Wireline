import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

function matchingCallEnd(source: string, openIndex: number): number {
  let depth = 0;
  let mode: "code" | "line" | "block" | "single" | "double" | "template" =
    "code";
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (mode === "line") {
      if (char === "\n") mode = "code";
      continue;
    }
    if (mode === "block") {
      if (char === "*" && next === "/") {
        mode = "code";
        index += 1;
      }
      continue;
    }
    if (mode !== "code") {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (
        (mode === "single" && char === "'") ||
        (mode === "double" && char === '"') ||
        (mode === "template" && char === "`")
      ) {
        mode = "code";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      mode = "line";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      mode = "block";
      index += 1;
      continue;
    }
    if (char === "'") {
      mode = "single";
      continue;
    }
    if (char === '"') {
      mode = "double";
      continue;
    }
    if (char === "`") {
      mode = "template";
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")" && --depth === 0) return index;
  }

  throw new Error("Unbalanced call at source offset " + openIndex);
}

function promiseAllBlocks(source: string): string[] {
  return [...source.matchAll(/Promise\.all\(/g)].map((match) => {
    const start = match.index ?? 0;
    const open = start + "Promise.all".length;
    return source.slice(start, matchingCallEnd(source, open) + 1);
  });
}

describe("double-pass launch honesty", () => {
  it("never 2xx unfinished Stripe webhook claims", () => {
    const source = read("src/routes/billing-routes.ts");
    expect(source).toContain('prior?.status === "processing"');
    expect(source).toContain('prior?.status === "processed"');
    expect(source).toContain(
      'throw AppError.fromHttpStatus(503, "Prior delivery did not complete. Retry.")',
    );
    // Must not ack an unknown prior claim state as duplicate success. The
    // pattern is asserted against a synthetic regression first: an
    // over-escaped guard here (e.g. `prior\\.status`) can never match real
    // TypeScript, which would make the `not.toMatch` below vacuously true and
    // leave this money-critical branch unguarded while CI stays green.
    const acksUnknownPriorAsDuplicate =
      /priorStatus: prior\?\.status \?\? "unknown",\s*\}\);\s*return res\.json\(\{ received: true, duplicate: true \}\)/;
    const regressedSource = [
      '        priorStatus: prior?.status ?? "unknown",',
      "      });",
      "      return res.json({ received: true, duplicate: true });",
    ].join("\n");
    expect(regressedSource).toMatch(acksUnknownPriorAsDuplicate);
    expect(source).not.toMatch(acksUnknownPriorAsDuplicate);
  });

  it("does not swallow Runtime Allowance grant failures after subscription sync", () => {
    const source = read("src/lib/stripe-helpers.ts");
    expect(source).toContain(
      "await grantSubscriptionRuntimeAllowance(userId, periodReference, plan.id, interval);",
    );
    expect(source).not.toMatch(
      /grantSubscriptionRuntimeAllowance\([\s\S]*?\)\.catch\(/,
    );
    expect(source).toContain("refusing overwrite");
  });

  it("routes payment and dunning links to live pages", () => {
    const tools = read("src/lib/vapi-tool-handlers.ts");
    const billing = read("src/routes/billing-routes.ts");
    const app = read("src/App.tsx");
    expect(tools).toContain("`${appUrl}/pricing${planParam}`");
    expect(tools).toContain("trywireline.com/pricing");
    expect(tools).not.toContain("`${appUrl}/billing${planParam}`");
    expect(billing).toContain("updateCardUrl: `${appUrl}/settings/billing`");
    expect(app).toContain('path="/billing"');
    expect(app).toContain('to="/settings/billing"');
  });

  it("equalizes forgot-password including email send, and pads rejections", () => {
    const source = read("src/routes/auth-routes.ts");
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("sendPasswordResetEmail");
    // Email send must sit inside equalizedDuration for forgot-password.
    const forgot = source.slice(source.indexOf('"/api/auth/forgot-password"'));
    const eqStart = forgot.indexOf("equalizedDuration(");
    const eqChunk = forgot.slice(eqStart, eqStart + 1200);
    expect(eqChunk).toContain("sendPasswordResetEmail");
  });

  it("scopes runtime reserve idempotency to the tenant", () => {
    const source = read("src/lib/runtime-usage-billing.ts");
    expect(source).toContain("eq(schema.creditLedger.userId, input.userId)");
    expect(source).toContain(
      "eq(schema.creditLedger.idempotencyKey, idempotencyKey)",
    );
  });

  it("gates manual SMS replies and fails mark-read honestly", () => {
    const source = read("src/routes/sms-routes.ts");
    expect(source).toContain("evaluateOutboundDialGate");
    expect(source).toContain(
      'throw AppError.fromHttpStatus(500, "Failed to mark SMS thread read")',
    );
    expect(source).not.toContain("res.json({ ok: false })");
  });

  it("keeps carrier messaging disclosures and registration ownership accurate", () => {
    const terms = read("src/components/LegalPage.tsx");
    const privacy = read("src/components/PrivacyPolicyPage.tsx");
    expect(terms).toContain(
      "Mobile contact information and SMS opt-in records are not sold or",
    );
    expect(terms).toContain("Carriers are not liable");
    expect(terms).toContain("coordinates that registration through Twilio");
    expect(terms).not.toContain("as the Communications Service Provider");
    expect(privacy).toContain(
      "Mobile contact information and SMS opt-in records are not sold or",
    );
  });

  it("fails commercial email readiness closed without a postal address", () => {
    const envCheck = read("scripts/check-prod-env.mjs");
    const vendorProbe = read("scripts/check-vendor-readiness.mjs");
    const emailService = read("src/lib/email-service.ts");
    expect(envCheck).toContain('"WIRELINE_POSTAL_ADDRESS"');
    expect(vendorProbe).toContain('"commercial_email_postal_address"');
    expect(vendorProbe).toMatch(
      /commercialEmailPostalAddressReady \? "ready" : "blocked"/,
    );
    expect(emailService).toContain("getPostalAddress");
    expect(emailService).toContain(
      "Commercial email disabled: WIRELINE_POSTAL_ADDRESS is missing",
    );
  });

  it("routes founder partnerships and growth work to revenue", () => {
    const fleet = read("src/lib/founder-fleet-seed.ts");
    const aisha = fleet.slice(
      fleet.indexOf('id: "founder-aisha"'),
      fleet.indexOf('id: "founder-elena"'),
    );
    const growth = fleet.slice(
      fleet.indexOf('id: "founder-growth-email"'),
      fleet.indexOf('id: "founder-tier2"'),
    );
    expect(aisha).toContain('team: "revenue"');
    expect(growth).toContain('team: "revenue"');
  });

  it("keeps billing status within serverless database pool headroom", () => {
    const source = read("src/routes/billing-routes.ts");
    const start = source.indexOf('"/billing/status"');
    const end = source.indexOf('"/admin/stripe-customer-audit"');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const statusRoute = source.slice(start, end);
    expect(statusRoute).toContain("Keep tenant reads sequential");
    expect(statusRoute).not.toContain("await Promise.all([");

    const subscriptionRead = statusRoute.indexOf(
      "const subRows = await drizzle",
    );
    const agentRead = statusRoute.indexOf("const agentCounts = await drizzle");
    const phoneRead = statusRoute.indexOf("const phoneCounts = await drizzle");
    const entitlementRead = statusRoute.indexOf(
      "const entitlementSlots = await getIncludedPhoneLineSlots",
    );
    expect(subscriptionRead).toBeLessThan(agentRead);
    expect(agentRead).toBeLessThan(phoneRead);
    expect(phoneRead).toBeLessThan(entitlementRead);
  });

  it("fails launch closed when Stripe brand or customer controls drift", () => {
    const vendorProbe = read("scripts/check-vendor-readiness.mjs");
    expect(vendorProbe).toContain(
      "/v1/billing_portal/configurations?active=true&limit=100",
    );
    expect(vendorProbe).toContain("/v1/webhook_endpoints?limit=100");
    expect(vendorProbe).toContain("/v1/tax/settings");
    expect(vendorProbe).toContain("stripeBrandReady");
    expect(vendorProbe).toContain("stripePortalReady");
    expect(vendorProbe).toContain("stripeWebhookReady");
    expect(vendorProbe).toContain("stripeTaxReady");
    expect(vendorProbe).toMatch(
      /stripeCoreReady\s*&&\s*stripeBrandReady\s*&&\s*stripePortalReady\s*&&\s*stripeWebhookReady\s*&&\s*stripeTaxReady/,
    );

    const launchStatus = read("scripts/generate-launch-status.mjs");
    expect(launchStatus).toContain(
      'blockers.push("stripe_brand_not_wireline")',
    );
    expect(launchStatus).toContain(
      'blockers.push("stripe_customer_portal_not_ready")',
    );
    expect(launchStatus).toContain(
      'blockers.push("stripe_webhook_not_aligned")',
    );
    expect(launchStatus).toContain('blockers.push("stripe_tax_not_active")');
  });

  it("keeps high-cardinality tenant snapshots on one scoped connection", () => {
    const expectedTransactionBatches = new Map<string, number>([
      ["src/lib/daily-brief.ts", 1],
      ["src/routes/fleet-routes.ts", 2],
      ["src/routes/insights-routes.ts", 1],
      ["src/lib/vapi-assistant-factory-v2.ts", 1],
      ["src/lib/vapi-client.ts", 1],
      ["src/lib/voice/grok-voice-service.ts", 1],
      ["src/routes/settings-routes.ts", 1],
      ["src/routes/dashboard-routes.ts", 2],
      ["src/lib/voice/openai-live-agent-service.ts", 1],
      ["src/routes/agent-routes-v2.ts", 1],
      ["src/routes/mobile-routes.ts", 1],
      ["src/routes/agent-workspace-routes.ts", 1],
      ["src/routes/agent-test-routes.ts", 1],
    ]);

    for (const [path, expectedBatches] of expectedTransactionBatches) {
      const source = read(path);
      const transactionBatches =
        source.match(/drizzle\.transaction\(\(tx\) =>/g)?.length ?? 0;
      expect(transactionBatches, path).toBeGreaterThanOrEqual(expectedBatches);

      for (const block of promiseAllBlocks(source)) {
        const rootQueryFanout = block.match(/\bdrizzle(?=\s*\.)/g)?.length ?? 0;
        expect(
          rootQueryFanout,
          path + " still fans out tenant pool clients",
        ).toBeLessThan(4);
      }
    }
  });
});
