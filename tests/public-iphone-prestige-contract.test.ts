import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Final certification anchor for the screenshot-driven public/mobile prestige pass.
// Runtime source is frozen; this file guards the exact customer-facing decisions.
const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("BotBound public mobile and visual contract", () => {
  it("leads with Voice Bots and business numbers without repeating channel lists", () => {
    const product = read("src/lib/bot-product.ts");
    const landing = read("src/components/marketing/WireAgentLanding.tsx");

    expect(product).toContain('name: "BotBound"');
    expect(product).toContain('slogan: "Voice Bots. Business Numbers."');
    expect(product).toContain('supportingLine: "VOICE BOTS · BUSINESS NUMBERS"');
    expect(product).toMatch(
      /key:\s*"voice"[\s\S]*?label:\s*"Call"[\s\S]*?key:\s*"text"[\s\S]*?label:\s*"Text"[\s\S]*?key:\s*"email"[\s\S]*?label:\s*"Email"/,
    );

    expect(landing).toMatch(
      /<h1[^>]*>[\s\S]*?Voice Bots\.[\s\S]*?Business Numbers\.[\s\S]*?<\/h1>/,
    );
    expect(landing).toContain("BOT_MARKETING_VOICE.activationLine");
    expect(landing).toContain("branded BotBound email inbox");
    expect(landing).not.toContain("HERO_CHANNEL_ORDER");
    expect(landing).not.toContain("HERO_CHANNELS.map");
    expect(landing).not.toContain('aria-label="BotBound channels"');
    expect(landing).not.toMatch(/ONE WORKSPACE|one workspace/i);
  });

  it("treats the homepage as a product entrance on desktop and mobile", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const css = read("src/styles/landing-prestige.css");

    expect(landing).toContain("<PrecisionPublicHeader />");
    expect(landing).not.toContain("<AuthAccessPanel embedded");
    expect(css).toMatch(
      /\.landing-prestige__hero\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.04fr\) minmax\(20rem, 0\.96fr\)/,
    );
    expect(css).toMatch(
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__hero\s*\{[\s\S]*?display:\s*grid/,
    );
    expect(css).toMatch(
      /@media \(max-width: 600px\)[\s\S]*?\.landing-prestige__role-grid,[\s\S]*?\.landing-prestige__price-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(css).not.toMatch(
      /\.landing-prestige__hero,[\s\S]*?\.landing-prestige__desktop-only\s*\{[\s\S]*?display:\s*none/,
    );
  });

  it("uses the real shared auth implementation and removes audience classification from account entry", () => {
    const portal = read("src/components/AuthPortal.tsx");
    const access = read("src/components/auth/AuthAccessPanel.tsx");
    const accessStyles = read("src/styles/auth-access-panel.css");
    const mobileStyles = read("src/styles/public-mobile-refinement.css");

    expect(portal).toContain("AuthAccessPanel");
    expect(access).toContain("/api/auth/signin");
    expect(access).toContain("/api/auth/signup");
    expect(access).toContain('id: "google"');
    expect(access).toContain('id: "microsoft"');
    expect(access).toContain('id: "yahoo"');
    expect(access).toContain("/api/auth/${provider}/url");
    expect(access).not.toContain("WorkspaceSelector");
    expect(access).not.toMatch(/>Personal<|>Business</);
    expect(access).toContain("aria-labelledby={termsLabelId}");
    expect(access).toContain(
      "aria-describedby={error === TERMS_CONSENT_ERROR ? termsErrorId : undefined}",
    );
    expect(access).toContain("embedded ? <h2>{title}</h2> : <h1>{title}</h1>");
    expect(access).not.toContain("autoFocus");
    expect(access).toContain("<label htmlFor={emailInputId}>Email</label>");
    expect(access).toContain("<label htmlFor={passwordInputId}>Password</label>");
    expect(access).toContain("id={emailInputId}");
    expect(access).toContain("id={passwordInputId}");
    const passwordInput = access.indexOf("id={passwordInputId}");
    const passwordReveal = access.indexOf('className="wl-access-panel__reveal"', passwordInput);
    const passwordRecovery = access.indexOf('className="wl-access-panel__forgot"', passwordInput);
    expect(passwordInput).toBeGreaterThan(-1);
    expect(passwordReveal).toBeGreaterThan(passwordInput);
    expect(passwordRecovery).toBeGreaterThan(passwordReveal);
    expect(accessStyles).toContain(
      ".wl-access-panel__heading:has(+ .wl-access-panel__tabs) :is(h1, h2)",
    );
    expect(mobileStyles).not.toContain(
      ".landing-prestige__auth .wl-access-panel__heading :is(h1, h2)",
    );
    expect(accessStyles).not.toContain(
      ".wl-access-panel__heading:has(+ .wl-access-panel__tabs) h1",
    );
  });

  it("keeps the desktop privacy choice clear of launch conversion controls", () => {
    const consent = read("src/components/CookieConsent.tsx");

    expect(consent).toContain("sm:w-[720px] sm:max-w-[calc(100vw-2rem)]");
    expect(consent).not.toContain("lg:left-8 lg:right-8 lg:max-w-none");
    expect(consent).toContain(
      'className="flex-1 min-w-0 space-y-3 sm:flex sm:items-center sm:gap-3 sm:space-y-0"',
    );
    expect(consent).toContain(
      'className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2 sm:flex sm:shrink-0"',
    );
    expect(consent).toContain("sm:items-center");
  });

  it("keeps public entry on the master brand and reserves Bot marks for customers", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const component = read("src/components/BotMark.tsx");
    const generator = read("src/lib/bot-mark.ts");

    expect(landing).toContain("Voice Bots.");
    expect(landing).toContain("Business Numbers.");
    expect(landing).toContain("landing-prestige__hero-actions");
    expect(landing).toContain("branded BotBound email inbox");
    expect(landing).not.toContain("landing-prestige__directions");
    expect(landing).not.toContain("markKey");
    expect(landing).not.toMatch(/BrowserCallWidget|useProtectedPublicDemo/);
    expect(component).not.toMatch(/monogram|mark\.initial|showMicroMonogram/i);
    expect(generator).not.toMatch(/botMarkInitial|initial:\s*/i);
    expect(generator).toContain("BOT_MARK_SIGNATURE_CAPACITY = 1_048_576");
    expect(generator).toContain("BOT_MARK_CHOICES");
  });

  it("makes starter cards role-specific without rendering retired Personal/Business category labels", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const product = read("src/lib/bot-product.ts");

    expect(landing).toContain("Pick the Work. Put a Bot on It");
    expect(landing).toContain("template.moves.map");
    expect(landing).toContain("DIRECTION_LABELS[template.direction]");
    expect(landing).not.toContain("template.category");

    for (const specificMove of [
      "Intent + urgency + routing",
      "CRM handoff + next follow-up",
      "Knowledge-grounded answers",
      "Calendar booking + reminders",
      "Resident + vendor coordination",
      "Channels + actions + connected tools",
    ]) {
      expect(product).toContain(specificMove);
    }
  });

  it("flattens mobile public reading surfaces instead of stacking decorative cards", () => {
    const mobile = read("src/styles/public-mobile-refinement.css");
    const auth = read("src/styles/auth-access-panel.css");
    const indexCss = read("src/index.css");

    expect(auth).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.wl-access-panel__card\s*\{[\s\S]*?padding:[^}]+box-shadow:\s*none;/,
    );
    expect(mobile).toContain('[aria-label="Privacy Policy summary"]');
    expect(mobile).toContain("#privacy-choices");
    expect(indexCss.indexOf("public-mobile-refinement.css")).toBeLessThan(
      indexCss.indexOf("safe-area-ownership.css"),
    );
  });

  it("keeps one canonical BotBound design-system name", () => {
    const vision = read("src/lib/wireline-design-vision.ts");
    const surfaceContract = read("src/lib/surface-contract.ts");
    const designCss = read("src/styles/design-system.css");

    expect(vision).toContain('system: "BotBound Design System"');
    expect(surfaceContract).toContain('system: "BotBound Design System"');
    expect(designCss).toContain("BotBound Design System");
    expect(vision).not.toMatch(/system:\s*"(?:WIRELINE|BotBound) (?:Letterpress|Obsidian|Aurora)"/);
    expect(surfaceContract).not.toMatch(
      /system:\s*"(?:WIRELINE|BotBound) (?:Letterpress|Obsidian|Aurora)"/,
    );
    expect(designCss).not.toMatch(/Letterpress design system|Obsidian canvas|Aurora palette/i);
  });
});
