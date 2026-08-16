import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("home landing launch clarity", () => {
  const landing = read("src/components/marketing/WireAgentLanding.tsx");

  it("keeps one concise product theater instead of a brochure stack", () => {
    expect(landing).not.toContain("REASSURANCES");
    expect(landing).toContain("Live Video");
    expect(landing).toContain('variant="stage"');
    expect(landing).toContain("One call. A completed next step.");
    expect(landing).toContain("Booked and logged");
  });

  it("keeps free and paid capacity distinct", () => {
    expect(landing).toContain("Start free.");
    expect(landing).toContain("Channels unlock at activation");
    expect(landing).toContain("Wireline number");
    expect(landing).toContain("Runtime Balance");
  });

  it("keeps conversion explicit and owner control visible", () => {
    expect(landing).toContain("See Plans");
    expect(landing).toContain("MARKETING_VOICE.primaryCta");
    expect(landing).toContain("rules, approvals, spend, and handoffs");
    expect(landing).not.toContain("Put your first voice agent to work");
    expect(landing).not.toContain("—");
    expect(landing).not.toContain("·");
  });
});
