import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The tab icon is fetched on every cold visit by every browser, and the
 * repository has already shipped a broken one once: favicon.ico was a 512px
 * JPEG wearing an .ico extension, and favicon.png was a 77 KB export. Neither
 * failure is visible in review — the tab still shows *something* — so the
 * format and weight are pinned here instead.
 */
describe("static icon integrity", () => {
  it("favicon.ico is a real ICO container", () => {
    const buf = readFileSync(resolve(process.cwd(), "public/favicon.ico"));
    // ICONDIR: reserved=0, type=1 (icon), count >= 1.
    expect(buf.readUInt16LE(0)).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1);
    expect(buf.readUInt16LE(4)).toBeGreaterThanOrEqual(1);
  });

  it("favicon.png is a real PNG at tab-icon weight", () => {
    const path = resolve(process.cwd(), "public/favicon.png");
    const buf = readFileSync(path);
    expect(buf.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(buf.readUInt32BE(16)).toBe(64);
    expect(buf.readUInt32BE(20)).toBe(64);
    // A tab icon has no business exceeding ~20 KB; the old 77 KB export was
    // pure waste on the critical path of every marketing page load.
    expect(statSync(path).size).toBeLessThan(20_000);
  });

  it("index.html points at both icon formats", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain('rel="icon" type="image/svg+xml" href="/favicon.svg"');
    expect(html).toContain('rel="icon" type="image/png" href="/favicon.png"');
  });
});
