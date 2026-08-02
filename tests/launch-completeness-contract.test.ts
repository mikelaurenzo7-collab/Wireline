import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("launch completeness contracts", () => {
  it("routes the launch-reel command through the certifying wrapper", () => {
    const pkg = JSON.parse(source("package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["marketing:kit"]).toBe("node scripts/run-marketing-kit.mjs");
    expect(pkg.scripts?.["marketing:kit:raw"]).toBe("node scripts/marketing-kit.mjs");
  });

  it("records the exact source commit and rejects duplicate authenticated frames", () => {
    const wrapper = source("scripts/run-marketing-kit.mjs");

    expect(wrapper).toContain("sourceCommit");
    expect(wrapper).toContain('gitValue(["rev-parse", "HEAD"])');
    expect(wrapper).toContain("release-record.json");
    expect(wrapper).toContain("AUTHENTICATED_SCREENSHOT_IDS");
    expect(wrapper).toMatch(/byte-identical routes/);
    expect(wrapper).toMatch(/Expected exactly 3 launch-reel captures/);
    expect(wrapper).toMatch(/Expected authenticated screenshot certification/);
  });

  it("does not call an unproven published edit release-current", () => {
    const mediaKit = source("docs/LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md");

    expect(mediaKit).toContain("release-current");
    expect(mediaKit).toContain("marketing-kit/release-record.json");
    expect(mediaKit).toContain("sourceCommit");
    expect(mediaKit).toContain("deployed production SHA");
    expect(mediaKit).toContain("Raw output is not release-certified.");
  });

  it("keeps the public status refresh cadence aligned with its 60-second copy", () => {
    const status = source("src/components/Status.tsx");

    expect(status).toContain("const STATUS_REFRESH_MS = 60_000;");
    expect(status).toMatch(/window\.setInterval\([\s\S]*STATUS_REFRESH_MS\)/);
    expect(status).toContain("Updated every 60 seconds.");
    expect(status).toContain("refreshes every 60s.");
    expect(status).toContain("Probe interval · 60s");
  });
});
