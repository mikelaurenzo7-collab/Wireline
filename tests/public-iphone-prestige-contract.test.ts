import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Source guards for public/mobile brand, signup intent, and access boundaries.
// Responsive heading geometry is verified by the public viewport E2E checks.
const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("BotBound public iPhone prestige contract", () => {
  it("keeps a short uppercase hero and the complete product family together", () => {
    const product = read("src/lib/bot-product.ts");
    const landing = read("src/components/marketing/WireAgentLanding.tsx");

    expect(product).toContain('name: "BotBound"');
    expect(product).toContain('slogan: "Your next hire is a bot."');
    expect(product).toContain('supportingLine: "CALL · TEXT · EMAIL · COMPUTER"');
    expect(product).toMatch(
      /key:\s*"voice"[\s\S]*?label:\s*"Call"[\s\S]*?key:\s*"text"[\s\S]*?label:\s*"Text"[\s\S]*?key:\s*"email"[\s\S]*?label:\s*"Email"/,
    );

    expect(landing).toMatch(
      /<h1[^>]*>[\s\S]*?>\s*Your next hire\s*<\/span>[\s\S]*?>\s*is a bot\.\s*<\/span>[\s\S]*?<\/h1>/,
    );
    expect(landing).toContain("The Bot Gets:");
    expect(landing).toContain('label: "Phone Number"');
    expect(landing).toContain('label: "Email Address"');
    expect(landing).toContain('label: "A Computer"');
    expect(landing).not.toContain("landing-prestige__promise");
    expect(landing).not.toContain("HERO_CHANNEL_ORDER");
    expect(landing).not.toContain("HERO_CHANNELS.map");
    expect(landing).not.toContain('aria-label="BotBound channels"');
  });

  it("treats the homepage as a product entrance on desktop and mobile", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const css = read("src/styles/landing-prestige.css");

    expect(landing).not.toContain("<AuthAccessPanel");
    expect(landing).toContain('signedIn ? "/studio" : "/signup"');
    expect(landing).not.toContain("to={signupHrefForPlan(id)}");
    expect(read("src/components/marketing/PrecisionPublicHeader.tsx")).toContain('to="/signin"');
    expect(landing).toContain("<PrecisionPublicHeader />");
    expect(css).toMatch(
      /\.landing-prestige__hero\s*\{[^}]*place-items:\s*center;[^}]*text-align:\s*center;/,
    );
    expect(read("src/styles/landing-prestige.css")).toContain("flex-wrap: wrap;");
    expect(landing).not.toContain("landing-prestige__directions");
    expect(read("src/styles/landing-prestige.css")).toContain("flex-wrap: wrap;");
    expect(read("src/styles/landing-prestige.css")).toContain("flex-wrap: wrap;");
    expect(css).not.toMatch(/\.landing-prestige__(?:auth|entrance|desktop-only)\b/);
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
    // The home page no longer embeds account access; its old mobile overrides must not linger.
    expect(mobileStyles).not.toContain(".landing-prestige__auth");
    expect(accessStyles).not.toContain(
      ".wl-access-panel__heading:has(+ .wl-access-panel__tabs) h1",
    );
  });

  it("keeps the desktop privacy choice clear of launch conversion controls", () => {
    const consent = read("src/components/CookieConsent.tsx");

    expect(consent).toContain("sm:w-[720px] sm:max-w-[calc(100vw-2rem)]");
    expect(consent).not.toContain("lg:left-8 lg:right-8 lg:max-w-none");
    expect(consent).toContain("const inlineOnPhone = narrowViewport && !explicitlyOpened;");
    expect(consent).toContain("const portalTarget = inlineOnPhone ? mobileInlineHost : document.body;");
    expect(consent).toContain("setMobileInlineHost(host)");
    expect(consent).toContain("--wl-mobile-privacy-header-clearance");
    expect(consent).toContain("new ResizeObserver(syncHeaderClearance)");
    expect(consent).toContain("observer?.disconnect()");
    expect(consent).toContain('aria-expanded="true"');
    const privacyStyles = read("src/styles/letterpress-polish.css");
    expect(privacyStyles).toContain(".wl-mobile-privacy-host:not(:empty)");
    expect(privacyStyles).toContain("padding-top: var(");
    expect(privacyStyles).toContain("visibility: hidden;");
    expect(privacyStyles).toContain("pointer-events: none;");
    expect(read("src/styles/letterpress-polish.css")).toContain(
      ".wl-mobile-privacy-host .wl-privacy-choices",
    );
    expect(consent).toContain("sm:items-center");
  });

  it("keeps public entry on the master brand and reserves Bot marks for customers", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const component = read("src/components/BotMark.tsx");
    const generator = read("src/lib/bot-mark.ts");

    expect(landing).toContain("<BotBoundMark");
    expect(landing).not.toContain("markKey");
    expect(landing).not.toMatch(/BrowserCallWidget|useProtectedPublicDemo/);
    expect(component).not.toMatch(/monogram|mark\.initial|showMicroMonogram/i);
    expect(generator).not.toMatch(/botMarkInitial|initial:\s*/i);
    expect(generator).toContain("BOT_MARK_SIGNATURE_CAPACITY = 1_048_576");
    expect(generator).toContain("BOT_MARK_CHOICES");
  });

  it("keeps starter cards specific to personal and inbound business jobs", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const product = read("src/lib/bot-product.ts");

    expect(landing).not.toContain("<h2>One Bot. Any role.</h2>");
    expect(landing).not.toContain("template.summary");
    expect(landing).not.toContain("/signup?template=${encodeURIComponent(template.key)}");
    expect(landing).not.toContain('"For You"');
    expect(landing).not.toContain('"For Your Business"');
    expect(landing).not.toContain('"Your Choice"');
    expect(landing).not.toContain("DIRECTION_LABELS");
    expect(landing).not.toContain("template.category");

    for (const specificMove of [
      "Intent + urgency + routing",
      "Owner handoff + next steps",
      "Answers from your knowledge",
      "Booking requests + owner review",
      "Channels + actions + connected tools",
    ]) {
      expect(product).toContain(specificMove);
    }
  });

  it("flattens mobile public reading surfaces instead of stacking decorative cards", () => {
    const mobile = read("src/styles/public-mobile-refinement.css");
    const indexCss = read("src/index.css");

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
