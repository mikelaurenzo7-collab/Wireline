import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("WIRELINE public iPhone prestige contract", () => {
  it("makes Phone Bot the public wedge and keeps channel proof in CALL · EMAIL · TEXT order", () => {
    const product = read("src/lib/bot-product.ts");
    const landing = read("src/components/marketing/WireAgentLanding.tsx");

    expect(product).toContain('slogan: "WIRE YOUR PHONE BOT"');
    expect(product).toContain('supportingLine: "CALL · EMAIL · TEXT"');
    expect(product).toMatch(
      /key:\s*"voice"[\s\S]*?label:\s*"Call"[\s\S]*?key:\s*"email"[\s\S]*?label:\s*"Email"[\s\S]*?key:\s*"text"[\s\S]*?label:\s*"Text"/,
    );

    expect(landing).toMatch(
      /<h1[^>]*>[\s\S]*?<span>WIRE YOUR<\/span>[\s\S]*?<span>PHONE BOT<\/span>[\s\S]*?<\/h1>/,
    );
    expect(landing).toMatch(
      /landing-prestige__channels[\s\S]*?<span>CALL<\/span>[\s\S]*?<span>EMAIL<\/span>[\s\S]*?<span>TEXT<\/span>/,
    );
    expect(landing).not.toMatch(/ONE WORKSPACE|one workspace/i);
  });

  it("treats the homepage as a product entrance: desktop split, mobile auth only", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const css = read("src/styles/landing-prestige.css");

    expect(landing).toContain('<AuthAccessPanel embedded initialMode="signin" />');
    expect(landing).not.toContain("PrecisionPublicHeader");
    expect(css).toMatch(
      /\.landing-prestige__entrance\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/,
    );
    expect(css).toMatch(
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__hero,[\s\S]*?\.landing-prestige__desktop-only\s*\{[\s\S]*?display:\s*none/,
    );
    expect(css).toMatch(
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__auth\s*\{[\s\S]*?min-height:\s*100dvh/,
    );
  });

  it("uses the real shared auth implementation and removes audience classification from account entry", () => {
    const portal = read("src/components/AuthPortal.tsx");
    const access = read("src/components/auth/AuthAccessPanel.tsx");

    expect(portal).toContain("AuthAccessPanel");
    expect(access).toContain("/api/auth/signin");
    expect(access).toContain("/api/auth/signup");
    expect(access).toContain('id: "google"');
    expect(access).toContain('id: "microsoft"');
    expect(access).toContain('id: "yahoo"');
    expect(access).toContain('/api/auth/${provider}/url');
    expect(access).not.toContain("WorkspaceSelector");
    expect(access).not.toMatch(/>Personal<|>Business</);
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
    expect(indexCss.indexOf('public-mobile-refinement.css')).toBeLessThan(
      indexCss.indexOf('safe-area-ownership.css'),
    );
  });

  it("defaults first visits to the off-white Light appearance without weakening Dark", () => {
    const theme = read("src/contexts/ThemeContext.tsx");
    const index = read("index.html");
    const manifest = read("public/site.webmanifest");
    const light = read("src/styles/theme-light.css");

    expect(theme).toMatch(/if \(typeof window === "undefined"\) return "light"/);
    expect(theme).toMatch(/return "light";/);
    expect(index).toContain('name="color-scheme" content="light dark"');
    expect(index).toContain('name="theme-color" content="#F6F5FA"');
    expect(manifest).toContain('"theme_color": "#F6F5FA"');
    expect(manifest).toContain('"background_color": "#F6F5FA"');
    expect(light).toContain("--wireline-color-canvas-default: #f6f5fa");
    expect(theme).toContain('dark: "#0A0A0E"');
  });

  it("keeps one canonical WIRELINE design-system name", () => {
    const vision = read("src/lib/wireline-design-vision.ts");
    const surfaceContract = read("src/lib/surface-contract.ts");
    const designCss = read("src/styles/design-system.css");
    const identity = read("src/lib/bot-mark.ts");

    expect(vision).toContain('system: "WIRELINE Design System"');
    expect(surfaceContract).toContain('system: "WIRELINE Design System"');
    expect(designCss).toContain("WIRELINE Design System");
    expect(vision).not.toMatch(/system:\s*"WIRELINE (?:Letterpress|Obsidian|Aurora|Paper)"/);
    expect(surfaceContract).not.toMatch(/system:\s*"WIRELINE (?:Letterpress|Obsidian|Aurora|Paper)"/);
    expect(designCss).not.toMatch(/Letterpress design system|Obsidian canvas|Aurora palette|Paper appearance/i);
    expect(identity).not.toMatch(/\bobsidian\b/i);
  });
});
