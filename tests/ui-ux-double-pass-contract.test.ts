import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("UI/UX double-pass system contract", () => {
  it("registers the second-pass layer at the semantic-system boundary", () => {
    const index = read("src/index.css");
    const hardening = index.indexOf('@import "./styles/system-hardening.css";');
    const refinement = index.indexOf('@import "./styles/system-refinement-pass-two.css";');
    const responsive = index.indexOf('@import "./styles/responsive.css";');

    expect(hardening).toBeGreaterThan(-1);
    expect(refinement).toBeGreaterThan(hardening);
    expect(responsive).toBeGreaterThan(refinement);
  });

  it("keeps native controls synchronized with the resolved Wireline theme", () => {
    const css = read("src/styles/system-refinement-pass-two.css");

    expect(css).toContain(":root {\n  color-scheme: dark;");
    expect(css).toContain("html.light {\n  color-scheme: light;");
    expect(css).toContain("accent-color: var(--wireline-color-action-primary-default)");
  });

  it("hardens custom PageShell tabs and mobile actions across touch-capable devices", () => {
    const css = read("src/styles/system-refinement-pass-two.css");

    expect(css).toContain('[role="tablist"].tab-strip-scroll');
    expect(css).toContain("overscroll-behavior-inline: contain");
    expect(css).toContain("scrollbar-width: none");
    expect(css).toContain("touch-action: pan-x pan-y pinch-zoom");
    expect(css).toContain("@media (any-pointer: coarse)");
    expect(css).not.toContain("@media (pointer: coarse)");
    expect(css).toContain("scroll-snap-type: inline proximity");
    expect(css).toContain("scroll-snap-align: start");
    expect(css).not.toContain("scroll-snap-align: nearest");
    expect(css).toContain('.wl-ui-caps button[aria-label="Page actions"]');
    expect(css).toContain("--wireline-interaction-target-comfortable, 44px");
    expect(css).toContain('[data-slot="page-actions-overlay"]');
    expect(css).toContain('[data-slot="page-actions-dialog"]');
    expect(css).toContain("max-height: calc(100dvh");
    expect(css).toContain("padding-bottom: max(1rem, env(safe-area-inset-bottom))");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toContain("var(--wireline-color-overlay-scrim)");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).not.toContain('[role="dialog"][aria-label="Page actions"]');
  });

  it("uses actual hybrid-touch geometry for icon buttons", () => {
    const button = read("src/components/atoms/Button.tsx");
    const css = read("src/styles/system-refinement-pass-two.css");

    expect(button).toContain("const resolvedSize = size ?? \"default\"");
    expect(button).toContain("data-size={resolvedSize}");
    expect(button).not.toContain("after:pointer-events-none");
    expect(css).toContain('@media (any-pointer: coarse)');
    expect(css).toContain('[data-slot="button"][data-size="icon"]');
    expect(css).toMatch(
      /data-size="icon"[\s\S]*min-width:\s*var\(--wireline-interaction-target-comfortable, 44px\)[\s\S]*min-height:\s*var\(--wireline-interaction-target-comfortable, 44px\)/,
    );
  });

  it("enforces aria-disabled behavior before slotted child activation", () => {
    const button = read("src/components/atoms/Button.tsx");

    expect(button).toContain("function resolvesAriaDisabled(");
    expect(button).toContain("function stopDisabledActivation(");
    expect(button).toContain("const ariaDisabled = resolvesAriaDisabled(ariaDisabledProp)");
    expect(button).toContain("onClickCapture={ariaDisabled || onClickCapture");
    expect(button).toContain("onKeyDownCapture={ariaDisabled || onKeyDownCapture");
    expect(button).toContain("const guardedChildren =");
    expect(button).toContain("React.isValidElement<SlottedInteractionProps>(children)");
    expect(button).toContain("React.cloneElement(children");
    expect(button).toContain("onClick: stopDisabledActivation");
    expect(button).toContain("onClickCapture: stopDisabledActivation");
    expect(button).toContain("if (isActivationKey(event)) stopDisabledActivation(event)");
    expect(button).toContain("disabled={asChild ? undefined : disabled}");
    expect(button).toContain("aria-disabled={ariaDisabled || ariaDisabledProp || undefined}");
    expect(button).toContain("{guardedChildren}");
  });

  it("styles every standards-based invalid value across native and Radix controls", () => {
    const css = read("src/styles/system-refinement-pass-two.css");
    const select = read("src/components/ui/shadcn/Select.tsx");
    const formField = read("src/components/molecules/FormField.tsx");

    expect(select).toContain('data-slot="select-trigger"');
    expect(css).toContain('[data-slot="select-trigger"]');
    expect(css).toContain('[aria-invalid]:not([aria-invalid="false"])');
    expect(formField).toContain("function isAriaInvalid(");
    expect(formField).toContain('value !== undefined && value !== false && value !== "false"');
  });

  it("keeps native, ARIA, wrapper, and label required state coherent", () => {
    const formField = read("src/components/molecules/FormField.tsx");

    expect(formField).toContain("const nativeRequired = required || child?.props.required === true");
    expect(formField).toContain(
      'const isRequired = nativeRequired || isAriaTrue(child?.props["aria-required"])',
    );
    expect(formField).toContain("required: nativeRequired ? true : child.props.required");
    expect(formField).toContain('"aria-required": isRequired ? true : child.props["aria-required"]');
    expect(formField).toContain("data-required={isRequired || undefined}");
  });

  it("normalizes and deduplicates every aria-describedby IDREF", () => {
    const formField = read("src/components/molecules/FormField.tsx");

    expect(formField).toContain("function splitIdRefs(");
    expect(formField).toContain(".split(/\\s+/)");
    expect(formField).toContain("const existingDescriptionIds = splitIdRefs(");
    expect(formField).toContain("...existingDescriptionIds");
    expect(formField).toContain("new Set([");
  });

  it("does not animate every CSS property on stable shared surfaces", () => {
    const design = read("src/lib/wireline-design-system.ts");

    for (const key of [
      "settingsPanel",
      "settingsRow",
      "statusSuccess",
      "modalSurface",
      "panelFrame",
      "insightStatCard",
      "banner",
      "directorBubble",
      "accountHolderBubble",
      "proposalCard",
      "starterChip",
      "composerToolChip",
      "composerSendBtn",
      "capabilityCatPill",
      "scrollToBottom",
    ]) {
      const match = design.match(new RegExp(`${key}:[\\s\\S]*?(?=\\n  [a-zA-Z]|\\n} as const)`));
      expect(match?.[0], `${key} should remain in the shared contract`).toBeTruthy();
      expect(match?.[0], `${key} should use a bounded transition`).not.toContain("transition-all");
    }
  });

  it("protects generated and customer-provided content from widening route shells", () => {
    const css = read("src/styles/system-refinement-pass-two.css");

    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain(":where(input, select, textarea) {\n  min-width: 0;");
    expect(css).toContain("textarea:not([data-resize=\"none\"])");
    expect(css).toContain("resize: vertical");
    expect(css).toContain("resize: block");
  });
});
