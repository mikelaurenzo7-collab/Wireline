import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("static marketing metadata", () => {
  it("keeps the HTML shell aligned with Wire Work Win", () => {
    const index = read("index.html");

    expect(index).toContain("Wireline — Wire → Work → Win");
    expect(index).toContain("Voice AI employee for real conversations.");
    expect(index).toContain("calls, follow-up, booking, and logged outcomes");
    expect(index).toContain('"slogan": "Wire → Work → Win"');
    expect(index).not.toContain("AI phone employees that turn calls into sales.");
    expect(index).not.toContain("solo business agents");
    expect(index).not.toContain("Your phone, finally answering for you.");
  });

  it("keeps the OG image aligned with Wire Work Win", () => {
    const ogImage = read("public/og-image.svg");

    expect(ogImage).toContain("WIRE → WORK → WIN");
    expect(ogImage).toContain("VOICE AI EMPLOYEE");
    expect(ogImage).toContain("For real conversations.");
    expect(ogImage).toContain("CALLS · FOLLOW-UP · BOOKING · OUTCOMES · CONTROL");
    expect(ogImage).not.toContain("WIRE YOUR");
  });

  it("keeps the installable web app manifest aligned with the public story", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      description: string;
    };

    expect(manifest.name).toBe("Wireline - AI employees");
    expect(manifest.description).toContain("AI employees");
    expect(manifest.description).toContain("included numbers");
    expect(manifest.description).toContain("book appointments");
    expect(manifest.description).toContain("every result");
  });
});
