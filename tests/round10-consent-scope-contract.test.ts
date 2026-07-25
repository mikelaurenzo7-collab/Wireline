import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const consent = read("src/components/CookieConsent.tsx");

describe("round-10 consent notice scope", () => {
  it("does not auto-open inside an authenticated workspace", () => {
    // The card is bottom-anchored, so in-app it lands on the Overview
    // onboarding card and the Billing subscription panel, and on phone it
    // covers the primary next action. A signed-in visitor already passed the
    // public site where the notice had its chance.
    expect(consent).toContain("if (sessionPresent) return;");
    const probe = consent.slice(consent.indexOf("void (async () => {"));
    expect(probe.indexOf("if (sessionPresent) return;")).toBeLessThan(probe.indexOf("setTimeout"));
  });

  it("keeps the notice reachable on demand from anywhere", () => {
    // Suppressing the auto-open is only defensible because an explicit
    // "Privacy choices" entry point still exists and is not session-gated.
    expect(consent).toContain("OPEN_PRIVACY_CHOICES_EVENT");
    const start = consent.indexOf("const openPrivacyChoices");
    const listener = consent.slice(start, consent.indexOf("}, []);", start));
    expect(listener).toContain("window.addEventListener(OPEN_PRIVACY_CHOICES_EVENT");
    // The on-demand path must not be session-gated, or suppressing the
    // auto-open would leave signed-in users with no way to change their mind.
    expect(listener).not.toContain("hasSession");
    expect(listener).not.toContain("sessionPresent");
  });

  it("still treats a failed session probe as signed out", () => {
    // Fail-open to showing the choice: never silently skip consent because a
    // network hiccup made auth state unknown.
    expect(consent).toContain("let sessionPresent = false;");
    expect(consent).toContain("treat as signed out");
  });

  it("keeps the existing auth-portal and Fast Start suppressions", () => {
    expect(consent).toContain("isAuthPortalPath(location.pathname) || createFlowOpen");
  });
});

describe("round-10 consent placement cannot depend on probe timing", () => {
  it("gates rendering on the route, not just the one-shot session probe", () => {
    // The probe runs once at mount. The common real path defeats it: land on
    // marketing signed out, leave the notice up, sign in — and the card rides
    // into the workspace on top of the Overview onboarding card. Observed in
    // the walkthrough recording.
    expect(consent).toContain("isMarketingPublicPath");
    expect(consent).toContain("const onPublicSurface = isMarketingPublicPath(location.pathname)");
    expect(consent).toContain("if (!onPublicSurface && !explicitlyOpened) return null;");
  });

  it("still lets Privacy choices open the card inside the app", () => {
    // The route guard must not strand a signed-in user with no way to revisit
    // their choice, so the explicit control sets its own escape hatch.
    expect(consent).toContain("setExplicitlyOpened(true)");
    const listener = consent.slice(
      consent.indexOf("const openPrivacyChoices"),
      consent.indexOf("window.addEventListener(OPEN_PRIVACY_CHOICES_EVENT"),
    );
    expect(listener).not.toContain("onPublicSurface");
  });
});
