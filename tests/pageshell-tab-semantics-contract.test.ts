import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Final review contract for the shared route-shell behavior changed in today's design passes.
const source = readFileSync("src/components/PageShell.tsx", "utf8").replace(/\r\n/g, "\n");

describe("PageShell tab semantics and keyboard contract", () => {
  it("scopes tab, panel, dialog, and motion identifiers to each shell instance", () => {
    expect(source).toContain("const shellId = useId()");
    expect(source).toContain('const actionsDialogId = `${shellId}-page-actions`');
    expect(source).toContain('const actionsTitleId = `${shellId}-page-actions-title`');
    expect(source).toContain('`${shellId}-tab-${viewport}-${index}`');
    expect(source).toContain('`${shellId}-panel-${index}`');
    expect(source).toContain('id={tabDomId("desktop", i)}');
    expect(source).toContain('id={tabDomId("mobile", i)}');
    expect(source).toContain("id={panelDomId(selectedTabIndex)}");
    expect(source).toContain('layoutId={`${shellId}-tab-active-bg`}');
    expect(source).toContain('layoutId={`${shellId}-mobile-tab-active-bg`}');
    expect(source).not.toContain('id={`pageshell-tab-desktop-${tab.id}`}');
    expect(source).not.toContain('id={`pageshell-tab-mobile-${tab.id}`}');
    expect(source).not.toContain('id={`pageshell-panel-${activeTab.id}`}');
  });

  it("keeps fallback panel rendering and selected tab semantics synchronized", () => {
    expect(source).toContain('const selectedTabId = activeTab?.id ?? ""');
    expect(source).toContain(
      "const selectedTabIndex = tabs?.findIndex((tab) => tab.id === selectedTabId) ?? -1",
    );
    expect(source.match(/const active = tab\.id === selectedTabId/g)).toHaveLength(2);
    expect(source).toContain("tabs.findIndex((tab) => tab.id === selectedTabId)");
    expect(source).toContain('aria-label={activeTab.label}');
  });

  it("only points active tabs at the mounted panel", () => {
    expect(source.match(/aria-controls=\{active \? panelDomId\(i\) : undefined\}/g)).toHaveLength(2);
    expect(source).not.toContain('aria-controls={`pageshell-panel-${tab.id}`}');
  });

  it("moves focus and visibility with keyboard tab selection", () => {
    expect(source).toContain("const activateTabFromKeyboard = useCallback(");
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain('event.key === "ArrowLeft"');
    expect(source).toContain('event.key === "Home"');
    expect(source).toContain('event.key === "End"');
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("nextButton?.focus()");
    expect(source).toContain('nextButton?.scrollIntoView({ block: "nearest", inline: "nearest" })');
    expect(source).toContain("activateTabFromKeyboard(event, i, desktopTabListRef.current)");
    expect(source).toContain("activateTabFromKeyboard(event, i, mobileTabListRef.current)");
  });

  it("keeps action triggers semantically connected to the dialog", () => {
    expect(source.match(/aria-label="Page sub-navigation"/g)).toHaveLength(2);
    expect(source.match(/aria-orientation="horizontal"/g)).toHaveLength(2);
    expect(source.match(/aria-label="Page actions"/g)).toHaveLength(3);
    expect(source.match(/\.\.\.pageActionTriggerProps/g)).toHaveLength(3);
    expect(source).toContain('"aria-controls": mobileActionsOpen ? actionsDialogId : undefined');
    expect(source).toContain('"aria-expanded": mobileActionsOpen');
    expect(source).toContain('"aria-haspopup": "dialog" as const');
    expect(source).toContain("id={actionsDialogId}");
    expect(source).toContain("aria-labelledby={actionsTitleId}");
  });

  it("closes the mobile dialog if responsive layout or actions make it hidden", () => {
    expect(source).toContain('window.matchMedia("(min-width: 768px)")');
    expect(source).toContain("if (desktopQuery.matches || !actions) setMobileActionsOpen(false)");
    expect(source).toContain('desktopQuery.addEventListener("change", closeWhenHidden)');
    expect(source).toContain('desktopQuery.removeEventListener("change", closeWhenHidden)');
    expect(source).toContain("mobileActionsOpen && actions && (");
  });

  it("does not steal horizontal gestures from controls or scrollable descendants", () => {
    expect(source).toContain("const TAB_SWIPE_EXCLUSION_SELECTOR");
    expect(source).toContain('"[role=\'slider\']"');
    expect(source).toContain('"[role=\'switch\']"');
    expect(source).toContain('"[data-no-tab-swipe=\'true\']"');
    expect(source).toContain("function shouldSuppressTabSwipe(");
    expect(source).toContain("node.scrollWidth > node.clientWidth");
    expect(source).toContain('window.matchMedia("(max-width: 767px)").matches');
    expect(source).toContain("shouldSuppressTabSwipe(event.target, event.currentTarget)");
    expect(source).toContain("pointerId: event.pointerId");
    expect(source).toContain("swipe.pointerId !== event.pointerId");
  });

  it("limits sheet dragging to the handle and preserves scrollable selectable content", () => {
    expect(source).toContain('data-slot="page-actions-overlay"');
    expect(source).toContain('data-slot="page-actions-dialog"');
    expect(source).toContain('data-slot="page-actions-drag-handle"');
    expect(source).toContain("const sheetDragControls = useDragControls()");
    expect(source).toContain("dragControls={sheetDragControls}");
    expect(source).toContain("dragListener={false}");
    expect(source).toContain("dragMomentum={false}");
    expect(source).toContain("onPointerDown={(event) => sheetDragControls.start(event)}");
    expect(source).not.toContain("md:hidden select-none");
    expect(source).not.toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
  });

  it("uses bounded transitions on stable tab controls", () => {
    expect(source.match(/transition-\[background-color,border-color,color,box-shadow,transform\]/g)).toHaveLength(
      2,
    );
  });

  it("honors reduced motion across tabs, panels, and the custom action sheet", () => {
    expect(source).toContain("useReducedMotion");
    expect(source).toContain("const reduceMotion = useReducedMotion()");
    expect(source.match(/reduceMotion\s*\? \{ duration: 0\.01 \}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain(
      'reduceMotion ? false : { opacity: 0, transform: "translate3d(0, 4px, 0)" }',
    );
    expect(source).toContain('initial={reduceMotion ? false : { y: "100%" }}');
    expect(source).toContain('exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}');
  });
});
