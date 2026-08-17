import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("authenticated responsive polish contract", () => {
  it("keeps the desktop workspace rail reachable on short viewports", () => {
    const css = read("src/styles/workspace-polish.css");

    expect(css).toContain('aside[aria-label="Workspace navigation"]');
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("overscroll-behavior-y: contain");
    expect(css).toContain("@media (min-width: 1024px) and (max-height: 760px)");
  });

  it("keeps the studio breadcrumb agent name on one readable line on phones", () => {
    // On mobile the "Voice Agent /" prefix + right-side controls starved the
    // agent name to ~8px, and a global heading rule (text-wrap: balance /
    // white-space: normal) overrode the truncate so it wrapped and clipped.
    const chrome = read("src/components/studio/StudioContextChrome.tsx");

    // The title must force single-line truncation (beating the global rule) and
    // be allowed to grow into the row.
    expect(chrome).toContain("min-w-0 flex-1 truncate !whitespace-nowrap");
    expect(chrome).toContain("sm:max-w-[18rem] sm:flex-none");
    // The breadcrumb group grows so the title has room to expand.
    expect(chrome).toContain('className="flex min-w-0 flex-1 items-center gap-2.5"');
    // The redundant kicker and separator stay for the no-agent state only, so
    // the selected agent name owns the row on every width.
    expect(chrome).toContain("{activeAgent ? null : (");
    expect(chrome).not.toContain('activeAgent ? "hidden sm:inline-flex" : "inline-flex"');
    expect(chrome).not.toContain('className="hidden text-muted-foreground/40 sm:inline"');
  });

  it("keeps workspace controls token-correct in both appearances", () => {
    const css = read("src/styles/workspace-polish.css");

    expect(css).toContain("var(--wireline-color-surface-default) 82%");
    expect(css).toContain("var(--wireline-color-canvas-default)");
    expect(css).not.toContain("black 20%");
  });

  it("stacks authenticated titles and actions through narrow tablet widths", () => {
    const frame = read("src/components/layout/WorkspacePageFrame.tsx");
    const inbox = read("src/pages/EmailPage.tsx");

    expect(frame).toContain("md:flex-row md:items-start md:justify-between");
    expect(frame).toContain("w-full [&>*]:w-full md:w-auto md:[&>*]:w-auto");
    expect(inbox).toMatch(/<WorkspacePageIntro\s+title="Inbox"/);
    expect(inbox).toContain("action={");
    expect(inbox).not.toContain("sm:flex-row sm:items-end sm:justify-between");
  });

  it("gives framed settings rows full-width actions on the smallest phones", () => {
    const css = read("src/styles/workspace-polish.css");

    expect(css).toContain("@media (max-width: 479px)");
    expect(css).toContain(".wl-data-row--framed .wl-data-row__trailing");
    expect(css).toContain("padding-inline-start: 2.75rem");
  });

  it("reserves enough desktop width for the compliance action rail", () => {
    const compliance = read("src/components/ComplianceCenter.tsx");
    const dnc = read("src/components/DncManager.tsx");

    expect(compliance).toContain("minmax(448px,.9fr)");
    expect(compliance).not.toContain("minmax(320px,.9fr)");
    expect(dnc).toContain("grid shrink-0 grid-cols-2 gap-2");
    expect(dnc).not.toContain("sm:grid-cols-4");
  });

  it("gives the Wireline number its own line on phones", () => {
    const panel = read("src/components/PhoneSetupPanel.tsx");

    // The card is 210px of content at 360px. With the status chip beside it the
    // number heading got 113px and broke across three lines at 28px — and that
    // hit real numbers, not just the placeholder: "(312) 555-0142" needs 117px.
    // Stacking under `sm` gives the heading the full 208px.
    expect(panel).toContain(
      "flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
    );
    expect(panel).not.toContain('<div className="flex items-start justify-between gap-4">');
  });

  it("keeps compact metric tiles from clipping their own icon", () => {
    const css = read("src/styles/letterpress-polish.css");
    const overview = read("src/pages/OverviewPage.tsx");

    // Two tiles side by side leave ~113px of content on a 360px phone and the
    // longest label word needs ~106px alone, so the in-flow icon pushed the row
    // past the tile's overflow:hidden and got sliced (6px at 360px, 26px at
    // 320px). The icon is aria-hidden ornament, so it goes where it cannot fit.
    expect(overview).toContain("wl-metric-tile__icon");
    expect(css).toMatch(
      /@media \(max-width: 26rem\)[\s\S]{0,160}\.wl-metric-tile__icon\s*\{[\s\S]{0,40}display: none/,
    );

    // Word breaking is deliberately confined to the very bottom of the range.
    // Applying it at 360px regressed the three-up Knowledge tiles, where a whole
    // "KNOWLEDGE" running 7px under the edge beats a broken "KNOWLED / GE".
    expect(css).toMatch(/@media \(max-width: 22rem\)[\s\S]{0,200}overflow-wrap: anywhere/);
    // The label may be given `overflow-wrap` in exactly one place. A second,
    // unscoped copy would silently re-apply breaking at every width, which is
    // the regression this scoping exists to prevent.
    const labelWrapRules = css.match(
      /\.wl-metric-tile--compact \.wl-metric-tile__label \{[^}]*overflow-wrap/g,
    );
    expect(labelWrapRules).toHaveLength(1);
  });

  it("scrolls the selected workspace tab into view on narrow viewports", () => {
    const strip = read("src/components/layout/WorkspaceTabStrip.tsx");

    // The strip is a horizontal scroller that starts at scrollLeft 0. Landing
    // directly on a late route (/settings/compliance on a 360px phone) left the
    // selected tab ~460px outside a 298px viewport, so nothing on screen named
    // the page — the settings pages deliberately hide their own heading and
    // rely on the selected tab as the visible label.
    expect(strip).toContain("nav.querySelector<HTMLElement>('[data-active=\"true\"]')");
    expect(strip).toContain("nav.scrollWidth <= nav.clientWidth");
    expect(strip).toContain("ref={navRef}");
    // Only this element's horizontal offset may move; scrollIntoView would drag
    // the page's vertical position too.
    expect(strip).toMatch(/nav\.scrollLeft [-+]=/);
    expect(strip).not.toContain("scrollIntoView");
  });

  it("wraps toolbar actions instead of crushing the stat beside them", () => {
    const toolbar = read("src/components/layout/ClientToolbar.tsx");

    // The actions block never shrinks. With `flex-1` the stat's flex-basis is 0,
    // so the row never counts as overflowing and the stat silently absorbs the
    // entire squeeze — in the 448px compliance column above that crushed a 74px
    // label into a 58px slot and wrapped it mid-phrase, while the same toolbar
    // was fine at 768px and 1024px. Sizing the slot from its content instead
    // lets the line genuinely overflow so the actions wrap to their own row.
    expect(toolbar).toContain("flex-wrap");
    expect(toolbar).toContain('<div className="min-w-0 flex-auto">{left}</div>');
    expect(toolbar).not.toContain('<div className="min-w-0 flex-1">{left}</div>');
    // min-w-0 has to stay, or a genuinely long label blows the row out instead.
    expect(toolbar).toContain("min-w-0");
    // Wrapped actions keep their right alignment; justify-between alone would
    // left-align them once they are the only item on their line.
    expect(toolbar).toContain("md:ml-auto");
  });

  it("keeps every settings destination on one stable content rail", () => {
    const account = read("src/pages/SettingsPage.tsx");
    const team = read("src/pages/TeamSettings.tsx");

    expect(account).toContain('<WorkspacePageFrame mode="standard">');
    expect(team).toContain('<WorkspacePageFrame mode="standard">');
  });

  it("shows an actionable carrier state instead of a false empty inventory", () => {
    const picker = read("src/components/PhoneNumberPicker.tsx");
    const admin = read("src/components/AdminSettings.tsx");
    const viewport = read("src/components/layout/ClientRouteViewport.tsx");

    expect(picker).toContain("readApiJson");
    expect(picker).toContain("availableResult.status === 503");
    expect(picker).toContain("Number inventory unavailable");
    expect(picker).toContain("inventoryUnavailable");
    expect(admin).toContain("<AdminHubViewport scroll>");
    expect(viewport).toContain("overflow-y-auto overscroll-contain");
  });

  it("gives every previously headingless workspace a clear page heading", () => {
    const studio = read("src/components/studio/StudioContextChrome.tsx");
    const team = read("src/pages/TeamSettings.tsx");
    const admin = read("src/components/AdminSettings.tsx");

    expect(studio).toContain('<h1 className="sr-only">{language.plural}</h1>');
    expect(studio).toContain("{activeAgent.name}");
    // Team renders the Settings tab strip, so its tab is already the on-screen
    // page label — the heading is kept for the outline the way Studio and Admin
    // above keep theirs, rather than printing "Team" twice.
    expect(team).toContain('<WorkspacePageIntro title="Team" titleHidden />');
    expect(admin).toContain('<h1 className="sr-only">Admin workspace</h1>');
  });
});
