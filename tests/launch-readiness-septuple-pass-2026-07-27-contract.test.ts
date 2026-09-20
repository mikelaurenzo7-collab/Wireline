import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch readiness septuple-pass 2026-07-27", () => {
  it("never treats Call Logs HTTP failures as an empty inventory", () => {
    const logs = read("src/components/CallLogsClaude.tsx");
    const probe = read("src/components/PhoneCallHistoryPanel.tsx");
    const overview = read("src/components/CallOpsOverview.tsx");
    expect(logs).toContain('if (!response.ok) throw new Error("Could not load calls.")');
    expect(logs).not.toContain("response.ok ? response.json() : null");
    expect(logs).toContain('title="Call History Unavailable"');
    expect(logs).toContain("!calls.length && !error");
    expect(logs).toContain("error && !calls.length ? null");
    expect(probe).toContain("if (!response.ok) throw new Error");
    expect(probe).toContain('title="Calls Unavailable"');
    expect(probe).toContain("Nothing has been erased.");
    expect(overview).toContain('{metricsLoading || metricsError ? "N/A" : kpi.value}');
  });

  it("surfaces Webhooks and Intake Keys load failures instead of empty success", () => {
    const webhooks = read("src/components/WebhooksManager.tsx");
    const intake = read("src/components/IntakeKeysManager.tsx");
    expect(webhooks).toContain("Couldn't Load Webhooks");
    expect(webhooks).toContain("setLoadError(message)");
    expect(intake).toContain("Couldn't load intake keys.");
    expect(intake).toContain("setLoadError(");
  });

  it("marks Cadences load errors when the sequences response is non-OK", () => {
    const cadences = read("src/components/Cadences.tsx");
    expect(cadences).toContain("if (!cR.ok)");
    expect(cadences).toContain("setCadences([])");
    expect(cadences).toContain("setLoadErr(");
  });

  it("keeps UsageMeter and StripeBillingCard honest on billing fetch failures", () => {
    const usage = read("src/components/UsageMeter.tsx");
    const billing = read("src/components/StripeBillingCard.tsx");
    expect(usage).toContain("Voice usage unavailable right now.");
    expect(usage).toContain("Showing last known usage.");
    expect(billing).toContain("if (!statusRaw.ok || !plansRaw.ok)");
    expect(billing).toContain("Billing details could not be loaded");
    expect(billing).toContain("if (error && !stripeConfigured)");
    expect(billing).toContain("Billing Unavailable");
  });

  it("keeps the compact CookieConsent non-modal and avoids fake no-line after phone refresh failure", () => {
    const cookie = read("src/components/CookieConsent.tsx");
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    expect(cookie).toContain('role="region"');
    expect(cookie).toContain("privacyPanelRef.current?.focus()");
    expect(cookie).not.toContain("useModalFocusTrap");
    expect(cookie).not.toContain('aria-modal="true"');
    expect(wizard).toContain(
      "Couldn't refresh phone lines. Retry before provisioning another number.",
    );
    expect(wizard).toContain("const refreshed = await refreshPhone()");
    // Inventory success also needs confirmed routing before launch can finish.
    expect(wizard).toContain("if (!refreshed.ok || !refreshed.active) return;");
    expect(wizard).toContain("finish(refreshed.phoneNumber)");
    expect(wizard).toContain("disabled={provisioning || refreshingPhone || phoneLookupFailed}");
  });

  it("keeps Call Logs and Cadences usable when secondary fetches fail", () => {
    const logs = read("src/components/CallLogsClaude.tsx");
    const overview = read("src/components/CallOpsOverview.tsx");
    const cadences = read("src/components/Cadences.tsx");
    expect(logs).toContain("setLoadMoreError(");
    expect(logs).toContain("The calls already shown remain available.");
    expect(logs).toContain("{desktop ? (");
    expect(logs).not.toContain("{!error && desktop ? (");
    expect(overview).toContain('title="Operational Metrics Unavailable"');
    expect(overview).toContain("Call history and all-time analytics remain available.");
    expect(overview).toContain("<CallOpsAnalytics />");
    expect(cadences).toContain("setRunsWarning(");
    expect(cadences).toContain("{runsWarning ? (");
  });
});
