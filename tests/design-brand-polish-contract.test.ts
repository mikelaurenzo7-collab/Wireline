import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
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

  it("casts public headings in the uppercase title tier and keeps supporting copy in sentence case", () => {
    const hero = read("src/components/marketing/MarketingHero.tsx");
    const polish = read("src/styles/e2e-design-polish.css");
    // Case is the ranking system: titles shout, supporting copy stays quieter.
    // Uppercasing every marketing p/li collapsed Trust, Features, Compare,
    // Status, and Developers into one stacked-subtitle shout.
    expect(polish).toContain(".marketing-surface :is(h1, h2, h3, h4, h5, h6) {");
    const bodyRule =
      polish
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .match(
          /\.marketing-surface :is\(p, li, \.wl-public-copy, \.wl-route-copy, \.wl-page-copy\)\s*\{[^}]*\}/,
        )?.[0] ?? "";
    expect(bodyRule, "marketing supporting copy needs a sentence-case body rule").not.toBe("");
    expect(bodyRule).toContain("text-transform: none");
    expect(bodyRule).toContain("letter-spacing: normal");
    expect(bodyRule).not.toContain("text-transform: uppercase");
    // The hero-subhead node is gone from the DOM, so it must not survive in the
    // stylesheets either. Six rules across three files still styled it, and
    // pinning one of those selector strings here had made the dead rule
    // contractually required to stay. Comments are stripped first so the note
    // explaining the absence does not read as the presence.
    const dressers = globSync("src/styles/**/*.css", { cwd: root })
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) =>
        source(file)
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .includes("marketing-hero__description"),
      )
      .sort();
    expect(
      dressers,
      `stylesheets still dressing the removed hero subhead:\n${dressers.join("\n")}`,
    ).toEqual([]);
    expect(polish).toContain("text-transform: uppercase");
    // Call-stage labels are `p`/`li` nodes, so the body rule would sentence-case
    // them unless the terminal layer names them as labels.
    expect(polish).toContain(".landing-stage__channel");
    expect(polish).toContain(".landing-phone__cta");
    expect(polish).toContain(".landing-stage__plans");
    expect(polish).toContain(".landing-os__label");
    expect(polish).toContain(".wl-channel-chip");
    // Read-as-written exceptions: long-form legal prose and customer-authored
    // words are never rewritten by the case system.
    expect(polish).toContain(".marketing-surface .prose");
    expect(polish).toContain(".wl-preserve-case");
    expect(polish).toContain("text-transform: none");
    // The hero no longer repeats the operating loop as a micro-label spine.
    expect(hero).not.toContain("uppercase tracking-[.1em]");
    // Relaxed measure on the hero remains.
    expect(hero).toContain("max-w-[19ch]");
    expect(hero).toContain("leading-[1]");
    // The body-font assertion here pinned the hero subhead's styling. Heroes no
    // longer render a subhead at all — the headline, actions, and proof carry
    // the pitch — so the shape itself is pinned by
    // `marketing-hero-no-subhead-contract` instead of a class on a removed node.
    expect(hero, "the hero must not regrow a subhead").not.toContain("marketing-hero__description");
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
    // 44px, not 40px: docs/ACCESSIBILITY.md promises the comfortable floor and
    // this is the primary public conversion target.
    expect(header).toContain("min-h-11 px-4 text-sm font-semibold");
    expect(header).not.toContain("font-semibold uppercase");
    expect(sticky).toContain('label = "Build Your Agent"');
    expect(sticky).toContain('secondaryLabel = "Hear It Live"');
    expect(sticky).toContain("min-h-[48px]");
    expect(footer).toContain("min-h-11 items-center");
  });

  it("keeps status and CTA foregrounds on their accessible design tokens", () => {
    // Regression guard for three WCAG AA papercuts found in launch dogfooding.
    // These surfaces only render in prod (VAPI key set) or on authenticated
    // routes, so the axe CI gate never scans them — a source contract does.

    // 1. The flagship homepage voice demo must show agent identity rather than
    //    repeat the Wireline logo, while keeping its primary CTA on the shared
    //    accessible action tokens.
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
    // Cased titles carry no terminal punctuation.
    // The outcome picker lost its headline, not its function: one screen
    // carries one headline, and the segmented control sits with the CTA whose
    // wedge it retargets rather than under a display line of its own.
    expect(landing).toContain('aria-label="Agent work lane"');
    expect(landing).not.toContain("Choose the outcome");
    // Same for the plans block: the cards state the prices, and a heading above
    // them repeating "start free" duplicated the first card's own button.
    expect(landing).toContain("landing-phone");
    expect(landing).toContain("landing-stage__dock");
    expect(landing).toContain("landing-stage__device");
    expect(landing).toContain('chrome="hidden"');
    expect(landing).toContain("landing-os__tray");
    const stage = read("src/styles/landing-call-stage.css");
    const header = read("src/components/marketing/PrecisionPublicHeader.tsx");
    expect(stage).toContain("aspect-ratio: auto");
    expect(stage).toContain("landing-os__tray");
    expect(stage).toContain("#wireline-mobile-navigation.landing-os-nav");
    expect(stage).toContain("grid-template-areas");
    expect(stage).not.toContain("max-width: min(21.25rem, 72vw)");
    expect(stage).not.toContain("#4ade80");
    expect(stage).not.toContain("#fbbf24");
    expect(stage).not.toContain("#7dd3fc");
    expect(stage).not.toContain("#2563eb");
    expect(stage).toContain("--wireline-color-action-primary-default");
    expect(stage).toContain("--wireline-color-action-secondary-default");
    expect(header).toContain("landing-os-nav");
    expect(header).not.toContain("92dvh");
    expect(landing).toContain("See Plans");
    expect(landing).toContain("Start free.");
    expect(landing).toContain("MARKETING_VOICE.spine");
    expect(landing).not.toContain("MarketingChromeBar");
    // The closing band that repeated the hero's headline and both of its
    // buttons verbatim is gone: the plan cards are the close.
    expect(landing).not.toContain("Put your first voice agent to work");
    // Home shows Build / Train / Launch. Improve stays on Features and in
    // BRAND_SYSTEM.proofLoop; shouting it on the opening call implied the
    // product starts broken.
    expect(landing).not.toContain('wl-display-2">Build. Train. Launch. Improve.');
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
    //
    // Weighted to win outright rather than to hold a specificity lead. At 0,2,0
    // the opt-out was overtaken by the workspace heading rule, so a heading that
    // merely *contained* a preserve-case wrapper still shouted — and every new
    // selector added above would have restarted the same race.
    expect(caps).toMatch(
      /:is\(\.wl-ui-caps, \.wl-cased\) \.wl-preserve-case,\s*:is\(\.wl-ui-caps, \.wl-cased\) \.wl-preserve-case \*\s*\{[^}]*?text-transform: none !important;/,
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

  it("marks every hand-rolled dialog title so the case system reaches it", () => {
    // The case system finds modal headings through `data-slot="dialog-title"`,
    // which the Dialog primitive sets for you. Eleven surfaces in this product
    // hand-roll their overlay instead -- Fast Start, the deploy and trial-gate
    // modals, the post-create wizard -- and every one of those titles sat in
    // sentence case above cased labels and cased buttons. Case is doing the
    // ranking in this design; a title that opts out of it reads as body copy.
    const files = globSync("src/**/*.tsx", { cwd: root })
      .filter((file) => source(file).includes('role="dialog"'))
      .sort();
    expect(files.length, "no dialogs found -- the glob or attribute changed").toBeGreaterThan(5);

    const unmarked: string[] = [];
    for (const file of files) {
      const text = source(file);
      for (const [, titleId] of text.matchAll(/aria-labelledby="([^"{}]+)"/g)) {
        const at = text.indexOf(`id="${titleId}"`);
        if (at === -1) continue; // Labelled by an element the primitive owns.
        // Walk out to the opening tag that carries the id.
        const tag = text.slice(text.lastIndexOf("<", at), text.indexOf(">", at) + 1);
        // An sr-only label has no case to get wrong.
        if (tag.includes("sr-only") || tag.includes('data-slot="dialog-title"')) continue;
        unmarked.push(`${file} (#${titleId})`);
      }
    }
    expect(unmarked, `dialog titles outside the case system:\n${unmarked.join("\n")}`).toEqual([]);
  });

  it("uppercases field captions without shouting the values beside them", () => {
    const caps = read("src/styles/uppercase-system.css");

    // Field captions and column headers join the label tier. `[^}]` keeps the
    // match inside this rule block: with `[\s\S]` the pattern ran past the
    // closing brace and was satisfied by the caption-span rule further down, so
    // deleting the declaration here left the test green. The rule honors the
    // system-wide `.wl-preserve-case` opt-out — a label that opens a running
    // sentence (the signup consent line) is prose, not a caption.
    expect(caps).toMatch(
      /:is\(\.wl-ui-caps, \.wl-cased\) :is\(label, legend, th\):not\(\.wl-preserve-case\) \{[^}]*?text-transform: uppercase;/,
    );

    // A label can also hold the control and a help line. `<input>` must reset or
    // the transform shouts whatever the user typed -- and `::placeholder`
    // inherits it, so an untouched placeholder would shout too.
    // Whitespace-tolerant: prettier rewraps this selector onto three lines once
    // the marker list grows, and a regex that pins the line shape fails on a
    // formatting pass rather than on a real change.
    const reset = caps.match(
      /:is\(\.wl-ui-caps, \.wl-cased\)\s+:is\(label, legend\)\s+:is\(([^)]*)\)\s*\{[\s\S]*?text-transform: none;/,
    );
    expect(reset, "labels must reset their nested control and prose").toBeTruthy();
    for (const tag of ["input", "textarea", "select", "p", "span"]) {
      expect(reset?.[1]).toContain(tag);
    }

    // Where a caption needs its own styling it is the leading span, which the
    // blanket reset above would otherwise catch.
    expect(caps).toMatch(
      /:is\(label, legend\)\s*>\s*span:first-child:not\(:has\(input, textarea, select, button\)\)/,
    );
  });
});
