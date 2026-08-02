import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

function reelBeatPaths(kit: string): string[] {
  const reels = kit.slice(
    kit.indexOf("const reels = ["),
    kit.indexOf("for (const reel of reels)"),
  );
  return [...reels.matchAll(/route:\s*["'`]([^"'`]+)["'`]/g)]
    .map((match) => new URL(match[1], "https://trywireline.com").pathname)
    .filter((path, index, all) => all.indexOf(path) === index)
    .sort();
}

function declaredRoutePaths(appRoutes: string): Set<string> {
  return new Set(
    [...appRoutes.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => !path.includes("*")),
  );
}

describe("launch completeness contracts", () => {
  it("routes the launch-reel command through the certifying wrapper and Vercel gate", () => {
    const pkg = JSON.parse(source("package.json")) as {
      scripts?: Record<string, string>;
    };
    const vercelBuild = source("scripts/vercel-build.mjs");

    expect(pkg.scripts?.["marketing:kit"]).toBe("node scripts/run-marketing-kit.mjs");
    expect(pkg.scripts?.["marketing:kit:raw"]).toBe("node scripts/marketing-kit.mjs");
    expect(vercelBuild).toContain('"tests/launch-completeness-contract.test.ts"');
  });

  it("freezes the exact source before capture and rejects unsafe output", () => {
    const wrapper = source("scripts/run-marketing-kit.mjs");
    const provenanceIndex = wrapper.indexOf("const sourceCommit = resolveSourceCommit();");
    const captureIndex = wrapper.indexOf("const capture = spawnSync");

    expect(provenanceIndex).toBeGreaterThan(-1);
    expect(captureIndex).toBeGreaterThan(provenanceIndex);
    expect(wrapper).toContain("assertCleanCheckout(sourceCommit);");
    expect(wrapper.match(/assertCleanCheckout\(sourceCommit\);/g)).toHaveLength(2);
    expect(wrapper).toContain("path.relative(outputRoot, resolved)");
    expect(wrapper).toMatch(/escapes marketing-kit\//);
    expect(wrapper).toContain("release-record.json");
    expect(wrapper).toContain("AUTHENTICATED_SCREENSHOT_IDS");
    expect(wrapper).toMatch(/byte-identical routes/);
    expect(wrapper).toMatch(/Expected exactly 3 launch-reel captures/);
    expect(wrapper).toMatch(/Expected authenticated screenshot certification/);
  });

  it("keeps every reel beat on a declared route instead of filming the authenticated 404", () => {
    const kit = source("scripts/marketing-kit.mjs");
    const appRoutes = source("src/routes/AppRoutes.tsx");
    const declared = declaredRoutePaths(appRoutes);
    const missing = reelBeatPaths(kit).filter((path) => !declared.has(path));

    expect(
      missing,
      `Launch reel beats reference routes absent from AppRoutes: ${missing.join(", ")}. ` +
        "A stale scene route records the authenticated 404 and can still look like a unique certified frame.",
    ).toEqual([]);
  });

  it("preserves the retired email deep link and its state while Inbox remains canonical", () => {
    const appRoutes = source("src/routes/AppRoutes.tsx");

    // The August 2 reel source used /email while the product had moved the
    // surface to /inbox. The resulting 15-second cut ended on a full 404 page.
    // Keep old external links and historical capture instructions safe while
    // preserving any tab/filter state carried in the query or hash.
    expect(appRoutes).toContain('<Route path="/inbox" element={<EmailPage />} />');
    expect(appRoutes).toContain("function EmailToInboxRedirect()");
    expect(appRoutes).toContain("`/inbox${location.search}${location.hash}`");
    expect(appRoutes).toContain(
      '<Route path="/email" element={<EmailToInboxRedirect />} />',
    );
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
