import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CLIENT_SURFACE_POSTURE, PRODUCT_POSTURE } from "../src/lib/product-copy";

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
  it("keeps authenticated product headers start-aligned and wrap-safe", () => {
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
    expect(CLIENT_SURFACE_POSTURE.chatgpt.status).toBe("Early access");
    expect(CLIENT_SURFACE_POSTURE.claude.status).toBe("Early access");
    expect(CLIENT_SURFACE_POSTURE.cursor.status).toBe("Early access");
    expect(CLIENT_SURFACE_POSTURE.android.status).toBe("Internal beta");
    expect(CLIENT_SURFACE_POSTURE.ios.status).toBe("Planned");
    expect(apps).toContain("CLIENT_SURFACE_POSTURE");
    expect(apps).toContain('title: "Cursor"');
    expect(apps).toContain('href: "/settings/apps/command"');
    // ChatGPT setup stays in the authenticated Apps shell (no public marketing eject).
    expect(apps).toContain('href: "/settings/apps#chatgpt-mcp"');
    expect(apps).toContain('id="chatgpt-mcp"');
    expect(apps).toContain("https://trywireline.com/mcp");
    expect(apps).toContain('from "react-router-dom"');
    expect(apps).not.toContain(
      "mailto:support@trywireline.com?subject=Wireline%20Command%20install%20guide",
    );
    expect(apps).not.toContain('status: "Live"');
    expect(apps).not.toContain('action: "TestFlight"');
    expect(commandBar).toContain('label: "Companion surfaces"');
    expect(commandBar).not.toContain("Wireline everywhere");
    expect(security).toContain("The web app is the GA product");
    expect(security).toContain("Marketing and campaign outbound fail closed");
    expect(security).not.toContain("until then, only tenant lists apply");
  });

  it("makes the account-bound MCP apps public without overstating their authority", () => {
    const developers = read("src/pages/Developers.tsx");

    expect(developers).toContain(
      "Connect once. Draft and simulate in the client you already open.",
    );
    expect(developers).toContain("Copy MCP endpoint");
    expect(developers).toContain("https://trywireline.com/mcp");
    expect(developers).toContain("https://claude.ai/settings/connectors");
    expect(developers).toContain("Cursor");
    expect(developers).toContain("one account-bound MCP connector");
    expect(developers).toContain(
      "this connector cannot place calls, send messages,\n              provision numbers, or launch a live AI voice agent.",
    );
    // No fake API-key product — session OpenAPI + MCP OAuth only.
    expect(developers).not.toContain("Settings -> API Access");
    expect(developers).not.toContain("wl_YOUR_API_KEY");
    expect(developers).not.toContain("https://chatgpt.com/plugins");
  });

  it("ships an in-product Wireline Command install path with downloadable packages", () => {
    const install = read("src/pages/BrowserCommandInstallPage.tsx");
    const routes = read("src/routes/AppRoutes.tsx");
    expect(routes).toContain("BrowserCommandInstallPage");
    expect(routes).toContain('path="/settings/apps/command"');
    expect(install).toContain("/downloads/wireline-command-chromium.zip");
    expect(install).toContain("/downloads/wireline-command-firefox.zip");
    expect(install).toContain("Load unpacked");
    expect(install).toContain("manifest.json in the unzipped folder");
    expect(install).not.toContain("firefox/manifest.json");
    expect(install).not.toContain("unzipped chromium folder");
  });

  it("keeps public conversion routes on the selected launch plan", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const hero = read("src/components/marketing/MarketingHero.tsx");
    const auth = read("src/components/AuthPortal.tsx");

    expect(landing).toContain('name: "Starter"');
    expect(landing).toContain("planCatalog.starter.price_usd_monthly");
    expect(landing).toContain("/signup?plan=starter&mode=outbound");
    expect(landing).toContain("/signup?plan=starter&mode=inbound");
    expect(landing).toContain("/signup?plan=starter&mode=hybrid");
    expect(hero).toContain('aria-label="Wire to Work to Win"');
    expect(hero).toContain("MARKETING_VOICE.spine.map");
    // Pill wraps when the label doesn't fit on 360px screens rather than
    // forcing horizontal page overflow. Keep the label allocation gates.
    expect(hero).toContain("flex-wrap");
    expect(hero).toContain("size-[1em] shrink-0");
    expect(hero).toContain("max-w-[22rem] grid-cols-2");
    expect(hero).toContain("col-span-2 sm:col-span-1");

    expect(auth).toContain('pathname === "/signup" || pathname === "/get-started"');
    expect(auth).toContain("STRIPE_PLANS.map");
    expect(auth).toContain("plan.price_usd_monthly");
    expect(auth).not.toContain('starter: "Starter · $9/month"');
    expect(auth).toContain(': "starter";');
    expect(auth).not.toContain('nextMode === "business" ? "business" : "personal"');
  });

  it("keeps account entry and shared page headers centered, concise, and wrap-safe", () => {
    const auth = read("src/components/AuthPortal.tsx");
    const authCss = read("src/styles/precision-auth.css");
    const mobile = read("src/styles/ruthless-mobile-cleanup.css");
    const shell = read("src/components/WorkspaceShell.tsx");
    const features = read("src/pages/Features.tsx");

    expect(auth).toContain("max-w-[520px]");
    expect(auth).toContain('shortText: "Just me"');
    expect(auth).toContain('shortText: "Team workspace"');
    expect(auth).toContain("sm:grid-cols-2");
    expect(auth).toContain('const nextPath = value ? "/signup" : "/signin"');
    expect(auth).toContain("location.search");
    expect(auth).not.toContain("AuthBrandPanel");
    expect(authCss).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(authCss).toContain("@media (min-width: 640px) and (max-height: 900px)");
    expect(mobile).toMatch(/\.wl-stitch-auth-card > \.mb-6\.text-center[\s\S]*display: block/);
    expect(shell).toContain("max-w-[32ch] break-words text-balance");
    expect(shell).not.toContain('className="truncate font-[var(--wireline-font-family-display)]');
    for (const step of ["Build", "Train", "Launch", "Improve"]) {
      expect(features).toContain(`step: "${step}"`);
    }
  });

  it("keeps the design-system cascade, mobile controls, and dock geometry unified", () => {
    const main = read("src/main.tsx");
    const index = read("src/index.css");
    const responsive = read("src/styles/responsive.css");
    const input = read("src/components/atoms/Input.tsx");
    const select = read("src/components/atoms/NativeSelect.tsx");
    const textarea = read("src/components/atoms/Textarea.tsx");
    const radixSelect = read("src/components/ui/shadcn/Select.tsx");
    const navigation = read("src/constants/navigation.ts");

    expect(main).toContain('import "./index.css"');
    expect(main).not.toMatch(/styles\/(?:foundation|responsive|ruthless-mobile-cleanup)/);
    expect(index).toMatch(
      /system-hardening\.css";[\s\S]*responsive\.css";[\s\S]*ruthless-mobile-cleanup\.css";[\s\S]*agent-tabs-compact\.css";/,
    );
    expect(index).toContain("font-size: 16px");
    expect(responsive).toContain("padding-bottom: calc(5.25rem + env(safe-area-inset-bottom));");
    for (const source of [input, select]) {
      expect(source).toContain("h-11");
      expect(source).toContain("text-base");
      expect(source).toContain("md:text-sm");
    }
    expect(textarea).toContain("text-base");
    expect(radixSelect).toContain("min-h-11");
    expect(navigation).toContain('label: "Connections"');
    expect(navigation).toContain('shortLabel: "Connect"');
    expect(navigation).toContain('shortLabel: "Train"');
  });

  it("keeps optional Paper theme tertiary copy at WCAG AA contrast", () => {
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

  it("uses direction and guardrails for product control without weakening legal consent copy", () => {
    const copy = read("src/lib/product-copy.ts");

    expect(copy).toContain("under the owner's direction");
    expect(copy).toContain("under your direction");
    expect(PRODUCT_POSTURE.personal.emptyBody).toBe(
      "Your calls. Your texts. Your email. Your outcomes.",
    );
    expect(copy).toContain("guardrails, approvals, spend, handoffs, and escalation");
    expect(copy).not.toContain("under the owner's rules");
    expect(copy).toContain("consent rules");
  });
});
