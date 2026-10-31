# Light and dark appearance parity — October 30, 2026

**Baseline:** `origin/main` `cf95cfa0d62b3fbd9c921b7d3aad18730fb10d41`.  
**Scope:** One shared BotBound appearance system in light, dark, and system-following mode.  
**Release state:** Source changes are isolated on a PR branch, not deployed or visually certified.

## Source-audited visual findings

- Both appearances share the DTCG tokens, generated CSS and native artifacts. First-visit defaults to light, saved preference takes precedence, and the ThemeProvider updates `color-scheme`, browser theme metadata and the `.light` document class.
- Read-only browser review of [home](https://botbound.app/), [pricing](https://botbound.app/pricing), [features](https://botbound.app/features), and [sign-in](https://botbound.app/signin) at 1440px desktop and 390px phone confirmed legible light-mode UI without observed horizontal clipping. It could not exercise dark from public UI because no appearance control existed there. Those are **old-main screenshots**, not a preview of this PR.
- The live privacy notice obscured content on home, pricing and features (both widths). This is a known cross-theme layout issue; the existing unmerged spring-cleaning PR #1444 contains a separate narrow-screen notice layout change. Do not merge overlapping privacy fixes without coordinated preview review.
- Desktop pricing Plus action was displaced about 20px lower by a wrapping included-identities line. The plan card now stretches the descriptive button area to align the plan details and CTA row.

## High-contrast true-white update

- The previous light canvas `#F7F7F3` was warm beige while card surfaces were `#FFFFFF`; this produced visible inconsistent cream/white blocks. **The canonical light canvas and primary cards now both use `#FFFFFF`**, with `#F8F9FA` subtle surfaces, `#F3F4F6` neutral containers and `#E8EBEF` stronger surfaces. No beige canvas remains in the runtime light palette.
- Primary ink is `#171717`; secondary labels and status inks have increased contrast. Light secondary action hover/pressed colors were darkened and strong borders moved to `#7C8590`. The light-only authentication field boundary uses the strong border while preserving its violet focus rule.
- `index.html`, the initial no-JavaScript app shell, `ThemeContext` metadata, PWA manifest, design vision, UI contracts and current design guidance use the same white canvas. Existing dark-mode canvas and all user preferences are preserved.
- A source-level computation across eight normal text/status roles on canvas, cards, strong gray and violet containers found a minimum **5.31:1 in light** and **4.94:1 in dark**. Strong light outlines measure **3.74:1 against white** and **3.13:1 against strong gray**. Secondary action default/hover/pressed states also met 4.5:1. These are color-token calculations rather than rendered contrast audits.
- An authorized read-only login attempt to inspect the authenticated workspace was rejected by the production sign-in as invalid credentials. The attempt was stopped, no account content was accessed, and no credentials were written to the repository. Authenticated screenshots remain blocked pending working sign-in.

## Corrections in this branch

1. Light-theme secondary ink and success/warning/error/neutral status inks were deepened so normal-sized labels can remain readable on stronger and violet-tinted surfaces. Status hue roles were preserved.
2. The dark tertiary text token was adjusted from `#908CA5` to `#9A95AC`. The DTCG source and all generated web, extension, Swift, Kotlin and Dart outputs were synchronized, as were the local dark CTA overrides, design vision, and MCP widget fallback tokens. No parallel design palette was introduced.
3. The universal text selection now uses an opaque primary action background paired with its on-action ink, rather than a low-contrast translucent wash that inherited the foreground of whatever card it crossed.
4. A compact accessible public header button switches between light/dark on desktop; the equivalent action is in the mobile navigation drawer so the small header does not overflow. The standalone authentication screen includes the same control in the normal footer link row, not in an overlay.
5. The existing Appearance settings control retains the user's Light/Dark/System preference and now has restrained Sun/Moon/Monitor icons with Light first, consistent with first-visit behavior.
6. Added source-level WCAG 2.1 AA contrast regression checks for primary/secondary/tertiary and status text on canvas/default/strong/violet surfaces and on-action text across button default/hover/pressed states; added Playwright coverage for first paint, theme persistence, desktop/mobile public switches and sign-in.

## Verification status

- **Source-calculated contrast:** 4.5:1 or higher for the sampled normal-text/surface and on-action combinations in both appearances after the token changes. This is not a complete rendered WCAG audit; color mixing, disabled states, images, embedded content and overlays still require browser inspection.
- **Test execution:** Not yet verified in a runnable checkout. GitHub CI, TypeScript, lint, theme contrast tests and Playwright must pass on the exact PR head before merge.
- **Visual QA pending:** Preview both appearances at 320/375/390/430/768/1440 widths; exercise homepage, pricing, features, sign-in/sign-up, overview, Studio, Inbox and Settings, plus system theme changes. Confirm CTA baseline, focus indicators, form contrast, dialogs, mobile nav, cookie notice and accessibility semantics. Separate native build checks must follow if native artifacts are included in release scope.
- **Release:** Do not deploy or merge without CI and visual parity confirmation. Theme changes must not alter billing, customer data, voice runtime, or carrier callbacks.


## Authenticated live double-pass — completed October 30

A one-time login using the corrected account email succeeded without MFA. Read-only Browser Use inspected live Render-backed `main` at **1440×900** and **390×844** in both Light and Dark, including Studio, Inbox, Calls, Settings, and Appearance & Brand (`/settings/customization`). The actual Light → Dark → Light toggle operated without apparent reflow, clipping, color residue, or horizontal scroll; light preference was restored. Mobile More bottom sheet and desktop command palette opened with usable backdrop/close controls. No private account content was added to this audit.

Sampled live computed contrast (not a full AA sweep): **light primary body 16.32:1**, **light muted text on white panel 6.02:1**, **dark primary body 18.05:1**. Live `main` still renders a warm off-white canvas and near-white panels, so these screenshots **do not visually certify** the PR's pure-white `#FFFFFF` replacement or its focused-auth-border override. There were no major defects in sampled live states, but passing visual inspection does not replace code-build and E2E checks.

The browser observed `/overview` redirect to Studio, which source inspection confirmed **intentional**: `src/routes/AppRoutes.tsx` explicitly documents retired Overview and routes it to `ToStudioRedirect`. This is not a newly introduced bug.

**Outstanding:** run CI on PR exact head (no Actions runs were visible), run preview screenshots for the new white palette, verify narrow first-visit cookie notice after separate PR #1444, and exercise additional focus, error and extended-text states. No production data or billing settings were modified; only the appearance preference was toggled and restored.
