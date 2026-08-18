import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Wireline folded W identity", () => {
  it("uses filled ribbon geometry instead of the retired monoline and terminal dots", () => {
    const component = read("src/components/brand/WirelineMark.tsx");
    const icon = read("public/wireline-icon.svg");
    const favicon = read("public/favicon.svg");

    for (const source of [component, icon, favicon]) {
      expect(source).toContain("M76 14H100L132 106H108Z");
      expect(source).toContain("M42 106H68L100 14H74Z");
      expect(source).not.toContain("M4 16H11L19 32L24 21L29 32L37 16H44");
      expect(source).not.toContain("<circle cx=\"4\" cy=\"16\"");
    }
  });

  it("regenerates every install and billing raster from canonical vector sources", () => {
    const renderer = read("scripts/render-image-assets.mjs");

    expect(renderer).toContain('out: "public/favicon.png"');
    expect(renderer).toContain('out: "public/apple-touch-icon.png"');
    expect(renderer).toContain('out: "public/wireline-icon-192.png"');
    expect(renderer).toContain('out: "public/wireline-icon-512.png"');
    expect(renderer).toContain('out: "public/wireline-stripe-icon.png"');
    expect(renderer).toContain('out: "public/wireline-stripe-logo.png"');
    expect(renderer).toContain(
      '{ src: "scripts/ios-app-icon.svg", out: "ios/Wireline/Assets.xcassets/AppIcon.appiconset/icon.png", width: 1024 }',
    );
  });
});

describe("Wireline voice-first Bot language", () => {
  it("locks the approved promise and Bot taxonomy", () => {
    const product = read("src/lib/bot-product.ts");

    expect(product).toContain('slogan: "BOTS THAT GET THE WORK DONE"');
    expect(product).toContain(
      'supportingLine: "VOICE-FIRST BOTS FOR CALLS, LIVE CONVERSATIONS, TEXT, AND EMAIL"',
    );
    expect(product).toContain('name: "Voice Bot"');
    expect(product).toContain('name: "Conversation Bot"');
    expect(product).toContain('name: "Human Bot"');
    expect(product).toContain('title: "ONE WORKSPACE. EVERY BOT."');
  });

  it("keeps public metadata on Bots while retaining agent only as a technical compatibility term", () => {
    const html = read("index.html");
    const landing = read("src/pages/LandingPage.tsx");
    const productCopy = read("src/lib/product-copy.ts");

    expect(html).toContain("WIRELINE | VOICE BOTS THAT GET THE WORK DONE");
    expect(html).toContain('"slogan": "BOTS THAT GET THE WORK DONE"');
    expect(html).not.toContain("Voice agents that get the work done");
    expect(landing).toContain("WIRELINE | VOICE BOTS THAT GET THE WORK DONE");
    expect(productCopy).toContain(
      "Technical routes, schemas, events, and APIs retain `agent` for compatibility",
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

describe("Wireline casing hierarchy", () => {
  it("uses the canonical uppercase system and keeps identity CSS free of broad prose selectors", () => {
    const identity = read("src/styles/brand-identity.css");
    const casing = read("src/styles/uppercase-system.css");
    const main = read("src/main.tsx");

    expect(main).toContain('import "./styles/brand-identity.css"');
    expect(casing).toContain("text-transform: uppercase");
    expect(casing).toContain(".wl-preserve-case");
    expect(casing).toContain("text-transform: none !important");
    expect(identity).toContain("Do not duplicate those selectors here");
    expect(identity).not.toContain("legend, th, label");
    expect(identity).not.toContain("summary),");
  });
});
