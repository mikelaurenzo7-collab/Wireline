import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sharedWorkNote } from "../src/components/usage-billing/UsagePricingPanel";

const availability = vi.hoisted(() => ({
  billingModel: "usage" as "usage" | "plans",
}));

vi.mock("../src/hooks/usePaidPlanAvailability", () => ({
  usePaidPlanAvailability: () => ({
    billingModel: availability.billingModel,
    usageTiers: ["lite", "standard", "plus"],
    canActivate: () => true,
    emailSetupReview: false,
    notice: "Choose a plan and check out. Cancel anytime.",
    status: "ready",
    available: true,
    needsEmailSetupReview: () => false,
  }),
}));
vi.mock("../src/components/layout/MarketingPageFrame", () => ({
  default: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}));
vi.mock("../src/lib/page-meta", () => ({ PageMeta: () => null }));

import Pricing from "../src/pages/Pricing";

function renderPricing(): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Pricing)));
}

beforeEach(() => {
  const stored = new Map<string, string>();
  const location = new URL("https://botbound.app/pricing");
  vi.stubGlobal("window", {
    location,
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: string | URL) => {
        location.href = new URL(url, location.href).href;
      },
    },
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
    },
  });
});

describe("pricing branch notes", () => {
  it("shows the shared-work note on the usage branch", () => {
    availability.billingModel = "usage";
    const html = renderPricing();
    expect(html).toContain(sharedWorkNote());
    expect(html).toContain("Lite is $12/month with $4 of included work");
    expect(html).toContain("Starter is $24/month with $14 of included work");
    expect(html).toContain("and Plus is $49/month with $36 of included work");
    expect(html).toContain("Calls, texts, email, and Computer share that work.");
    expect(html).toContain("Extra numbers are $3/month and extra email addresses are $4/month.");
    expect(html).not.toContain("Extra minutes are");
    expect(html).not.toContain("botbound_work_credits");
  });

  it("keeps the prepaid minute line on the channel branch", () => {
    availability.billingModel = "plans";
    const html = renderPricing();
    expect(html).toContain(
      "Extra minutes are $0.22/min, paid from Runtime Balance you add ahead of time.",
    );
    expect(html).not.toContain("Lite is $12/month with $4 of included work");
  });
});
