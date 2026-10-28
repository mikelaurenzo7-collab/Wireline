import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({
  status: "loading" as "loading" | "ready" | "unavailable",
  usageTiers: [] as Array<"lite" | "standard" | "plus">,
}));

vi.mock("../src/hooks/usePaidPlanAvailability", () => ({
  usePaidPlanAvailability: () => availability,
}));
vi.mock("../src/components/layout/MarketingPageFrame", () => ({
  default: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}));
vi.mock("../src/lib/page-meta", () => ({ PageMeta: () => null }));

import Pricing from "../src/pages/Pricing";

function renderPricing() {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Pricing)));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public pricing availability", () => {
  it.each(["loading", "unavailable"] as const)(
    "shows reference plans with an honest notice while availability is %s",
    (status) => {
      vi.stubGlobal("window", { location: { search: "" }, localStorage: { getItem: () => null } });
      availability.status = status;
      availability.usageTiers = [];
      const markup = renderPricing();
      expect(markup).toContain("Lite Plan Details");
      expect(markup).toContain("Starter Plan Details");
      expect(markup).toContain("Plus Plan Details");
      expect(markup).toContain('role="status"');
      expect(markup).toContain(
        status === "loading"
          ? "Checkout is not yet confirmed"
          : "Plan availability could not be checked",
      );
    },
  );

  it("honors the server's confirmed empty plan list", () => {
    vi.stubGlobal("window", { location: { search: "" }, localStorage: { getItem: () => null } });
    availability.status = "ready";
    availability.usageTiers = [];
    const markup = renderPricing();
    expect(markup).toContain("Plans are unavailable right now");
    expect(markup).not.toContain("Plan Details");
    expect(markup).not.toContain("Monthly estimate");
  });

  it("shows only the confirmed tiers when availability is ready", () => {
    vi.stubGlobal("window", { location: { search: "" }, localStorage: { getItem: () => null } });
    availability.status = "ready";
    availability.usageTiers = ["plus"];
    const markup = renderPricing();
    expect(markup).toContain("Plus Plan Details");
    expect(markup).not.toContain("Lite Plan Details");
    expect(markup).not.toContain("Starter Plan Details");
    expect(markup).not.toContain('role="status"');
  });
});
