import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

function reelBeatPaths(kit: string): string[] {
  const start = kit.indexOf("const reels = [");
  const end = kit.indexOf("for (const reel of reels)");
  if (start < 0 || end <= start) return [];

  const reels = kit.slice(start, end);
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
    const beats = reelBeatPaths(kit);
    const declared = declaredRoutePaths(appRoutes);
    const missing = beats.filter((path) => !declared.has(path));

    expect(beats).toEqual([
      "/",
      "/email",
      "/knowledge",
      "/overview",
      "/phone",
      "/settings/phone",
      "/studio",
    ]);
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
    expect(appRoutes).toContain('<Route path="/email" element={<EmailToInboxRedirect />} />');
  });

  it("does not call an unproven published edit release-current", () => {
    const mediaKit = source("docs/LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md");

    expect(mediaKit).toContain("release-current");
    expect(mediaKit).toContain("marketing-kit/release-record.json");
    expect(mediaKit).toContain("sourceCommit");
    expect(mediaKit).toContain("deployed production SHA");
    expect(mediaKit).toContain("Raw output is not release-certified.");
  });

  it("keeps public status cadence and claims aligned with the probes", () => {
    const status = source("src/components/Status.tsx");

    expect(status).toContain("const STATUS_REFRESH_MS = 60_000;");
    expect(status).toContain('cache: "no-store"');
    expect(status).toMatch(/window\.setInterval\([\s\S]*STATUS_REFRESH_MS\)/);
    expect(status).toContain("Updated every 60 seconds.");
    expect(status).toContain("refreshes every 60s.");
    expect(status).toContain("Probe interval · 60s");
    expect(status).toContain("Provider checks operational");
    expect(status).toContain("Managed voice access");
    expect(status).toContain("Reasoning model access");
    expect(status).toContain("not an end-to-end customer call");
    expect(status).not.toContain("All systems operational");
    expect(status).not.toContain("pings each production LLM tier");
    expect(status).not.toContain("configured fallback remains available");
  });

  /*
   * Found by driving the built page in a browser: /status never reached network
   * idle. Throwing on `!res.ok` left the response body unread, and an unread
   * body keeps the request open, so every failed 60s poll leaked another one for
   * the life of the page. Nothing bounded the request either — `authFetch`
   * carries a timeout but this page is public and calls `fetch` directly, so a
   * server that accepted and then stalled left it reading "Checking…" forever.
   * Both matter most during an incident, which is the only time anyone loads it.
   */
  it("keeps the public status poll bounded and leak-free", () => {
    const status = source("src/components/Status.tsx");

    expect(status).toContain("const STATUS_FETCH_TIMEOUT_MS = 15_000;");
    /*
     * The bound must come from AbortController + setTimeout, not
     * `AbortSignal.timeout`. That is a runtime API the es2022 target does not
     * polyfill: used bare it throws TypeError on browsers lacking it, and
     * feature-detecting it leaves the fallback with no timeout at all — which
     * silently restores the unbounded stall this guards against, on the one page
     * that must not invent an outage.
     */
    expect(status).toContain("const controller = new AbortController();");
    expect(status).toContain(
      "window.setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS)",
    );
    expect(status).toContain("signal: controller.signal,");
    expect(status).toContain("window.clearTimeout(timeout);");
    // Bans the call, not the comment that explains why it is avoided.
    expect(status).not.toMatch(/signal:\s*AbortSignal\.timeout/);
    expect(status).not.toMatch(/=\s*AbortSignal\.timeout\(/);
    expect(status).toContain("await res.body?.cancel().catch(() => undefined);");
    // The short feed-error line only earns its place next to a "Last checked"
    // timestamp; with no reading it repeated the heading a third time.
    expect(status).toContain("{error && data ? (");
  });
});
