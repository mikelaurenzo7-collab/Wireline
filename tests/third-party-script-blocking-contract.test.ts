import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const indexHtml = read("index.html");
const measurement = read("public/marketing-measurement.js");

/**
 * A third-party `<script defer>` in index.html is never "just an analytics
 * tag": deferred scripts run in document order and DOMContentLoaded waits for
 * all of them, so one placed above the app's module bundle stalls the entire
 * UI whenever that host is slow, ad-blocked (blackholed rather than refused),
 * or unreachable behind a corporate proxy. Measured against a blocked host,
 * the static Plausible tag cost FCP 12,936ms versus 280ms without it.
 *
 * Both marketing vendors must therefore be injected dynamically, which is also
 * the pattern the Meta pixel already used.
 */
describe("third-party marketing scripts never block the app", () => {
  it("keeps every third-party marketing host out of static index.html script tags", () => {
    const scriptTags = indexHtml.match(/<script\b[^>]*>/gi) ?? [];
    const externalSrcTags = scriptTags.filter((tag) => /\bsrc\s*=\s*["']https?:/i.test(tag));
    expect(
      externalSrcTags,
      "index.html must not load third-party scripts statically — inject them from marketing-measurement.js instead",
    ).toEqual([]);

    for (const host of ["plausible.io", "connect.facebook.net"]) {
      expect(
        new RegExp(`<script[^>]*src=["'][^"']*${host.replace(".", "\\.")}`, "i").test(indexHtml),
        `${host} must not be a static script tag in index.html`,
      ).toBe(false);
    }
  });

  it("still ships the Plausible queue stub so no event is lost before the script lands", () => {
    // The stub is what makes async injection safe: calls made before the real
    // bundle arrives queue on plausible.q and flush when it loads.
    expect(indexHtml).toContain("window.plausible.q = window.plausible.q || []");
  });

  it("injects Plausible dynamically, skipping localhost", () => {
    expect(measurement).toContain("function loadPrivacyAnalytics()");
    expect(measurement).toContain("https://plausible.io/js/script.tagged-events.js");
    expect(measurement).toContain('script.setAttribute("data-domain"');
    expect(measurement).toContain("if (isLocalHost()) return;");
    // Guard against a double-injection regression on consent re-entry.
    expect(measurement).toContain("window.__wirelinePlausibleLoaded");
    expect(measurement).toContain("loadPrivacyAnalytics();");
  });

  it("keeps the Meta pixel async and consent-gated", () => {
    expect(measurement).toContain("script.async = true");
    expect(measurement).toContain("https://connect.facebook.net/en_US/fbevents.js");
    expect(measurement).toContain('if (readConsent() !== "granted")');
  });

  it("preloads the Latin faces the shell renders with", () => {
    // Without these the browser cannot discover a woff2 until fonts.css is
    // fetched and parsed, which shows brand text in the fallback face first.
    for (const face of [
      "/fonts/NGSwv5HMAFg6IuGlBNMjxLsH8ag.woff2",
      "/fonts/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2",
      "/fonts/-F6qfjptAgt5VM-kVkqdyU8n3pQPwlBFgg.woff2",
    ]) {
      expect(indexHtml).toContain(`href="${face}"`);
    }
    const preloads = indexHtml.match(/<link[^>]*rel="preload"[^>]*as="font"[^>]*>/gi) ?? [];
    expect(preloads.length).toBe(3);
    // A font preload without crossorigin is fetched twice.
    for (const tag of preloads) expect(tag).toMatch(/crossorigin/);
  });
});
