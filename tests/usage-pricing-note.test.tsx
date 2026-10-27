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
  it("shows included work on each card and does not restate it in a paragraph", () => {
    availability.billingModel = "usage";
    const html = renderPricing();
    expect(html).toContain("$4 usage included");
    expect(html).toContain("$14 usage included");
    expect(html).toContain("$36 usage included");
    expect(html).toContain("$12");
    expect(html).toContain("$24");
    expect(html).toContain("$49");
    expect(html).not.toContain(sharedWorkNote());
    expect(html).not.toContain("Runtime Balance");
    expect(html).not.toContain("Extra minutes are");
    expect(html).not.toContain("botbound_work_credits");
  });

  it("keeps the same cards when checkout is still on the plans model", () => {
    availability.billingModel = "plans";
    const html = renderPricing();
    expect(html).toContain("$4 usage included");
    expect(html).not.toContain("Runtime Balance");
    expect(html).not.toContain("Extra minutes are");
  });
});
