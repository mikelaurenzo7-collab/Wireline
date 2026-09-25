import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("BotBound marketing privacy dock and readable labels", () => {
  it("docks cookie consent without covering pricing or feature copy", () => {
    const consent = read("src/components/CookieConsent.tsx");
    const polish = read("src/styles/botbound-master-polish.css");

    expect(consent).toContain("wl-privacy-dock");
    expect(consent).toContain("wl-privacy-dock--above-sticky");
    expect(consent).toContain('root.dataset.wlPrivacyDock = "open"');
    expect(consent).not.toContain("sm:w-[720px]");
    expect(consent).not.toContain("z-[9999]");
    expect(polish).toContain(".wl-privacy-dock {");
    expect(polish).toContain("padding-bottom: calc(var(--wl-privacy-dock-space)");
    expect(polish).toContain(".wl-privacy-dock--above-sticky");
    expect(polish).toContain('html[data-wl-privacy-dock="open"] .wl-pricing-plan-grid');
    expect(polish).toContain('html[data-wl-privacy-dock="open"] .wl-pricing-usage-note');
    const pricing = read("src/pages/Pricing.tsx");
    expect(pricing).toContain("wl-pricing-plan-grid");
    expect(pricing).toContain("wl-pricing-usage-note");
  });

  it("keeps every Features label fully readable", () => {
    const features = read("src/pages/Features.tsx");
    const flow = read("src/styles/marketing-document-flow.css");
    const polish = read("src/styles/botbound-master-polish.css");

    for (const label of [
      "Shared Context",
      "Calls and Follow-Ups",
      "Scheduling and Handoff",
      "Your Rules and Approvals",
      "Your Playbook",
      "Clear Outcomes",
    ]) {
      expect(features).toContain(label);
    }
    expect(features).toContain('className="wl-features-grid"');
    expect(features).toContain("wl-features-grid__item");
    expect(features).not.toContain("truncate");
    expect(features).not.toContain("text-ellipsis");
    expect(flow).toContain(".marketing-surface.wl-features-page .wl-features-grid");
    expect(flow).toContain("white-space: normal");
    expect(polish).toContain(".marketing-surface.wl-features-page .wl-features-grid__item");
    expect(polish).toContain("text-overflow: clip");
  });

  it("treats paid-activation pause as intentional pricing chrome", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const polish = read("src/styles/botbound-master-polish.css");

    expect(pricing).toContain("wl-pricing-status");
    expect(pricing).toContain("Build free. Paid activation is currently unavailable.");
    expect(pricing).toContain("wl-pricing-plan-name");
    expect(pricing).toContain("Free Builder");
    expect(pricing).toContain('publicName: "Starter Plus"');
    expect(polish).toContain(".wl-pricing-status");
    expect(polish).toContain(".wl-pricing-plan-name");
    expect(polish).toContain("white-space: nowrap");
  });

  it("serves one BotBound web manifest on the common PWA paths", () => {
    const canonical = JSON.parse(read("public/site.webmanifest")) as { short_name: string };
    const json = JSON.parse(read("public/manifest.json")) as { short_name: string };
    const webmanifest = JSON.parse(read("public/manifest.webmanifest")) as { short_name: string };
    const aliases = read("src/server/register-production-static-aliases.ts");
    const vercel = JSON.parse(read("vercel.json")) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    const index = read("index.html");

    expect(canonical.short_name).toBe("BotBound");
    expect(json).toEqual(canonical);
    expect(webmanifest).toEqual(canonical);
    expect(index).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(aliases).toContain('app.get("/manifest.json", sendManifest)');
    expect(aliases).toContain('app.get("/manifest.webmanifest", sendManifest)');
    expect(aliases).toContain("application/manifest+json");
    expect(vercel.rewrites).toContainEqual({
      source: "/manifest.json",
      destination: "/site.webmanifest",
    });
    expect(vercel.rewrites).toContainEqual({
      source: "/manifest.webmanifest",
      destination: "/site.webmanifest",
    });
  });
});
