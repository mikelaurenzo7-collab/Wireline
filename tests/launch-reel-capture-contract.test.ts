import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

/**
 * The launch reels are generated, so the generator is held to the same campaign
 * document the voiceover already is.
 *
 * `scripts/generate-campaign-vo.mjs` reads its scripts from the campaign
 * document and a contract keeps them verbatim. The reel capture did not: it
 * hardcoded its own hero, hooks, and CTA, and they had drifted straight past
 * the guardrails in that same document. The 30s reel hook named three
 * competitors — against the reel doctrine's "Real product only; never stock
 * footage, mock dashboards, or vendor marks" — the 15s hook narrowed the whole
 * product to "your receptionist", and the CTA advertised a "Free Builder" and a
 * demo phone line while omitting the launch offer's mandated price line.
 *
 * Nothing read the two files together, so nothing noticed.
 */

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

const CAMPAIGN_DOC = "docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md";
const KIT = "scripts/marketing-kit.mjs";

/** Vendors the reel doctrine forbids putting on screen or in reel copy. */
const VENDOR_MARKS = ["Bland", "Retell", "Vapi"];

describe("launch reel capture contract", () => {
  const kit = source(KIT);
  const campaign = source(CAMPAIGN_DOC);

  it("generates reel copy from the campaign document rather than restating it", () => {
    expect(kit, "the kit must name the campaign document as its source").toContain(CAMPAIGN_DOC);
    expect(kit, "the kit must read the Brand Spine").toMatch(/function readBrandSpine/);
    // The spine keys the copy pack depends on have to exist upstream, or the
    // generator is reading a table that no longer says what it needs.
    for (const key of ["North star", "Compact line", "Outcome line", "CTA", "Price"]) {
      expect(campaign, `Brand Spine is missing "${key}"`).toContain(`| ${key} |`);
    }
  });

  it("keeps competitor names out of the generated reel copy", () => {
    // Comments may discuss the rule; the emitted template must not carry the
    // names, so only the generated markdown template is searched.
    const template = kit.slice(kit.indexOf("# Wireline marketing copy pack"));
    for (const vendor of VENDOR_MARKS) {
      expect(template, `reel copy must not name ${vendor}`).not.toContain(vendor);
    }
  });

  it("does not film the competitor comparison table", () => {
    // The reel doctrine is "never vendor marks". `/compare` is the one route in
    // the product that renders them, and a reel used to pan across it.
    const reels = kit.slice(
      kit.indexOf("const reels = ["),
      kit.indexOf("for (const reel of reels)"),
    );
    expect(reels, "no reel may record the /compare route").not.toMatch(/["'`]\/compare/);
  });

  it("carries the launch offer's price line, not a retired one", () => {
    const priceRow = campaign.match(/\|\s*Price\s*\|\s*(.+?)\s*\|/)?.[1] ?? "";
    expect(priceRow, "the campaign document must state a price line").not.toBe("");
    expect(priceRow).toContain("$19");
    // The copy pack interpolates the row rather than repeating a number, so a
    // price change in the document reaches the reels without a code edit.
    expect(kit).toMatch(/\$\{spine\.price\}/);
    expect(kit).toMatch(/\$\{spine\.cta\}/);
  });

  it("resolves a browser the same way in every capture script", () => {
    /*
     * The helper exists precisely for sandboxes with a preinstalled browser and
     * downloads disabled, and it had been wired into one of six callers. Both
     * asset producers — the marketing kit that records these reels, and the
     * official asset builder — died at launch with "Executable doesn't exist".
     * A reel cannot be re-cut from a script that cannot open a browser.
     */
    const offenders = globSync("scripts/**/*.mjs", { cwd: root })
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => !file.endsWith("resolve-preinstalled-chromium.mjs"))
      .filter((file) => /chromium\.launch\(/.test(source(file)))
      .filter((file) => !/chromiumLaunchOptions\(\)/.test(source(file)))
      .sort();

    expect(
      offenders,
      `these launch Chromium without the shared resolver:\n${offenders.join("\n")}\n` +
        "Spread `...chromiumLaunchOptions()` into the launch call.",
    ).toEqual([]);
  });

  it("names each captured reel after its cut", () => {
    // Playwright writes `page@<hash>.webm`; an editor should not have to
    // cross-reference a manifest to tell three reels apart.
    expect(kit).toMatch(/video\.saveAs\(/);
    expect(kit).toMatch(/\$\{reel\.id\}\.webm/);
  });

  it("mocks the session route the app actually reads", () => {
    /*
     * Without this the authenticated half of the kit is a screenshot of the
     * sign-in wall — and it fails silently. All eight "authenticated" desktop
     * stills were byte-identical at 123,587 bytes, the same login page filed
     * under eight product names, at three layouts, plus three reels recorded
     * against the same page. `mockSession` seeds the legacy localStorage key,
     * which AuthContext deletes during migration on first load.
     */
    expect(kit, "the kit must mock /api/auth/session").toContain('"/api/auth/session"');
    expect(kit).toMatch(/return json\(\{ user: DEMO_USER \}\)/);
  });
});
