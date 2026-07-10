import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("static marketing metadata", () => {
  it("keeps the HTML shell aligned with the AI phone employee story", () => {
    const index = read("index.html");

    expect(index).toContain("Wireline — AI phone employees that turn calls into sales.");
    expect(index).toContain("AI phone employees that answer calls");
    expect(index).toContain("qualify leads, book appointments");
    expect(index).toContain("report back with every result");
    expect(index).toContain("AI phone employees that turn calls into sales.");
    expect(index).not.toContain("solo business agents");
    expect(index).not.toContain("Your phone, finally answering for you.");
  });

  it("keeps the OG image aligned with broad phone-agent positioning", () => {
    const ogImage = read("public/og-image.svg");

    expect(ogImage).toContain("AI PHONE");
    expect(ogImage).toContain("EMPLOYEES");
    expect(ogImage).toContain("Sales · scheduling · intake · support");
    expect(ogImage).toContain("SALES · SCHEDULING · INTAKE · SUPPORT · FOLLOW-UP");
  });

  it("keeps the installable web app manifest aligned with the public story", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      description: string;
    };

    expect(manifest.name).toBe("Wireline - AI phone employees");
    expect(manifest.description).toContain("AI phone employees");
    expect(manifest.description).toContain("qualify leads");
    expect(manifest.description).toContain("book appointments");
    expect(manifest.description).toContain("every result");
  });
});
