import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("static marketing metadata", () => {
  it("keeps the HTML shell aligned with the Wire-your-agent story", () => {
    const index = read("index.html");

    expect(index).toContain("Wireline — Wire your agent.");
    expect(index).toContain("solo business agents");
    expect(index).toContain("call centers");
    expect(index).toContain("sales teams");
    expect(index).toContain("Wire your agent.");
    expect(index).not.toContain("Your phone, finally answering for you.");
  });

  it("keeps the OG image aligned with solo-business positioning", () => {
    const ogImage = read("public/og-image.svg");

    expect(ogImage).toContain("WIRE YOUR");
    expect(ogImage).toContain("AGENT");
    expect(ogImage).toContain("solo business");
    expect(ogImage).toContain("PERSONAL · SOLO BUSINESS · TEAMS · FOLLOW-UP");
  });

  it("keeps the installable web app manifest aligned with the public story", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      description: string;
    };

    expect(manifest.name).toBe("Wireline - Wire your agent");
    expect(manifest.description).toContain("personal assistants");
    expect(manifest.description).toContain("solo business agents");
    expect(manifest.description).toContain("teams");
  });
});
