import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("home landing launch clarity", () => {
  const landing = read("src/components/marketing/WireAgentLanding.tsx");

  it("keeps the landing concise", () => {
    expect(landing).not.toContain("REASSURANCES");
    expect(landing).toContain("Live Video");
    // Cased titles carry no terminal punctuation, and the plans heading no
    // longer repeats the word on the button directly beneath it.
    // The plan cards are the plans block; the heading over them repeated the
    // first card's own button on a page that now carries one headline.
    expect(landing).toContain("variant=\"phone\"");
  });

  it("keeps free and paid capacity distinct", () => {
    expect(landing).toContain("Channels unlock at activation");
    expect(landing).toContain("Wireline number");
    expect(landing).toContain("Runtime Balance");
  });

  it("closes with one action", () => {
    expect(landing).toContain("See Plans");
    expect(landing).toContain("MARKETING_VOICE.primaryCta");
    expect(landing).not.toContain("Put your first voice agent to work");
    expect(landing).not.toContain("—");
    expect(landing).not.toContain("·");
  });
});
