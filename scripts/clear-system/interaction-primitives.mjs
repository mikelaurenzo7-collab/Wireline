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
    "src/styles/system-hardening.css",
    systemHardening,
    /aria-invalid="true"[\s\S]*wireline-color-status-error/,
    "shared fields must style standards-based aria-invalid state",
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
    "src/styles/system-refinement-pass-two.css",
    systemRefinement,
    /@media \(pointer: coarse\)[\s\S]*data-slot="button"\]\[data-size="icon"\][\s\S]*min-width:[\s\S]*44px[\s\S]*min-height:[\s\S]*44px/,
    "icon buttons must use real 44px geometry on coarse pointers",
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
    /existingDescribedBy[\s\S]*descriptionId[\s\S]*errorId/,
    "form fields must preserve caller-provided descriptions while adding help and errors",
  );
  mustInclude(
    "src/components/molecules/FormField.tsx",
    formField,
    /const isRequired = required \|\| child\?\.props\.required === true[\s\S]*required:\s*isRequired \? true : undefined[\s\S]*aria-required/,
    "form fields must keep native and ARIA required state consistent",
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
    /const isInvalid = ariaInvalid === true \|\| ariaInvalid === "true"[\s\S]*data-invalid=\{isInvalid \|\| undefined\}/,
    "form fields must reflect caller-provided invalid state on the wrapper",
  );
}
