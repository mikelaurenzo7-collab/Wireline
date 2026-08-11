import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const PUBLIC_TRUTH_FILES = [
  "src/components/Security.tsx",
  "src/components/TrustPackPage.tsx",
  "src/components/PublicChangelog.tsx",
  "src/data/vertical-wedges.ts",
] as const;

const PROHIBITED_LAUNCH_CLAIMS = [
  /BAA available on Enterprise/i,
  /HIPAA BAA available/i,
  /SOC 2 Type II certification/i,
  /audit firm engaged/i,
  /target 2026 Q[1-4]/i,
  /No hallucinations/i,
  /same-day showing slot/i,
  /Speed-to-lead under 60 seconds/i,
  /Compliance-safe/i,
  /Most home services tenants/i,
] as const;

describe("launch truth contract", () => {
  it("keeps public security, trust, changelog, and vertical copy free of unverified claims", () => {
    const violations: string[] = [];
    for (const path of PUBLIC_TRUTH_FILES) {
      const source = read(path);
      for (const pattern of PROHIBITED_LAUNCH_CLAIMS) {
        if (pattern.test(source)) violations.push(`${path}: ${pattern}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("states healthcare and enterprise boundaries explicitly", () => {
    const security = read("src/components/Security.tsx");
    const trust = read("src/components/TrustPackPage.tsx");

    expect(security).toContain("A SOC 2 Type II attestation is not currently available.");
    expect(security).toContain("Do not send, store, or process PHI");
    expect(trust).toContain("Wireline does not claim HIPAA compliance or certification.");
    expect(trust).toContain("SSO, residency, DPA, BAA, support, and other enterprise terms");
    expect(trust).toContain("Important boundary");
  });

  it("keeps the public changelog and Trust Center current without overclaiming controls", () => {
    const changelog = read("src/components/PublicChangelog.tsx");
    const security = read("src/components/Security.tsx");

    expect(changelog).toContain('date: "Aug 11, 2026"');
    expect(changelog).toContain('title: "Launch certification hardened"');
    expect(changelog).toContain("the non-E2E test suite");
    expect(changelog).toContain("Post-promotion health checks verify the live service");
    expect(changelog).not.toContain("the full test suite");
    expect(changelog).not.toContain("live service health before promotion");
    expect(changelog).not.toContain("Every PR now runs");
    expect(changelog).toContain("Playwright screenshot capture and responsive-layout auditing");
    expect(changelog).not.toContain("committed baselines");

    expect(security).toContain("Last updated · August 11, 2026");
    expect(security).toContain("Twilio and Vapi for telephony and orchestration");
    expect(security).toContain("Deepgram for transcription");
    expect(security).toContain("OpenAI for managed call models and realtime voice");
    expect(security).toContain("ElevenLabs for managed text-to-speech");
    expect(security).toContain("names key subprocessors for transparency");
    expect(security).not.toContain("vendor names stay in operator configuration, not buyer UI");
  });

  it("keeps pre-customer GTM focused on first evidence instead of outbound scale", () => {
    const sprint = read("docs/DESIGN_PARTNER_SPRINT_2026-07-08.md");

    expect(sprint).toContain("Recruit **3–5 design partners**");
    expect(sprint).toContain("Cold marketing outbound is not a prerequisite");
    expect(sprint).toContain("No fake urgency");
    expect(sprint).toContain("depth beats volume");
    expect(sprint).not.toContain("10–25 design partners");
    expect(sprint).not.toContain("sales-heavy categories");
  });

  it("does not leak Wireline branding into a customer's sequence message", () => {
    const cadences = read("src/components/Cadences.tsx");
    expect(cadences).not.toContain("Reaching out from Wireline");
    expect(cadences).toContain("disabled={saving || !draftName.trim() || draftSteps.length === 0}");
  });

  it("describes deletion billing and provider spend controls as implemented", () => {
    const settings = read("src/pages/SettingsPage.tsx");
    const accountRoutes = read("src/routes/account-routes.ts");
    const deletionBilling = read("src/lib/account-deletion-billing.ts");
    const spendRoutes = read("src/routes/spend-control-routes.ts");
    const spendView = read("src/components/insights/AISpendView.tsx");

    expect(settings).not.toContain("Billing continues until purge");
    expect(accountRoutes).toContain("renewal_stopped");
    expect(accountRoutes).toContain('"/api/account/deletion-status"');
    expect(settings).toContain('authFetch("/api/account/deletion-status"');
    expect(deletionBilling).toContain("cancel_at_period_end: true");
    expect(deletionBilling).toContain("cancel_at_period_end: false");
    expect(deletionBilling).toContain("stripe.subscriptions.list");
    expect(deletionBilling).toContain("DELETION_RENEWAL_MARKER");
    expect(spendRoutes).toContain("maximum_limit_usd");
    expect(spendRoutes).toContain("The provider spend guard is always enabled with a hard cap.");
    expect(spendView).toContain("Always on");
  });
});
