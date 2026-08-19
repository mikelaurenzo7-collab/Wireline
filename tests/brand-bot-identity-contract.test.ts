import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("WIRELINE folded W identity", () => {
  it("uses filled ribbon geometry instead of the retired monoline and terminal dots", () => {
    const component = read("src/components/brand/WirelineMark.tsx");
    const icon = read("public/wireline-icon.svg");
    const favicon = read("public/favicon.svg");
    for (const source of [component, icon, favicon]) {
      expect(source).toContain("M76 14H100L132 106H108Z");
      expect(source).toContain("M42 106H68L100 14H74Z");
      expect(source).not.toContain("M4 16H11L19 32L24 21L29 32L37 16H44");
      expect(source).not.toContain('<circle cx="4" cy="16"');
    }
  });

  it("regenerates every install and billing raster from canonical vector sources", () => {
    const renderer = read("scripts/render-image-assets.mjs");
    for (const output of [
      "public/favicon.png",
      "public/apple-touch-icon.png",
      "public/wireline-icon-192.png",
      "public/wireline-icon-512.png",
      "public/wireline-stripe-icon.png",
      "public/wireline-stripe-logo.png",
    ]) {
      expect(renderer).toContain(`out: "${output}"`);
    }
    expect(renderer).toMatch(
      /src:\s*"scripts\/ios-app-icon\.svg"[\s\S]{0,180}out:\s*"ios\/Wireline\/Assets\.xcassets\/AppIcon\.appiconset\/icon\.png"[\s\S]{0,80}width:\s*1024/,
    );
  });

  it("treats WIRELINE as a reusable typographic object instead of ad-hoc text", () => {
    const brand = read("src/components/brand/WirelineBrand.tsx");
    const identity = read("src/styles/brand-identity.css");

    expect(brand).toContain('WIRELINE_BRAND_NAME = "WIRELINE"');
    expect(brand).toContain("WirelineWordmark");
    expect(brand).toContain("WirelineLockup");
    expect(brand).toContain('data-inline={inline ? "true" : "false"}');
    expect(brand).toContain('data-wireline-brand-lockup="true"');

    expect(identity).toContain(".wl-wireline-wordmark");
    expect(identity).toContain('.wl-wireline-wordmark[data-inline="true"]');
    expect(identity).toContain("--wl-wordmark-tracking");
    expect(identity).toContain("--wl-wordmark-inline-tracking");
    expect(identity).toContain(".wl-wireline-lockup");
    expect(identity).toContain('[data-surface="tile"]');
    expect(identity).toContain("forced-colors: active");
  });
});

describe("WIRELINE Phone Bot acquisition language", () => {
  it("locks the approved promise, uppercase brand name, and Bot taxonomy", () => {
    const product = read("src/lib/bot-product.ts");
    expect(product).toContain('name: "WIRELINE"');
    expect(product).toContain('slogan: "WIRE YOUR PHONE BOT"');
    expect(product).toContain('supportingLine: "CALL · EMAIL · TEXT"');
    expect(product).toContain('name: "Phone Bot"');
    expect(product).toContain('name: "Conversation Bot"');
    expect(product).toContain('name: "Human Bot"');
    expect(product).toContain('title: "YOUR BOT. ALREADY MOVING."');
    expect(product).not.toContain('title: "ONE WORKSPACE. EVERY BOT."');
  });

  it("keeps public metadata on WIRELINE + Phone Bot while retaining agent as technical compatibility", () => {
    const html = read("index.html");
    const landing = read("src/pages/LandingPage.tsx");
    const pageMeta = read("src/lib/page-meta.tsx");
    const productCopy = read("src/lib/product-copy.ts");

    expect(html).toContain("WIRELINE | WIRE YOUR PHONE BOT");
    expect(html).toContain('"slogan": "WIRE YOUR PHONE BOT"');
    expect(landing).toContain("WIRELINE | WIRE YOUR PHONE BOT");
    expect(pageMeta).toContain('const BRAND_SUFFIX = " | WIRELINE"');
    expect(pageMeta).toContain('replace(/\\bWireline\\b/gi, "WIRELINE")');
    expect(productCopy).toContain(
      "Technical routes, schemas, events, and APIs retain `agent` for compatibility",
    );
    expect(productCopy).toContain(
      "Render the WIRELINE brand name in uppercase everywhere it is customer-visible",
    );
    expect(productCopy).toContain(
      "Use Phone Bot as the public acquisition wedge; Call, Email, and Text are the compact channel proof.",
    );
  });

  it("installs into the unified workspace without a legacy Agents shortcut", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      start_url: string;
      shortcuts: Array<{ name: string; url: string }>;
    };
    expect(manifest.start_url).toBe("/overview");
    expect(manifest.shortcuts.map((shortcut) => shortcut.name)).toEqual([
      "BOT STUDIO",
      "INBOX",
      "KNOWLEDGE",
    ]);
    expect(manifest.shortcuts.some((shortcut) => shortcut.url === "/agents")).toBe(false);
  });
});

describe("WIRELINE casing hierarchy", () => {
  it("uses one canonical CSS entrypoint and keeps brand identity inside that cascade", () => {
    const index = read("src/index.css");
    const main = read("src/main.tsx");
    const identity = read("src/styles/brand-identity.css");

    expect(index).toContain('@import "./styles/brand-identity.css";');
    expect(main).toContain('import "./index.css"');
    expect(main).not.toContain('import "./styles/brand-identity.css"');
    expect(identity).toContain("Brand rule: the visible company name is always WIRELINE");
    expect(identity).not.toContain("legend, th, label");
    expect(identity).not.toContain("summary),");
  });

  it("uses the canonical lockup on highest-visibility public surfaces", () => {
    const header = read("src/components/marketing/PrecisionPublicHeader.tsx");
    const footer = read("src/components/marketing/MarketingFooter.tsx");
    const transition = read("src/components/TransitionSurface.tsx");
    const privacy = read("src/components/CookieConsent.tsx");

    expect(header).toContain('import { WirelineLockup } from "../brand/WirelineBrand"');
    expect(header).toContain("<WirelineLockup");
    expect(header).not.toContain(">Wireline</span>");

    expect(footer).toContain("WirelineLockup");
    expect(footer).toContain("WirelineWordmark");
    expect(footer).not.toContain(">Wireline</span>");

    expect(transition).toContain("WirelineLockup");
    expect(transition).not.toContain('<span className="wl-overline">Wireline</span>');

    expect(privacy).toContain("<WirelineWordmark inline />");
    expect(privacy).not.toContain("keeps Wireline working");
  });

  it("keeps technical lowercase wireline identifiers explicitly outside the visual brand rule", () => {
    const productCopy = read("src/lib/product-copy.ts");
    const identity = read("src/styles/brand-identity.css");

    expect(productCopy).toContain(
      "technical wireline identifiers, URLs, domains, email addresses, API names, event keys, and persisted values",
    );
    expect(identity).toContain("Technical identifiers, URLs, domains, email");
  });
});
