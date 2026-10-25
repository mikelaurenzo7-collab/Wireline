import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CLIENT_SURFACE_POSTURE,
  PRODUCT_POSTURE,
  customerAgentLanguage,
} from "../src/lib/product-copy";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("current-state UI contract", () => {
  it("keeps authenticated headers start-aligned and wrap-safe", () => {
    const frame = read("src/components/layout/WorkspacePageFrame.tsx");
    const signature = read("src/styles/wireline-app-signature.css");
    expect(frame).toContain("data-align={align}");
    expect(frame).toContain("break-words text-balance");
    expect(signature).toContain('.wl-workspace-page-intro[data-align="start"]');
    expect(signature).toContain("justify-content: flex-start");
    expect(signature).toContain("text-overflow: clip");
    expect(signature).toContain('[data-wireline-route="/studio"]');
  });

  it("keeps companion availability honest to the web-first launch order", () => {
    const apps = read("src/pages/ClientAppsPage.tsx");
    const security = read("src/components/Security.tsx");
    const commandBar = read("src/components/CommandBar.tsx");

    expect(CLIENT_SURFACE_POSTURE.summary).toContain("Your Bots work from the web");
    expect(CLIENT_SURFACE_POSTURE.summary).toContain("Optional companion apps");
    expect(CLIENT_SURFACE_POSTURE.browser.status).toBe("Early access");
    expect(CLIENT_SURFACE_POSTURE.android.status).toBe("Internal beta");
    expect(CLIENT_SURFACE_POSTURE.ios.status).toBe("Planned");
    expect(apps).toContain("CLIENT_SURFACE_POSTURE");
    expect(apps).toContain('href: "/settings/apps/command"');
    expect(apps).toContain('id="chatgpt-mcp"');
    expect(apps).not.toContain('status: "Live"');
    expect(commandBar).toContain('label: "Companion Surfaces"');
    expect(commandBar).toContain("language.navLabel");
    expect(security).toContain("The web app is the GA product");
  });

  it("keeps account-bound MCP apps public without overstating authority", () => {
    const developers = read("src/pages/Developers.tsx");
    expect(developers).toContain("Connect once");
    expect(developers).toContain("View MCP endpoint");
    expect(developers).toContain("https://botbound.app");
    expect(developers).toContain("Add to Cursor");
    expect(developers.replace(/\s+/g, " ")).toContain(
      "Training writes require the Apps toggle and your confirmation. Continue in BotBound for live phone numbers, email, and cloud computer tasks on eligible paid plans.",
    );
    expect(developers).not.toContain("wl_YOUR_API_KEY");
    expect(developers).not.toContain("https://trywireline.com");
  });

  it("ships an in-product BotBound Command install path", () => {
    const install = read("src/pages/BrowserCommandInstallPage.tsx");
    const routes = read("src/routes/AppRoutes.tsx");
    expect(routes).toContain("BrowserCommandInstallPage");
    expect(routes).toContain('path="/settings/apps/command"');
    expect(install).toContain("Install BotBound Command");
    expect(install).toContain("Pin BotBound Command");
    expect(install).toContain("Load unpacked");
    expect(install).not.toContain("WIRELINE Command");
  });

  it("keeps generic signup neutral while preserving explicit plan and role selections", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const hero = read("src/components/marketing/MarketingHero.tsx");
    const authPortal = read("src/components/AuthPortal.tsx");
    const authAccess = read("src/components/auth/AuthAccessPanel.tsx");

    expect(landing).not.toContain("STRIPE_PLANS");
    expect(landing).not.toContain("price_usd_monthly");
    expect(landing).not.toContain("to={signupHrefForPlan(id)}");
    expect(landing).toContain('signedIn ? "/studio" : "/signup"');
    expect(landing).not.toContain("/signup?template=");
    expect(hero).toContain("marketing-hero__title");
    expect(hero).toContain("marketing-hero__actions");
    expect(authPortal).toContain('location.pathname.startsWith("/signup/")');
    expect(authPortal).toContain("AuthAccessPanel");
    expect(authAccess).toContain("STRIPE_PLANS.find");
    expect(authAccess).toContain("plan.price_usd_annual");
    expect(authAccess).toContain("plan.price_usd_monthly");
    expect(authAccess).toContain("preferredPlanId");
    expect(authAccess).not.toContain('starter: "Starter · $9/month"');
  });

  it("keeps one Bot language across legacy account modes", () => {
    expect(customerAgentLanguage("personal")).toEqual(customerAgentLanguage("business"));
    expect(PRODUCT_POSTURE.personal).toEqual(PRODUCT_POSTURE.business);
    expect(PRODUCT_POSTURE.personal.emptyBody).toBe(
      "Calls, email, computer tasks, and outcomes with your Bot.",
    );
    const copy = read("src/lib/product-copy.ts");
    expect(copy).toContain("under your direction");
    expect(copy).toContain("guardrails");
    expect(copy).toContain("approvals");
    expect(copy).toContain("consent rules");
    expect(copy).toContain(
      "Treat workspace architecture as product proof, never as a marketing headline.",
    );
  });

  it("keeps the design-system cascade, mobile controls, and dock geometry unified", () => {
    const main = read("src/main.tsx");
    const index = read("src/index.css");
    const responsive = read("src/styles/responsive.css");
    const input = read("src/components/atoms/Input.tsx");
    const select = read("src/components/atoms/NativeSelect.tsx");
    const textarea = read("src/components/atoms/Textarea.tsx");
    const radixSelect = read("src/components/ui/shadcn/Select.tsx");

    expect(main).toContain('import "./index.css"');
    expect(main).not.toMatch(/styles\/(?:foundation|responsive|ruthless-mobile-cleanup)/);
    expect(index).toMatch(
      /system-hardening\.css";[\s\S]*responsive\.css";[\s\S]*ruthless-mobile-cleanup\.css";[\s\S]*agent-tabs-compact\.css";/,
    );
    expect(responsive).toContain(".wl-workspace-main");
    for (const source of [input, select]) {
      expect(source).toContain("h-11");
      expect(source).toContain("text-base");
      expect(source).toContain("md:text-sm");
    }
    expect(textarea).toContain("text-base");
    expect(radixSelect).toContain("min-h-11");
  });

  it("keeps tertiary copy readable across every standard surface in both appearances", () => {
    const dark = JSON.parse(read("design-tokens/wireline.tokens.json")) as {
      color: {
        text: { tertiary: { $value: string } };
        canvas: Record<string, { $value: string }>;
        surface: Record<string, { $value: string }>;
      };
    };
    const lightTheme = read("src/styles/theme-light.css");
    const lightColor = (name: string) => {
      const color = lightTheme.match(
        new RegExp(`--wireline-color-${name}:\\s*(#[0-9a-f]{6})`, "i"),
      )?.[1];
      expect(color, `Light token ${name}`).toBeTruthy();
      return color!;
    };
    for (const group of ["canvas", "surface"] as const) {
      for (const [name, background] of Object.entries(dark.color[group])) {
        expect(
          contrastRatio(dark.color.text.tertiary.$value, background.$value),
          `Dark tertiary on ${group}-${name}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(lightColor("text-tertiary"), lightColor(`${group}-${name}`)),
          `Light tertiary on ${group}-${name}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const container of ["container", "containerStrong"]) {
      expect(
        contrastRatio(
          lightColor("action-secondary-default"),
          lightColor(`action-secondary-${container}`),
        ),
        `Light wire-action text on ${container}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps Federal DNC deferral separate from live route safeguards", () => {
    const readiness = read("src/lib/launch-readiness.ts");
    const gate = read("src/lib/outbound-dial-gate.ts");
    expect(readiness).toContain("deferred_checklist");
    expect(gate).toContain("isDncBlocked(opts.userId, opts.phone)");
    expect(gate).toContain("resolveCallingHoursForPhone");
    expect(gate).toContain("evaluateOutboundConsent");
    expect(gate).toContain("const federalGate = assertFederalDncForMarketing()");
  });
});
