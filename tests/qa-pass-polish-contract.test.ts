import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  estimateFromSliders,
  EXAMPLE_MONTH,
} from "../src/components/usage-billing/UsagePricingPanel";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** Findings from the Nov 23 QA-account visual pass; each one stays fixed. */
describe("QA pass polish", () => {
  it("says the Calls list is empty and uses the one label for creating a Bot", () => {
    const calls = read("src/components/PhoneCallHistoryPanel.tsx");
    expect(calls).toContain('title: "No Calls Yet",');
    expect(calls).toContain('description: "Calls appear here once your Bot has a phone line."');
    expect(calls).toContain('action: { label: "Create Bot", to: "/studio?create=1" }');
    expect(calls).not.toContain('label: "New Bot"');
  });

  it("names the plan the pricing estimate uses and draws the Plan Details toggle", () => {
    const pricing = read("src/components/usage-billing/UsagePricingPanel.tsx");
    expect(pricing).toContain("In the estimate");
    expect(pricing).toContain("[&::-webkit-details-marker]:hidden");
    expect(pricing).toContain("group-open:rotate-180");
  });

  it("keeps titles free of end punctuation and the inbox on the product word", () => {
    expect(read("src/pages/Pricing.tsx")).toContain(">Room to Do More</h1>");
    expect(read("src/pages/EmailPage.tsx")).toContain('{ id: "sms", label: "Texts" }');
    expect(read("src/components/marketing/MarketingChromeBar.tsx")).toContain(
      '{ to: "/features", label: "Features" }',
    );
  });

  it("writes the billing offer in sentence case with the product's word for texts", () => {
    const card = read("src/components/usage-billing/UsageSpendCard.tsx");
    expect(card).toContain("calls, texts, email and Computer.");
    expect(card).toContain("Includes {plan.includedNumbers}");
    expect(card).not.toContain('Email Addresses"} Included');
  });

  it("keeps the home hero badge on one line at phone widths", () => {
    const home = read("src/components/marketing/WireAgentLanding.tsx");
    expect(home).toContain('<span className="sm:hidden">Voice, Inbox &amp; Computer</span>');
  });

  it("opens the estimator on an example month that fits inside Starter", () => {
    const estimate = estimateFromSliders({
      tier: "standard",
      ...EXAMPLE_MONTH,
      number: false,
      emailAddress: false,
    });
    expect(estimate.workUsd).toBeGreaterThan(0);
    expect(estimate.workUsd).toBeLessThanOrEqual(14);
    expect(estimate.includedRemainingUsd).toBeGreaterThanOrEqual(0);
    expect(read("src/components/usage-billing/UsagePricingPanel.tsx")).toContain(
      "starts from an example month; set it to yours.",
    );
  });

  it("starts a plain signup in free Bot setup and keeps chosen plans on review", () => {
    const redirect = read("src/lib/auth-redirect.ts");
    expect(redirect).toContain(
      'if (plan === "personal" || !plan) return firstBotSetupHref(template);',
    );
    expect(redirect).toContain(
      "return `${activationBillingHref(intent)}&onboarding=1${templateParam}`;",
    );
  });

  it("gives every industry page its pain points, questions and a pricing path", () => {
    const page = read("src/pages/VerticalLanding.tsx");
    expect(page).toContain("cfg.pains.map");
    expect(page).toContain("cfg.faqs.map");
    expect(page).toContain("{cfg.primaryCta.label}");
    expect(page).toContain('to="/pricing"');
    expect(page).toContain("{cfg.trustLine}");
  });

  it("shows no empty header row above Create Your Bot when there are no Bots", () => {
    const chrome = read("src/components/studio/StudioContextChrome.tsx");
    expect(chrome).toContain(
      "const knownEmpty = agents.length === 0 && !rosterDegraded && !rosterLoading;",
    );
    expect(chrome).toContain(
      'if (knownEmpty) return <h1 className="sr-only">{language.plural}</h1>;',
    );
  });
});
