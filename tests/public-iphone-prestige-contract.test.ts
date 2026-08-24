import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Final certification anchor for the screenshot-driven public/mobile prestige pass.
// Runtime source is frozen; this file guards the exact customer-facing decisions.
const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("BotBound public iPhone prestige contract", () => {
  it("makes Phone Bot the public wedge and keeps channel proof in CALL · TEXT · EMAIL order", () => {
    const product = read("src/lib/bot-product.ts");
    const landing = read("src/components/marketing/WireAgentLanding.tsx");

    expect(product).toContain('name: "BotBound"');
    expect(product).toContain('slogan: "PUT YOUR BOT ON THE LINE"');
    expect(product).toContain('supportingLine: "CALL · TEXT · EMAIL"');
    expect(product).toMatch(
      /key:\s*"voice"[\s\S]*?label:\s*"Call"[\s\S]*?key:\s*"text"[\s\S]*?label:\s*"Text"[\s\S]*?key:\s*"email"[\s\S]*?label:\s*"Email"/,
    );

    expect(landing).toMatch(
      /<h1[^>]*>[\s\S]*?<span>PUT YOUR BOT<\/span>[\s\S]*?<span>ON THE LINE<\/span>[\s\S]*?<\/h1>/,
    );
    expect(landing).toContain('const HERO_CHANNEL_ORDER = ["voice", "text", "email"] as const;');
    expect(landing).toContain("BOT_CHANNELS.find((candidate) => candidate.key === key)");
    expect(landing).toContain("{HERO_CHANNELS.map((label) =>");
    expect(landing).not.toMatch(/ONE WORKSPACE|one workspace/i);
  });

  it("treats the homepage as a product entrance on desktop and mobile", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const css = read("src/styles/landing-prestige.css");

    expect(landing).toContain('<AuthAccessPanel embedded initialMode="signin" />');
    expect(landing).not.toContain("PrecisionPublicHeader");
    expect(css).toMatch(
      /\.landing-prestige__entrance\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/,
    );
    expect(css).toMatch(
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__entrance\s*\{[\s\S]*?display:\s*flex;[\s\S]*?min-height:\s*auto/,
    );
    expect(css).toMatch(
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__hero\s*\{[\s\S]*?display:\s*grid/,
    );
    expect(css).toMatch(
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__desktop-only\s*\{[\s\S]*?display:\s*block/,
    );
    expect(css).toMatch(
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__auth\s*\{[\s\S]*?min-height:\s*auto/,
    );
    expect(css).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.landing-prestige__role-grid,[\s\S]*?\.landing-prestige__price-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
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
    expect(access).toContain("autoFocus={!embedded}");
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
    expect(mobileStyles).toContain(".landing-prestige__auth .wl-access-panel__heading :is(h1, h2)");
    expect(accessStyles).not.toContain(
      ".wl-access-panel__heading:has(+ .wl-access-panel__tabs) h1",
    );
  });

  it("keeps the desktop privacy choice clear of launch conversion controls", () => {
    const consent = read("src/components/CookieConsent.tsx");

    expect(consent).toContain("sm:w-[420px] sm:max-w-[calc(100vw-2rem)]");
    expect(consent).not.toContain("lg:left-8 lg:right-8 lg:max-w-none");
    expect(consent).toContain("lg:flex lg:items-center lg:gap-4 lg:space-y-0");
    expect(consent).toContain("lg:flex-nowrap lg:shrink-0");
  });

  it("renders Jordan as a compact animated letterless signal, not a portrait or monogram", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const component = read("src/components/BotMark.tsx");
    const generator = read("src/lib/bot-mark.ts");
    const styles = read("src/styles/bot-mark.css");

    expect(landing).toMatch(/<BotMark[\s\S]*?size=\{30\}[\s\S]*?active/);
    expect(component).not.toMatch(/monogram|mark\.initial|showMicroMonogram/i);
    expect(generator).not.toMatch(/botMarkInitial|initial:\s*/i);
    expect(generator).toContain("BOT_MARK_GRADIENT_CAPACITY = 1_048_576");
    expect(styles).toContain("@keyframes wl-bot-mark-flow");
    expect(styles).toContain("@keyframes wl-bot-mark-sweep");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("makes starter cards role-specific without rendering retired Personal/Business category labels", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const product = read("src/lib/bot-product.ts");

    expect(landing).toContain("PICK THE WORK. PUT A BOT ON IT.");
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
    const indexCss = read("src/index.css");

    expect(mobile).toMatch(
      /\.landing-prestige__auth \.wl-access-panel__card\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/,
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
