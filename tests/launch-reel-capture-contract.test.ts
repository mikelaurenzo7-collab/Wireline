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
const CERTIFIER = "scripts/run-marketing-kit.mjs";
const PUBLIC_HEALTH = "src/entrypoints/public-health-api.ts";

/** Vendors the reel doctrine forbids putting on screen or in reel copy. */
const VENDOR_MARKS = ["Bland", "Retell", "Vapi"];

describe("launch reel capture contract", () => {
  const kit = source(KIT);
  const certifier = source(CERTIFIER);
  const campaign = source(CAMPAIGN_DOC);
  const publicHealth = source(PUBLIC_HEALTH);

  it("generates reel copy from the campaign document rather than restating it", () => {
    expect(kit, "the kit must name the campaign document as its source").toContain(CAMPAIGN_DOC);
    expect(kit, "the kit must read the Brand Spine").toMatch(/function readBrandSpine/);
    for (const key of ["North star", "Compact line", "Outcome line", "CTA", "Price"]) {
      expect(campaign, `Brand Spine is missing "${key}"`).toContain(`| ${key} |`);
    }
  });

  it("keeps competitor names out of the generated reel copy", () => {
    const template = kit.slice(kit.indexOf("# Wireline marketing copy pack"));
    for (const vendor of VENDOR_MARKS) {
      expect(template, `reel copy must not name ${vendor}`).not.toContain(vendor);
    }
  });

  it("does not film the competitor comparison table", () => {
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
    expect(kit).toMatch(/\$\{spine\.price\}/);
    expect(kit).toMatch(/\$\{spine\.cta\}/);
  });

  it("never certifies local mock captures as publishable launch media", () => {
    expect(kit).toContain('mode: useMocks ? "local-mock" : "production-session"');
    expect(certifier).toContain('mode !== "production-session"');
    expect(certifier).toContain(
      "local-mock captures are layout/test fixtures only and must never produce a publishable release record.",
    );
    expect(certifier).toContain("publishable: true");
    expect(certifier).toContain("publishable: certifiedManifest.captureCertification.publishable");
  });

  it("restricts publishable capture to Wireline-owned production hosts", () => {
    expect(certifier).toContain("function isTrustedWirelineCaptureHost(hostname)");
    expect(certifier).toContain('host === "trywireline.com"');
    expect(certifier).toContain('host.endsWith(".trywireline.com")');
    expect(certifier).toContain('host === "wireline-chi.vercel.app"');
    expect(certifier).toContain("-revaluate\\.vercel\\.app");
    expect(certifier).toContain("Launch-reel certification refuses untrusted capture host");
    expect(certifier).toContain("does not allow credentials embedded in E2E_BASE_URL");
  });

  it("source-verifies every origin represented by a publishable manifest", () => {
    expect(certifier).toContain("async function verifyCaptureOrigins(sourceCommit)");
    expect(certifier).toContain(
      'const origins = [...new Set([configuredBaseURL, "https://trywireline.com"])]',
    );
    expect(certifier).toContain("verified.push(await verifyRemoteSourceCommit(sourceCommit, origin))");
    expect(certifier).toContain("function combineSourceVerification");
    expect(certifier).toContain("origins,");
  });

  it("proves every capture origin serves the checkout commit for the full capture window", () => {
    expect(publicHealth).toContain('res.setHeader("X-Wireline-Source-Commit", SOURCE_COMMIT)');
    expect(certifier).toContain('response.headers.get("x-wireline-source-commit")');
    expect(certifier).toContain("deployedCommit !== sourceCommit");
    expect(certifier).toContain("Do not certify footage when the deployed source cannot be proven.");
    expect(certifier).toContain("source_commit_check");
    expect(certifier).toContain("const beforeCapture = await verifyCaptureOrigins(sourceCommit)");
    expect(certifier).toContain("const afterCapture = await verifyCaptureOrigins(sourceCommit)");
    expect(certifier).toContain("verifiedBeforeCaptureAt");
    expect(certifier).toContain("verifiedAfterCaptureAt");
    expect(certifier).toContain("sourceVerification");
  });

  it("invalidates stale and partial release output whenever certification cannot finish", () => {
    expect(certifier).toContain("rmSync(outputRoot, { recursive: true, force: true })");
    expect(certifier).toContain("A certification attempt invalidates all prior generated output immediately");
    expect(certifier).toContain("Marketing-kit capture failed with exit code");
    expect(certifier).toMatch(/catch \(error\) \{\s*rmSync\(outputRoot, \{ recursive: true, force: true \}\);/);
  });

  it("resolves a browser the same way in every capture script", () => {
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
    expect(kit).toMatch(/video\.saveAs\(/);
    expect(kit).toMatch(/\$\{reel\.id\}\.webm/);
  });

  it("mocks the session route the app actually reads", () => {
    expect(kit, "the kit must mock /api/auth/session").toContain('"/api/auth/session"');
    expect(kit).toMatch(/return json\(\{ user: DEMO_USER \}\)/);
  });
});
