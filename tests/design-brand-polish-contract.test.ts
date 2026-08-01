import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

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

  it("casts the public hero title in uppercase display while keeping copy and controls sentence case", () => {
    const hero = read("src/components/marketing/MarketingHero.tsx");
    const polish = read("src/styles/e2e-design-polish.css");
    // Case carries the hierarchy: the hero title is uppercased in CSS (the copy
    // string itself is untouched), while the description and buttons stay
    // sentence case.
    expect(polish).toContain("text-transform: uppercase");
    expect(polish).toContain("text-transform: none");
    // The Build -> Train -> Launch spine reads as an uppercase mono micro-label.
    expect(hero).toContain("uppercase tracking-[.1em]");
    // Relaxed measure on the hero remains.
    expect(hero).toContain("max-w-[19ch]");
    expect(hero).toContain("leading-[0.99]");
    expect(hero).toContain("font-[var(--wireline-font-family-body)]");
    expect(hero).toContain("sm:text-sm");
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
    expect(header).toContain("min-h-10 px-4 text-sm font-semibold");
    expect(header).not.toContain("font-semibold uppercase");
    expect(sticky).toContain('label = "Build your agent"');
    expect(sticky).toContain('secondaryLabel = "Hear it live"');
    expect(sticky).toContain("min-h-[48px]");
    expect(footer).toContain("min-h-10 items-center");
  });

  it("keeps status and CTA foregrounds on their accessible design tokens", () => {
    // Regression guard for three WCAG AA papercuts found in launch dogfooding.
    // These surfaces only render in prod (VAPI key set) or on authenticated
    // routes, so the axe CI gate never scans them — a source contract does.

    // 1. The flagship homepage "Start the live demo" primary CTA must use the
    //    theme-aware onAction foreground like every other primary button, not a
    //    hardcoded white that fails contrast on the violet action color in dark.
    const demo = read("src/components/marketing/BrowserCallWidget.tsx");
    expect(demo).toContain(
      "bg-[color:var(--wireline-color-action-primary-default)] text-[color:var(--wireline-color-text-onAction)]",
    );
    expect(demo).toContain(
      "hover:bg-[color:var(--wireline-color-action-primary-pressed)] hover:text-[color:var(--wireline-color-text-onAction)]",
    );
    expect(demo).not.toContain(
      "bg-[color:var(--wireline-color-action-primary-default)] text-white",
    );

    // 2. The billing "Voice minutes" meter must expose an accessible name so
    //    screen readers do not announce an unnamed progressbar.
    const usage = read("src/components/UsageMeter.tsx");
    expect(usage).toMatch(/<Progress[\s\S]*?aria-label=\{`Voice minutes:/);

    // 3. The success badge must use the green success status token (matching the
    //    warning/destructive/info variants), not the violet action-primary color
    //    which is both off-palette and below AA on the success surface.
    const badge = read("src/components/atoms/Badge.tsx");
    expect(badge).toContain(
      "bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-status-success)]",
    );
    expect(badge).not.toContain(
      "bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-action-primary-pressed)]",
    );
  });

  it("keeps the landing journey punchy and outcome led", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    expect(landing).toContain("One agent. Every channel.");
    expect(landing).toContain("Train once. Work across every channel.");
    expect(landing).toContain("From brief to live agent in four clear steps.");
    expect(landing).toContain("Put your first voice agent to work.");
    expect(landing).toContain("Build free. Hear it live before you pay. Cancel anytime.");
    expect(landing).not.toContain("—");
    expect(landing).not.toContain("·");
  });

  it("keeps the shell scroll-container rule from swallowing sr-only live regions", () => {
    // foundation.css turns the shell's direct child into the viewport scroll
    // container. The unlayered rule outranks the layered .sr-only utility, so
    // without the exclusion the route announcer (a direct shell child in
    // App.tsx) becomes a 1px-wide, 100dvh scrollable region with no keyboard
    // access — an axe-serious scrollable-region-focusable violation on every
    // authenticated route.
    const foundation = read("src/styles/foundation.css");
    expect(foundation).toContain(".wl-ui-caps > :not(.wl-workspace-shell, .sr-only) {");
    expect(foundation).not.toMatch(/\.wl-ui-caps\s*>\s*:not\(\.wl-workspace-shell\)\s*\{/);

    // The announcer stays a direct shell child; if it moves, re-audit the rule.
    const app = read("src/App.tsx");
    expect(app).toContain("<RouteChangeA11y />");
    const announcer = read("src/components/RouteChangeA11y.tsx");
    expect(announcer).toContain('className="sr-only"');
  });

  it("cases controls with the rest of the system, but never the customer's words", () => {
    const caps = read("src/styles/uppercase-system.css");

    // Buttons, tabs, menu items, badges, and header/footer navigation are part
    // of the cased system rather than an exception to it.
    expect(caps).toMatch(
      /\.studio-secondary-button,\s*nav a,\s*header a,\s*footer a\s*\)\s*\{[^}]*?text-transform: uppercase;/,
    );

    // Controls in this product are frequently composite rows, not bare labels:
    // a sidebar row is a link wrapping an agent name the customer chose. The
    // case system must never rewrite someone's own words, so `wl-preserve-case`
    // opts an element and its subtree out.
    expect(caps).toMatch(
      /\.wl-ui-caps \.wl-preserve-case,\s*\.wl-ui-caps \.wl-preserve-case \*\s*\{[^}]*?text-transform: none;/,
    );
    // Tolerant of formatting: prettier wraps this JSX onto three lines once the
    // class list grows, so an assertion that required `">{agent.name}` adjacent
    // passed locally and then failed in CI after the pre-commit format pass.
    expect(read("src/components/WorkspaceShell.tsx")).toMatch(
      /wl-preserve-case[^"]*"[^>]*>\s*\{agent\.name\}/,
    );

    // Caps need more air than lowercase; the tight display tracking would run
    // the letterforms together at control sizes.
    expect(caps).toMatch(/--wl-caps-control-tracking:\s*0\.0[3-9]\d*em/);
  });

  it("uppercases field captions without shouting the values beside them", () => {
    const caps = read("src/styles/uppercase-system.css");

    // Field captions and column headers join the label tier. `[^}]` keeps the
    // match inside this rule block: with `[\s\S]` the pattern ran past the
    // closing brace and was satisfied by the caption-span rule further down, so
    // deleting the declaration here left the test green.
    expect(caps).toMatch(
      /\.wl-ui-caps :is\(label, legend, th\) \{[^}]*?text-transform: uppercase;/,
    );

    // A label can also hold the control and a help line. `<input>` must reset or
    // the transform shouts whatever the user typed -- and `::placeholder`
    // inherits it, so an untouched placeholder would shout too.
    const reset = caps.match(
      /\.wl-ui-caps\s*\n?\s*:is\(label, legend\) :is\(([^)]*)\) \{[\s\S]*?text-transform: none;/,
    );
    expect(reset, "labels must reset their nested control and prose").toBeTruthy();
    for (const tag of ["input", "textarea", "select", "p", "span"]) {
      expect(reset?.[1]).toContain(tag);
    }

    // Where a caption needs its own styling it is the leading span, which the
    // blanket reset above would otherwise catch.
    expect(caps).toMatch(
      /:is\(label, legend\) > span:first-child:not\(:has\(input, textarea, select, button\)\)/,
    );
  });
});
