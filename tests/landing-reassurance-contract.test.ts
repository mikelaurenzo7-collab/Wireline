import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("home landing launch clarity", () => {
  const landing = read("src/components/marketing/WireAgentLanding.tsx");

  it("keeps the landing concise", () => {
    expect(landing).not.toContain("REASSURANCES");
    expect(landing).toContain("Every channel. One agent.");
    expect(landing).toContain("Build free. Go live from $19.");
  });

  it("keeps free and paid capacity distinct", () => {
    expect(landing).toContain("Live channels unlock after activation");
    expect(landing).toContain("Wireline number");
    expect(landing).toContain("Runtime Balance");
  });

  it("closes with one action", () => {
    expect(landing).toContain("Put your first voice agent to work.");
    expect(landing).not.toContain("—");
    expect(landing).not.toContain("·");
  });
});
