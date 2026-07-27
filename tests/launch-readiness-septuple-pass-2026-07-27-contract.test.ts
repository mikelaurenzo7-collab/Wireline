import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch readiness septuple-pass 2026-07-27", () => {
  it("never treats Call Logs HTTP failures as an empty inventory", () => {
    const logs = read("src/components/CallLogsClaude.tsx");
    expect(logs).toContain('throw new Error("Couldn\'t load calls. Try again in a moment.")');
    expect(logs).not.toContain("response.ok ? response.json() : null");
  });

  it("surfaces Webhooks and Intake Keys load failures instead of empty success", () => {
    const webhooks = read("src/components/WebhooksManager.tsx");
    const intake = read("src/components/IntakeKeysManager.tsx");
    expect(webhooks).toContain("Couldn't load webhooks");
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
    expect(billing).toContain("Billing unavailable");
  });

  it("traps focus in CookieConsent and avoids fake no-line after phone refresh failure", () => {
    const cookie = read("src/components/CookieConsent.tsx");
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    expect(cookie).toContain("useModalFocusTrap");
    expect(cookie).toContain('aria-modal="true"');
    expect(wizard).toContain(
      "Couldn't refresh phone lines. Retry before provisioning another number.",
    );
    expect(wizard).toContain("const refreshed = await refreshPhone()");
    expect(wizard).toContain('if (refreshed) setStep("test")');
  });

  it("keeps Call Logs and Cadences usable when secondary fetches fail", () => {
    const logs = read("src/components/CallLogsClaude.tsx");
    const cadences = read("src/components/Cadences.tsx");
    expect(logs).toContain('{activeTab === "floor" ? (');
    expect(logs).not.toContain('{!error && activeTab === "floor"');
    expect(cadences).toContain("setRunsWarning(");
    expect(cadences).toContain("{runsWarning ? (");
  });
});
