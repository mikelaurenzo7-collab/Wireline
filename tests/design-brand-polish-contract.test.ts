import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const withoutComments = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, "");

describe("E2E design and brand polish", () => {
  it("keeps every mobile agent tab visible and readable", () => {
    const compactTabs = read("src/styles/agent-tabs-compact.css");
    expect(compactTabs).not.toMatch(/button:nth-child\(4\)\s*\{[^}]*display:\s*none/);
    expect(compactTabs).toContain("overflow-x: auto");
    expect(compactTabs).toContain("min-height: 2.75rem");
    expect(compactTabs).toContain("font-size: 0.75rem");
    expect(compactTabs).toContain("button:nth-child(4)");
    expect(compactTabs).toMatch(/button:nth-child\(4\)\s*\{[^}]*display:\s*inline-flex/);
  });

  it("keeps shared workspace tabs comfortable at compact density", () => {
    const tabs = read("src/components/layout/WorkspaceTabStrip.tsx");
    expect(tabs).toContain('"min-h-10 px-3 text-[13px] sm:px-3.5"');
    expect(tabs).toContain("overflow-x-auto overscroll-x-contain");
    expect(tabs).toContain("focus-visible:outline-offset-2");
  });

  it("keeps modal titles contained and body copy readable", () => {
    const dialog = read("src/components/atoms/Dialog.tsx");
    expect(dialog).toContain("text-xl font-semibold leading-[1.15]");
    expect(dialog).toContain("text-[15px] leading-6");
    expect(dialog).toContain("size-11");
    expect(dialog).toContain("max-h-[calc(100dvh-2rem)]");
    expect(dialog).toContain("overflow-y-auto overscroll-contain");
  });

  it("casts public headings in the uppercase title tier and keeps supporting copy in sentence case", () => {
    const hero = read("src/components/marketing/MarketingHero.tsx");
    const polish = read("src/styles/e2e-design-polish.css");
    const executablePolish = withoutComments(polish);

    expect(polish).toContain(".marketing-surface :is(h1, h2, h3, h4, h5, h6) {");
    const bodyRule =
      executablePolish.match(
        /\.marketing-surface :is\(p, li, \.wl-public-copy, \.wl-route-copy, \.wl-page-copy\)\s*\{[^}]*\}/,
      )?.[0] ?? "";
    expect(bodyRule, "marketing supporting copy needs a sentence-case body rule").not.toBe("");
    expect(bodyRule).toContain("text-transform: none");
    expect(bodyRule).toContain("letter-spacing: normal");
    expect(bodyRule).not.toContain("text-transform: uppercase");

    const dressers = globSync("src/styles/**/*.css", { cwd: root })
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => withoutComments(source(file)).includes("marketing-hero__description"))
      .sort();
    expect(
      dressers,
      `stylesheets still dressing the removed hero subhead:\n${dressers.join("\n")}`,
    ).toEqual([]);

    for (const selector of [
      ".landing-stage__eyebrow",
      ".landing-stage__spine li",
      ".landing-stage__lanes-label",
      ".landing-console__status",
      ".landing-console__channels li",
      ".landing-demo__presence",
      ".landing-demo__role",
      ".landing-console__activity-kicker",
      ".wl-channel-chip",
    ]) {
      expect(executablePolish).toContain(selector);
    }
    expect(executablePolish).not.toContain(".landing-phone");
    expect(executablePolish).not.toContain(".landing-os");

    expect(polish).toContain(".marketing-surface .prose");
    expect(polish).toContain(".wl-preserve-case");
    expect(polish).toContain("text-transform: none");
    expect(hero).not.toContain("uppercase tracking-[.1em]");
    expect(hero).toContain("max-w-[19ch]");
    expect(hero).toContain("leading-[1]");
    expect(hero, "the shared hero must not regrow a generic subhead").not.toContain(
      "marketing-hero__description",
    );
    expect(polish).toContain("white-space: normal");
    expect(polish).toContain("line-height: 1");
  });

  it("loads the terminal design contract after responsive and modal overrides", () => {
    const index = read("src/index.css");
    const modalAt = index.indexOf('@import "./styles/modal-hierarchy.css";');
    const polishAt = index.indexOf('@import "./styles/e2e-design-polish.css";');
    expect(modalAt).toBeGreaterThan(-1);
    expect(polishAt).toBeGreaterThan(modalAt);
  });

  it("keeps public navigation and mobile conversion targets clear", () => {
    const header = read("src/components/marketing/PrecisionPublicHeader.tsx");
    const sticky = read("src/components/marketing/MarketingStickyCta.tsx");
    const footer = read("src/components/marketing/MarketingFooter.tsx");
    expect(header).toContain("text-sm font-medium");
    expect(header).toContain("min-h-11 px-4 text-sm font-semibold");
    expect(header).not.toContain("font-semibold uppercase");
    expect(sticky).toContain("MARKETING_VOICE.primaryCta");
    expect(sticky).toContain('secondaryLabel = "Hear It Live"');
    expect(sticky).toContain("min-h-[48px]");
    expect(footer).toContain("min-h-11 items-center");
  });

  it("keeps status and CTA foregrounds on their accessible design tokens", () => {
    const demo = read("src/components/marketing/BrowserCallWidget.tsx");
    expect(demo).toContain('import AgentFace from "../AgentFace"');
    expect(demo).toContain("<SignalOrbFrame");
    expect(demo).toContain("<AgentFace");
    expect(demo).toContain("seed={`public-demo:${agentName}`}");
    expect(demo).not.toContain("WirelineMark");
    expect(demo).not.toContain("<Medallion");
    expect(demo).toContain(
      "bg-[color:var(--wireline-color-action-primary-default)] text-[color:var(--wireline-color-text-onAction)]",
    );
    expect(demo).toContain(
      "hover:bg-[color:var(--wireline-color-action-primary-pressed)] hover:text-[color:var(--wireline-color-text-onAction)]",
    );
    expect(demo).not.toContain(
      "bg-[color:var(--wireline-color-action-primary-default)] text-white",
    );

    const stageCss = read("src/styles/landing-live-console.css");
    expect(stageCss).toContain("background: var(--wireline-color-action-primary-default)");
    expect(stageCss).toContain("color: var(--wireline-color-text-onAction)");
    expect(stageCss).toContain("background: var(--wireline-color-action-primary-pressed)");

    const usage = read("src/components/UsageMeter.tsx");
    expect(usage).toMatch(/<Progress[\s\S]*?aria-label=\{`Voice minutes:/);

    const badge = read("src/components/atoms/Badge.tsx");
    expect(badge).toContain(
      "bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-status-success)]",
    );
    expect(badge).not.toContain(
      "bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-action-primary-pressed)]",
    );
  });

  it("keeps the landing journey professional, concise, and outcome led", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const executableLanding = withoutComments(landing);
    const stage = read("src/styles/landing-call-stage.css");
    const layout = read("src/styles/landing-stage-layout.css");
    const consoleCss = read("src/styles/landing-live-console.css");
    const executableStage = withoutComments(`${stage}\n${layout}\n${consoleCss}`);
    const header = read("src/components/marketing/PrecisionPublicHeader.tsx");

    expect(executableLanding).toContain('aria-label="Agent work lane"');
    expect(executableLanding).toContain("<PrecisionPublicHeader />");
    expect(executableLanding).toContain('variant="stage"');
    expect(executableLanding).toContain("landing-stage__rail");
    expect(executableLanding).toContain("landing-stage__copy");
    expect(executableLanding).toContain("landing-stage__lane-group");
    expect(executableLanding).toContain("landing-console");
    expect(executableLanding).toContain("landing-console__activity");
    expect(executableLanding).toContain("Illustrative Workflow");
    expect(executableLanding).toContain("From first answer to confirmed next step.");
    expect(executableLanding).toContain("Booked and logged");
    expect(executableLanding).toContain("MARKETING_VOICE.subline");
    expect(executableLanding).toContain("MARKETING_VOICE.spine");
    expect(executableLanding).toContain("View Pricing");
    expect(executableLanding).toContain("Build free");
    expect(executableLanding).toContain("rules, approvals, spend, and handoffs");
    expect(executableLanding).not.toContain("00:42");
    expect(executableLanding).not.toContain("landing-console__duration");
    expect(executableLanding).not.toContain("Live Video");
    expect(executableLanding).not.toContain("Choose the outcome");
    expect(executableLanding).not.toContain("landing-phone");
    expect(executableLanding).not.toContain("landing-os__tray");
    expect(executableLanding).not.toContain('chrome="hidden"');
    expect(executableLanding).not.toContain("MarketingChromeBar");

    expect(stage).toContain('@import "./landing-stage-layout.css";');
    expect(stage).toContain('@import "./landing-live-console.css";');
    expect(executableStage).toContain("--wireline-color-action-primary-default");
    expect(executableStage).toContain("--wireline-color-action-secondary-default");
    expect(executableStage).not.toContain("#4ade80");
    expect(executableStage).not.toContain("#fbbf24");
    expect(executableStage).not.toContain("#7dd3fc");
    expect(executableStage).not.toContain("#2563eb");
    expect(consoleCss).toContain("font-size: 0.71rem");
    expect(consoleCss).not.toContain("0 2.4rem 6rem");
    expect(header).not.toContain("landing-os-nav");
    expect(header).not.toContain('chrome?: "bar" | "hidden"');

    expect(executableLanding).not.toContain("Put your first voice agent to work");
    expect(executableLanding).not.toContain('wl-display-2">Build. Train. Launch. Improve.');
    expect(executableLanding).not.toContain("—");
    expect(executableLanding).not.toContain("·");
  });

  it("keeps the shell scroll-container rule from swallowing sr-only live regions", () => {
    const foundation = read("src/styles/foundation.css");
    expect(foundation).toContain(".wl-ui-caps > :not(.wl-workspace-shell, .sr-only) {");
    expect(foundation).not.toMatch(/\.wl-ui-caps\s*>\s*:not\(\.wl-workspace-shell\)\s*\{/);

    const app = read("src/App.tsx");
    expect(app).toContain("<RouteChangeA11y />");
    const announcer = read("src/components/RouteChangeA11y.tsx");
    expect(announcer).toContain('className="sr-only"');
  });

  it("cases controls with the rest of the system, but never the customer's words", () => {
    const caps = read("src/styles/uppercase-system.css");

    expect(caps).toMatch(
      /\.studio-secondary-button,\s*nav a,\s*header a,\s*footer a\s*\)\s*\{[^}]*?text-transform: uppercase;/,
    );

    expect(caps).toMatch(
      /:is\(\.wl-ui-caps, \.wl-cased\) \.wl-preserve-case,\s*:is\(\.wl-ui-caps, \.wl-cased\) \.wl-preserve-case \*\s*\{[^}]*?text-transform: none !important;/,
    );
    expect(read("src/components/WorkspaceShell.tsx")).toMatch(
      /wl-preserve-case[^"]*"[^>]*>\s*\{agent\.name\}/,
    );

    expect(caps).toMatch(/--wl-caps-control-tracking:\s*0\.0[3-9]\d*em/);
  });

  it("marks every hand-rolled dialog title so the case system reaches it", () => {
    const files = globSync("src/**/*.tsx", { cwd: root })
      .filter((file) => source(file).includes('role="dialog"'))
      .sort();
    expect(files.length, "no dialogs found -- the glob or attribute changed").toBeGreaterThan(5);

    const unmarked: string[] = [];
    for (const file of files) {
      const text = source(file);
      for (const [, titleId] of text.matchAll(/aria-labelledby="([^"{}]+)"/g)) {
        const at = text.indexOf(`id="${titleId}"`);
        if (at === -1) continue;
        const tag = text.slice(text.lastIndexOf("<", at), text.indexOf(">", at) + 1);
        if (tag.includes("sr-only") || tag.includes('data-slot="dialog-title"')) continue;
        unmarked.push(`${file} (#${titleId})`);
      }
    }
    expect(unmarked, `dialog titles outside the case system:\n${unmarked.join("\n")}`).toEqual([]);
  });

  it("uppercases field captions without shouting the values beside them", () => {
    const caps = read("src/styles/uppercase-system.css");

    expect(caps).toMatch(
      /:is\(\.wl-ui-caps, \.wl-cased\) :is\(label, legend, th\):not\(\.wl-preserve-case\) \{[^}]*?text-transform: uppercase;/,
    );

    const reset = caps.match(
      /:is\(\.wl-ui-caps, \.wl-cased\)\s+:is\(label, legend\)\s+:is\(([^)]*)\)\s*\{[\s\S]*?text-transform: none;/,
    );
    expect(reset, "labels must reset their nested control and prose").toBeTruthy();
    for (const tag of ["input", "textarea", "select", "p", "span"]) {
      expect(reset?.[1]).toContain(tag);
    }

    expect(caps).toMatch(
      /:is\(label, legend\)\s*>\s*span:first-child:not\(:has\(input, textarea, select, button\)\)/,
    );
  });
});
