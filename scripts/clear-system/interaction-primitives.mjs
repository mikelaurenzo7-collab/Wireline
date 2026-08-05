/**
 * Interaction primitives — ergonomic target geometry, semantic state parity,
 * portalled-surface consistency, and shared form accessibility.
 */
export function checkInteractionPrimitives({ read, mustInclude }) {
  const systemHardening = read("src/styles/system-hardening.css");
  const systemRefinement = read("src/styles/system-refinement-pass-two.css");
  const button = read("src/components/atoms/Button.tsx");
  const switchSource = read("src/components/atoms/Switch.tsx");
  const formField = read("src/components/molecules/FormField.tsx");
  const select = read("src/components/ui/shadcn/Select.tsx");
  const pageShell = read("src/components/PageShell.tsx");

  mustInclude(
    "src/components/atoms/Switch.tsx",
    switchSource,
    /data-slot="switch"/,
    "switch must expose a stable design-system slot",
  );
  mustInclude(
    "src/styles/system-hardening.css",
    systemHardening,
    /button\[data-slot="switch"\]:not\(\.wl-compact-control\):not\(\[data-compact="true"\]\)[\s\S]*min-height:\s*0/,
    "switch visual geometry must override the global 44px button height with sufficient specificity",
  );
  mustInclude(
    "src/styles/system-hardening.css",
    systemHardening,
    /button\[data-slot="switch"\]::after[\s\S]*width:\s*max\(44px,\s*100%\)[\s\S]*height:\s*max\(44px,\s*100%\)/,
    "switch must retain a 44px hit region without enlarging its track",
  );

  mustInclude(
    "src/styles/system-hardening.css",
    systemHardening,
    /dropdown-menu-content[\s\S]*role="menuitem"[\s\S]*wireline-interaction-target-comfortable/,
    "portalled menu rows must meet the mobile touch-target contract",
  );
  mustInclude(
    "src/styles/system-hardening.css",
    systemHardening,
    /dropdown-menu-content[\s\S]*data-highlighted[\s\S]*wireline-color-surface-subtle/,
    "portalled menu rows must expose a visible highlighted state",
  );
  mustInclude(
    "src/styles/system-hardening.css",
    systemHardening,
    /dialog-overlay[\s\S]*sheet-overlay[\s\S]*alert-dialog-overlay[\s\S]*wireline-color-overlay-scrim/,
    "shared overlays must use the theme-aware scrim token",
  );
  mustInclude(
    "src/styles/system-hardening.css",
    systemHardening,
    /recipe-modal-title[\s\S]*100dvh/,
    "legacy recipe modal must use the dynamic viewport contract",
  );
  mustInclude(
    "src/styles/system-refinement-pass-two.css",
    systemRefinement,
    /select-trigger[\s\S]*aria-invalid[\s\S]*not\(\[aria-invalid="false"\]\)[\s\S]*wireline-color-status-error/,
    "native and Radix fields must style every standards-based invalid value",
  );
  mustInclude(
    "src/styles/system-hardening.css",
    systemHardening,
    /-webkit-autofill[\s\S]*wireline-color-surface-default/,
    "browser autofill must preserve the active appearance",
  );

  mustInclude(
    "src/components/atoms/Button.tsx",
    button,
    /aria-disabled:pointer-events-none[\s\S]*aria-busy:cursor-wait/,
    "button atom must expose disabled-link and busy-state feedback",
  );
  mustInclude(
    "src/components/atoms/Button.tsx",
    button,
    /focus-visible:ring-offset-\[var\(--wireline-color-canvas-default\)\]/,
    "button focus halo must use the active canvas as its offset",
  );
  mustInclude(
    "src/components/atoms/Button.tsx",
    button,
    /const resolvedSize = size \?\? "default"[\s\S]*data-size=\{resolvedSize\}/,
    "button atom must expose resolved size metadata for pointer-specific geometry",
  );
  mustInclude(
    "src/components/atoms/Button.tsx",
    button,
    /function stopDisabledActivation[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)/,
    "aria-disabled controls must suppress activation rather than only changing appearance",
  );
  mustInclude(
    "src/components/atoms/Button.tsx",
    button,
    /const guardedChildren[\s\S]*React\.cloneElement\(children[\s\S]*onClick:\s*stopDisabledActivation[\s\S]*onClickCapture:\s*stopDisabledActivation[\s\S]*onKeyDownCapture/,
    "aria-disabled slotted controls must block child activation before Radix Slot handler composition",
  );
  mustInclude(
    "src/components/atoms/Button.tsx",
    button,
    /onClickCapture=\{ariaDisabled \|\| onClickCapture[\s\S]*onKeyDownCapture=\{ariaDisabled \|\| onKeyDownCapture[\s\S]*disabled=\{asChild \? undefined : disabled\}/,
    "disabled activation guards must cover capture and bubble phases without invalid native attributes",
  );
  mustInclude(
    "src/styles/system-refinement-pass-two.css",
    systemRefinement,
    /@media \(any-pointer: coarse\)[\s\S]*data-slot="button"\]\[data-size="icon"\][\s\S]*min-width:[\s\S]*44px[\s\S]*min-height:[\s\S]*44px/,
    "icon buttons must use real 44px geometry on every coarse-capable pointer",
  );

  mustInclude(
    "src/components/ui/shadcn/Select.tsx",
    select,
    /data-slot="select-trigger"/,
    "Radix select triggers must expose a stable state-styling slot",
  );

  mustInclude(
    "src/components/molecules/FormField.tsx",
    formField,
    /const controlId = child\?\.props\.id \?\? htmlFor \?\? generatedControlId/,
    "form field label and child control must resolve one atomic identifier",
  );
  mustInclude(
    "src/components/molecules/FormField.tsx",
    formField,
    /React\.cloneElement\(child,[\s\S]*id:\s*controlId/,
    "form fields must apply the resolved identifier to the child control",
  );
  mustInclude(
    "src/components/molecules/FormField.tsx",
    formField,
    /function splitIdRefs[\s\S]*split\(\/\\s\+\/[\s\S]*existingDescriptionIds[\s\S]*new Set\(\[[\s\S]*\.\.\.existingDescriptionIds[\s\S]*descriptionId[\s\S]*errorId/,
    "form fields must normalize and deduplicate every caller-provided description IDREF",
  );
  mustInclude(
    "src/components/molecules/FormField.tsx",
    formField,
    /const nativeRequired = required \|\| child\?\.props\.required === true[\s\S]*const isRequired = nativeRequired \|\| isAriaTrue[\s\S]*required:\s*nativeRequired \? true : child\.props\.required[\s\S]*aria-required/,
    "form fields must keep native, ARIA, label, and wrapper required state coherent",
  );
  mustInclude(
    "src/components/molecules/FormField.tsx",
    formField,
    /aria-disabled[\s\S]*const isDisabled[\s\S]*data-disabled=\{isDisabled \|\| undefined\}/,
    "form fields must reflect native and ARIA disabled state in their label treatment",
  );
  mustInclude(
    "src/components/molecules/FormField.tsx",
    formField,
    /function isAriaInvalid[\s\S]*value !== false[\s\S]*value !== "false"[\s\S]*data-invalid=\{isInvalid \|\| undefined\}/,
    "form fields must reflect boolean, grammar, and spelling invalid state on the wrapper",
  );

  mustInclude(
    "src/components/PageShell.tsx",
    pageShell,
    /const shellId = useId\(\)[\s\S]*tabDomId[\s\S]*panelDomId/,
    "route shells must scope tab and panel identifiers per component instance",
  );
  mustInclude(
    "src/components/PageShell.tsx",
    pageShell,
    /TAB_SWIPE_EXCLUSION_SELECTOR[\s\S]*shouldSuppressTabSwipe[\s\S]*max-width: 767px[\s\S]*pointerId/,
    "route-shell swipe navigation must remain mobile-only and avoid interactive descendants",
  );
  mustInclude(
    "src/components/PageShell.tsx",
    pageShell,
    /matchMedia\("\(min-width: 768px\)"\)[\s\S]*setMobileActionsOpen\(false\)[\s\S]*removeEventListener/,
    "responsive layout changes must close hidden mobile action dialogs and release lifecycle locks",
  );
  mustInclude(
    "src/components/PageShell.tsx",
    pageShell,
    /data-slot="page-actions-dialog"[\s\S]*dragControls=\{sheetDragControls\}[\s\S]*dragListener=\{false\}[\s\S]*page-actions-drag-handle/,
    "custom action sheets must use stable slots and handle-only drag initiation",
  );
}
