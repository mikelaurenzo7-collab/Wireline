import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch readiness triple-pass 2026-07-27", () => {
  it("queues account deletion with the required confirmation body", () => {
    const settings = read("src/pages/SettingsPage.tsx");
    expect(settings).toContain('JSON.stringify({ confirmation: "DELETE" })');
    expect(settings).toContain("30-day grace");
    expect(settings).not.toContain("You'll receive an email when it completes");
  });

  it("describes admin danger-zone delete as a scheduled purge", () => {
    const panel = read("src/components/admin/SubscriptionPanel.tsx");
    expect(panel).toContain("30-day grace");
    expect(panel).not.toContain("Permanently deletes your account and all associated data.");
  });

  it("honors annual signup intent in TrialGate checkout", () => {
    const gate = read("src/components/TrialGateModal.tsx");
    expect(gate).toContain('preferredBillingInterval === "year"');
    expect(gate).toContain("interval");
    expect(gate).toContain("selfServeTiers");
    expect(gate).toContain("tier.suffix");
    expect(gate).not.toContain("const SELF_SERVE_TIERS");
  });

  it("disables annual Subscribe when annual Stripe price is not configured", () => {
    const card = read("src/components/StripeBillingCard.tsx");
    expect(card).toContain(
      "const canSubscribe = showAnnual ? plan.annual_configured : plan.configured",
    );
    expect(card).toContain("disabled={isBusy || !canSubscribe}");
  });

  it("fails support ticket delivery honestly", () => {
    const routes = read("src/routes/support-routes.ts");
    expect(routes).toContain("status(503)");
    expect(routes).toContain("sent: false");
    expect(routes).not.toContain("return res.json({ ok: true, sent });");

    expect(read("src/components/SupportPage.tsx")).toContain("payload?.sent");
    expect(read("src/components/ContactPage.tsx")).toContain("payload?.sent");
  });

  it("gates manual phone bind behind live-work activation", () => {
    const carrier = read("src/routes/carrier-routes.ts");
    const bind = carrier.slice(
      carrier.indexOf('"/api/phone-numbers",'),
      carrier.indexOf('"/api/phone-numbers/provision"'),
    );
    expect(bind).toContain("enforceLiveWorkActivation");
  });

  it("serializes first Stripe customer creation under an advisory lock", () => {
    const checkout = read("src/routes/launch-billing-checkout-routes.ts");
    expect(checkout).toContain("pg_advisory_xact_lock(hashtext(${req.user.id}))");
    expect(checkout).toContain("if (locked?.stripeCustomerId) return locked.stripeCustomerId");
  });

  it("keeps Runtime Balance naming in agent knowledge plans", () => {
    const knowledge = read("src/data/wireline-knowledge.ts");
    expect(knowledge).toContain('name: "Runtime Balance"');
    expect(knowledge).not.toContain('name: "Conversation Balance"');
  });

  it("ships the email suppressions live migration with wireline_server grants", () => {
    const migration = read("drizzle/migrations/0116_email_suppressions_live.sql");
    expect(migration).toContain("wireline_email_suppressions");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE");
    expect(migration).toContain("wireline_server_access");
  });
});
