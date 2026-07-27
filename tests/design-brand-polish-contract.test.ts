import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("E2E design and brand polish", () => {
  it("keeps every mobile agent tab visible and readable", () => {
    const compactTabs = read("src/styles/agent-tabs-compact.css");
    expect(compactTabs).not.toContain("display: none");
    expect(compactTabs).toContain("overflow-x: auto");
    expect(compactTabs).toContain("min-height: 2.75rem");
    expect(compactTabs).toContain("font-size: 0.75rem");
    expect(compactTabs).toContain("button:nth-child(4)");
    expect(compactTabs).toContain("display: inline-flex");
  });

  it("keeps shared workspace tabs comfortable at compact density", () => {
    const tabs = read("src/components/layout/WorkspaceTabStrip.tsx");
    expect(tabs).toContain('"min-h-10 px-3 text-[13px] sm:px-3.5"');
    expect(tabs).toContain("overflow-x-auto overscroll-x-contain");
    expect(tabs).toContain("focus-visible:outline-offset-2");
  });

  it("keeps modal titles contained and body copy readable", () => {
    const dialog = read("src/components/atoms/Dialog.tsx");
    expect(dialog).toContain("text-xl font-semibold leading-[1.15]");
    expect(dialog).toContain('text-[15px] leading-6');
    expect(dialog).toContain("size-11");
    expect(dialog).toContain("max-h-[calc(100dvh-2rem)]");
    expect(dialog).toContain("overflow-y-auto overscroll-contain");
  });

  it("uses sentence case and relaxed measure in the public hero", () => {
    const hero = read("src/components/marketing/MarketingHero.tsx");
    const polish = read("src/styles/e2e-design-polish.css");
    expect(hero).not.toContain("uppercase leading");
    expect(hero).toContain("max-w-[19ch]");
    expect(hero).toContain("leading-[0.99]");
    expect(hero).toContain("font-[var(--wireline-font-family-body)]");
    expect(hero).toContain("sm:text-sm");
    expect(polish).toContain("text-transform: none");
    expect(polish).toContain("white-space: normal");
    expect(polish).toContain("line-height: 1");
  });

  it("loads the terminal design contract after responsive and modal overrides", () => {
    const index = read("src/index.css");
    const modalAt = index.indexOf('@import "./styles/modal-hierarchy.css";');
    const polishAt = index.indexOf('@import "./styles/e2e-design-polish.css";');
    expect(modalAt).toBeGreaterThan(-1);
    expect(polishAt).toBeGreaterThan(modalAt);
  });

  it("keeps public navigation and mobile conversion targets clear", () => {
    const header = read("src/components/marketing/PrecisionPublicHeader.tsx");
    const sticky = read("src/components/marketing/MarketingStickyCta.tsx");
    const footer = read("src/components/marketing/MarketingFooter.tsx");
    expect(header).toContain("text-sm font-medium");
    expect(header).toContain("min-h-10 px-4 text-sm font-semibold");
    expect(header).not.toContain("font-semibold uppercase");
    expect(sticky).toContain('label = "Build your agent"');
    expect(sticky).toContain('secondaryLabel = "Hear it live"');
    expect(sticky).toContain("min-h-[48px]");
    expect(footer).toContain("min-h-10 items-center");
  });

  it("keeps the landing journey punchy and outcome led", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("One agent. Every channel.");
    expect(landing).toContain("Train once. Work across every channel.");
    expect(landing).toContain("From brief to live agent in four clear steps.");
    expect(landing).toContain("Put your first voice agent to work.");
    expect(landing).toContain("Build free. Hear it live before you pay. Cancel anytime.");
    expect(landing).not.toContain("—");
    expect(landing).not.toContain("·");
  });
});
