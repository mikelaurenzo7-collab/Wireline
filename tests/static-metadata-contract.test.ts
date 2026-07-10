import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("static marketing metadata", () => {
  it("keeps the HTML shell aligned with the AI profit agent story", () => {
    const index = read("index.html");

    expect(index).toContain("Wireline — AI profit agents that actually call.");
    expect(index).toContain("AI profit agents with included numbers");
    expect(index).toContain("book appointments, revive leads, promote offers");
    expect(index).toContain("report back with every result");
    expect(index).not.toContain("AI phone employees that turn calls into sales.");
    expect(index).not.toContain("solo business agents");
    expect(index).not.toContain("Your phone, finally answering for you.");
  });

  it("keeps the OG image aligned with profit-agent positioning", () => {
    const ogImage = read("public/og-image.svg");

    expect(ogImage).toContain("AI PROFIT");
    expect(ogImage).toContain("AGENTS");
    expect(ogImage).toContain("Appointments · lead revival · promotions · recovery");
    expect(ogImage).toContain("APPOINTMENTS · LEAD REVIVAL · PROMOTIONS · RECOVERY · FOLLOW-UP");
  });

  it("keeps the installable web app manifest aligned with the public story", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      description: string;
    };

    expect(manifest.name).toBe("Wireline - AI profit agents");
    expect(manifest.description).toContain("AI profit agents");
    expect(manifest.description).toContain("included numbers");
    expect(manifest.description).toContain("book appointments");
    expect(manifest.description).toContain("every result");
  });
});
