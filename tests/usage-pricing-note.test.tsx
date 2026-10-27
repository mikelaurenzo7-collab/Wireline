import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/hooks/usePaidPlanAvailability", () => ({
  usePaidPlanAvailability: () => ({
    usageTiers: ["lite", "standard", "plus"],
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

describe("public pricing plan cards", () => {
  it("shows each work allowance beside its plan price without repeating the lineup below", () => {
    const html = renderPricing();
    expect(html).toContain("$4 shared work included");
    expect(html).toContain("$14 shared work included");
    expect(html).toContain("$36 shared work included");
    expect(html).toContain("Calls, SMS, email, and Computer. One shared allowance.");
    expect(html).not.toContain("Email, And Computer. One Shared Allowance.");
    expect(html).toContain(
      "Calls, SMS, email, and Computer share this allowance. Resets monthly with no rollover.",
    );
    expect(html).not.toContain("Lite is $12/month with $4 of included work");
    expect(html).not.toContain("Starter is $24/month with $14 of included work");
    expect(html).not.toContain("Plus is $49/month with $36 of included work");
    expect(html).not.toContain("Extra minutes are");
    expect(html).not.toContain("Runtime Balance");
    expect(html).not.toContain("botbound_work_credits");
    expect(html).toContain("Extra Number");
    expect(html).toContain("Extra Email Address");
  });
});
