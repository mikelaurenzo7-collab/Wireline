# BotBound Accessibility Statement

BotBound aims to make its web application usable with keyboard navigation, assistive technology, enlarged text and reduced motion. The design target is **WCAG 2.2 Level AA**, preserving the earlier WCAG 2.1 AA baseline.

This document describes implemented contracts and the verification still required. It is not a claim that every route, device, provider interaction or assistive technology has passed a complete conformance assessment.

## Implemented Contracts

| Area                         | Current implementation                                                                                                                                 | Source                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation                   | Shared semantic links, buttons, focus states and menu primitives; workspace icon navigation retains accessible names and hover or focus labels         | `WorkspaceShell.tsx`, `src/constants/navigation.ts`, `atoms/DropdownMenu.tsx`                                                                                     |
| Skip links and route changes | Public and workspace skip links target the main region; `RouteChangeA11y` announces navigation and manages route entry focus                           | `layout/SkipToContentLink.tsx`, `marketing/PrecisionPublicHeader.tsx`, `WorkspaceShell.tsx`, `RouteChangeA11y.tsx`                                                |
| Touch targets                | The shared system uses a 40px desktop floor, 44px comfortable touch targets and 48px primary action tier; compact switches have an expanded hit region | `design-tokens/wireline.tokens.json`, `atoms/Button.tsx`, `system-refinement-pass-two.css`, `system-hardening.css`                                                |
| Color and contrast           | Semantic text, action, status and surface roles have dark values and web light overrides                                                               | `design-tokens/wireline.tokens.json`, `src/styles/theme-light.css`                                                                                                |
| Reduced motion               | The app explicitly sets `MotionConfig reducedMotion="user"`; CSS removes nonessential movement and preserves status text                               | `src/App.tsx`, `src/styles/system-hardening.css`, `src/styles/botbound-master-polish.css`, `src/styles/precision-studio.css`                                      |
| Focus and overlays           | Shared controls expose visible focus; canonical Radix dialogs and menus manage focus and dismissal                                                     | `atoms/Button.tsx`, `atoms/Dialog.tsx`, `atoms/DropdownMenu.tsx`, `src/styles/system-hardening.css`                                                               |
| Form semantics               | `FormField` associates a label, description and error with its control, preserves existing description IDs, and exposes required and invalid state     | `src/components/molecules/FormField.tsx`                                                                                                                          |
| Error and progress feedback  | Shared status notices expose status or alert semantics; route fallbacks expose loading state                                                           | `molecules/StatusNotice.tsx`, `layout/RouteFallback.tsx`                                                                                                          |
| Responsive text              | Editable controls use at least 16px below 768px; responsive rules support text enlargement and content reflow                                          | `src/index.css`, `atoms/Input.tsx`, `src/styles/responsive.css`                                                                                                   |
| Automated checks             | Source contracts and Playwright accessibility suites are present in CI and release verification                                                        | `scripts/check-accessibility-contract.mjs`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/accessibility-interactions.spec.ts`, `tests/e2e/marketing-a11y.spec.ts` |

Component paths without a `src/` prefix are relative to `src/components/`; stylesheet names are relative to `src/styles/`. These source contracts do not prove that every consumer uses them correctly. Review actual rendered controls and interactions in the current revision.

## Verification and Acceptance

Follow the [accessibility gate](accessibility-e2e-gate.md) and the [responsive review scorecard](design-system-responsive-roadmap.md#review-scorecard). Record the commit, environment, route, state, viewport, appearance and evidence for each result. Distinguish **Pass**, **Needs Fix**, **Not Executed** and **Blocked**.

1. **Keyboard:** exercise the entire relevant task without a pointer. Check visible focus, meaningful order, skip links, tabs, menus, dialogs, dismissal and focus return. Confirm that fixed chrome does not cover the focused control.
2. **Text and reflow:** inspect normal text and 200% text at narrow widths, including nested containers. Check browser zoom separately where available. Keep primary actions reachable with a mobile keyboard open.
3. **Contrast and state:** check actual rendered colors in light and dark appearances, including hover, selected, focus, invalid and busy states. Target 4.5:1 for normal text, 3:1 for large text and 3:1 for required control indicators. Decorative rules are not automatically required control indicators.
4. **Reduced motion and forced colors:** verify that movement is removed where unnecessary without hiding progress, state or essential controls. Check selected states and focus when author colors are replaced.
5. **Assistive technology:** record direct NVDA, VoiceOver or TalkBack results for the flows actually exercised. Automated semantics checks do not replace these sessions.
6. **Failure recovery:** exercise denied permissions, unavailable services and rejected saves where relevant. Preserve the attempted values, announce the error and provide a usable next action.

The dedicated `accessibility-e2e.yml` workflow is a manual focused diagnostic. The full Playwright suite also runs through the repository's PR and main verification workflows. A passing automated run covers its tested states; it does not establish complete accessibility or prove a live call, payment or email delivery.

Do not ship a new critical or serious accessibility regression on a critical flow without the documented disposition required by the accessibility gate. Existing evidence remains historical until its revision and scope match the current review.

## Coverage That Requires Direct Review

- **Voice and rehearsal:** phone audio is one interaction mode, not evidence that the complete product is accessible. Review the setup, transcript, microphone controls, status changes and error recovery independently.
- **Live updates:** verify that call, computer and job progress announcements are understandable without flooding the screen reader. A live region in source is not proof of a useful listening experience.
- **Charts and tables:** check that meaningful values and outcomes are available beyond color or shape. Do not assume that a chart label exposes every relevant data point.
- **External providers:** authentication, payment and provider console flows have their own behavior and accessibility constraints. Record where testing leaves the BotBound interface.
- **Extension and native clients:** generated token parity does not prove device behavior, dynamic type, keyboard access or screen reader support. Track runtime coverage separately from the web application.

## Reporting Issues

Email **support@botbound.app** with the subject **Accessibility**. Include the affected page, the action attempted, device and browser, and any assistive technology involved. A screenshot or recording can help when it is safe to share. Do not include passwords, verification codes or private customer content.

Record the user impact, workaround, owner and next update when triaging a report. Do not direct customers to an unverified phone number or an interface that has not been confirmed to exist.

## Standards Reference

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/)
- [Section 508](https://www.section508.gov/)

Source documentation reviewed October 20, 2026. Current visual and assistive technology results belong in the dated review evidence, not in an undifferentiated claim of conformance.
