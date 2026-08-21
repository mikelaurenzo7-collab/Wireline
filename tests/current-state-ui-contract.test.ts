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

    expect(CLIENT_SURFACE_POSTURE.summary).toContain("Launch on the web");
    expect(CLIENT_SURFACE_POSTURE.summary).toContain("None are required for the core product");
    expect(CLIENT_SURFACE_POSTURE.browser.status).toBe("Early access");
    expect(CLIENT_SURFACE_POSTURE.android.status).toBe("Internal beta");
    expect(CLIENT_SURFACE_POSTURE.ios.status).toBe("Planned");
    expect(apps).toContain("CLIENT_SURFACE_POSTURE");
    expect(apps).toContain('href: "/settings/apps/command"');
    expect(apps).toContain('id="chatgpt-mcp"');
    expect(apps).not.toContain('status: "Live"');
    expect(commandBar).toContain('label: "Companion surfaces"');
    expect(commandBar).toContain("language.navLabel");
    expect(security).toContain("The web app is the GA product");
  });

  it("keeps account-bound MCP apps public without overstating authority", () => {
    const developers = read("src/pages/Developers.tsx");
    expect(developers).toContain("Connect Once");
    expect(developers).toContain("View MCP Endpoint");
    expect(developers).toContain("https://botbound.me");
    expect(developers).toContain("Add to Cursor");
    expect(developers.replace(/\s+/g, " ")).toContain(
      "This connector cannot place calls, send messages, provision numbers, or launch a live Bot",
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

  it("keeps public conversion routes on the explicit selected plan", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const hero = read("src/components/marketing/MarketingHero.tsx");
    const authPortal = read("src/components/AuthPortal.tsx");
    const authAccess = read("src/components/auth/AuthAccessPanel.tsx");

    expect(landing).toContain("STRIPE_PLANS");
    expect(landing).toContain("price_usd_monthly");
    expect(landing).toContain("to={signupHrefForPlan(id)}");
    expect(landing).toContain('signupHrefForPlan("personal", { template: template.key })');
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
      "Calls, text, email, tools, and outcomes with your Bot.",
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

  it("keeps optional Light appearance tertiary copy at WCAG AA contrast", () => {
    const lightTheme = read("src/styles/theme-light.css");
    const tertiary = lightTheme.match(/--wireline-color-text-tertiary:\s*(#[0-9a-f]{6})/i)?.[1];
    const canvas = lightTheme.match(/--wireline-color-canvas-default:\s*(#[0-9a-f]{6})/i)?.[1];
    const surface = lightTheme.match(/--wireline-color-surface-default:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(tertiary).toBeTruthy();
    expect(canvas).toBeTruthy();
    expect(surface).toBeTruthy();
    expect(contrastRatio(tertiary!, canvas!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tertiary!, surface!)).toBeGreaterThanOrEqual(4.5);
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
