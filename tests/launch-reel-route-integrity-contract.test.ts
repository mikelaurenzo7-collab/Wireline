import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

const KIT = "scripts/marketing-kit.mjs";
const APP_ROUTES = "src/routes/AppRoutes.tsx";

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

describe("launch reel route integrity", () => {
  const kit = source(KIT);
  const appRoutes = source(APP_ROUTES);

  it("keeps every reel beat on a declared route instead of filming the authenticated 404", () => {
    const declared = declaredRoutePaths(appRoutes);
    const missing = reelBeatPaths(kit).filter((path) => !declared.has(path));

    expect(
      missing,
      `Launch reel beats reference routes absent from AppRoutes: ${missing.join(", ")}. ` +
        "A stale scene route records the authenticated 404 and can still look like a unique certified frame.",
    ).toEqual([]);
  });

  it("preserves the retired email deep link and its state while Inbox remains canonical", () => {
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
});
