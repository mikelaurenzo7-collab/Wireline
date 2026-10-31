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


## Narrow-viewport follow-up — 320px

A second **live main** browser scan covered 320/390/768/1024/1440px and both appearances. Signed-in routes redirected to sign-in in this separate browser session, so the previous successful authenticated pass remains the source for Studio/Inbox/Calls/Settings. The live public scan found:
- At **320px**, public header wraps into two rows (approximately 109px high), whereas at 390px it is about 65px.
- At **320px**, the simulated browser address `.landing-prestige__browser-url` exceeded its browser-bar right edge.
- The first-visit floating Privacy Choices panel overlapped homepage workflow content on the narrow phone.
- The live `#f7f7f3` canvas and `#ffffff` card mismatch remained visible on Pricing and Features. This is addressed in the **unmerged PR light token**, not on live main.

**Source fixes committed on this branch:** public header keeps its primary CTA and menu on one line below 390px while putting signed-out Sign In inside the menu; the browser URL now shrinks and ellipsizes; the recipe form/input/result system and selected shared/account-admin components use semantic readable text, field borders, and state surfaces in place of hardcoded white/black and `text-muted` surface-colored copy. The Tailwind dark variant now explicitly excludes the `html.light` root, not just its descendants. Contrast contract and 320px E2E regression coverage expanded.

**Cookie notice:** Separate **PR #1444** already proposes an inline first-visit phone treatment. Do not duplicate or override that patch in #1445; coordinate merge and test the combined result. Any appearance/viewport fixes in this report are code changes pending local/CI build and rendered **PR preview**, not verified live fixes.


## Extended source follow-up

The design pass also inspected the recipe result and sentiment views. Several neutral/warning/error badges relied on dark-only alpha fills or light-on-light borders; they now use the existing semantic feedback text/background/border variables. Admin team/growth panels, the phone-number picker, and the shared segmented control previously rendered `text-muted` as a **surface-fill color** (not a foreground role). They now use `text-muted-foreground`, and nearby controls use semantic surfaces. Expanded Vitest source contracts guard the repaired usage.

The Open Graph image *generator* at `scripts/render-image-assets.mjs` also still emitted a cream canvas and old light ink; it now produces white and the current light text colors when `npm run assets` is executed. Generated public assets and build output **have not been rebuilt or inspected** in this session. No claim of production image parity is made.

A browser-verified inline phone privacy notice remains a **separate PR #1444 change pending merger**, and the header/browser mock fixes on this PR remain **unrendered until a preview build**. New 320px and 375px Playwright cases document the desired compact header and truncation behavior.


## Follow-up: missing brand utilities and exact-head release evidence

The next source pass found unregistered Tailwind utility names `brand-2` and `brand-3` used in four active product components. The canonical `@theme inline` bridge does not register those tiers. These use sites now use supported semantic status/feedback colors or the registered primary action palette:
- `src/components/insights/TopicsView.tsx` (new/steady/declining trend badges and track)
- `src/components/admin/GrowthPanel.tsx` (Add Industry action; duplicate padding utility also removed)
- `src/components/recipes/forms/AgentReviewForm.tsx` (high/critical risk indicators)
- `src/components/IntakeKeysManager.tsx` (auto-dial state, enabled checkbox, agent tags, documentation labels)

The contrast contract now rejects those undefined utilities in these active components, while the Playwright suite checks that System follows OS changes and that a manually selected Light appearance remains stable across routes. These are source-level changes; tests have not actually executed on the PR head.

**CI audit:** The GitHub connection sees **zero Actions runs on this design branch and on separate spring-clean PR #1444**. The repository has older PR workflow history (recent visible pull_request runs from August 18) but this does not establish why current PR workflows are missing. The browser was not logged into the private GitHub account, and could not inspect Actions settings or dispatch a run. CI remains an explicit blocker. Local `git clone` from this execution environment could not resolve GitHub DNS, so no local install/build/test was run. Do not merge/deploy until an authorized runner has verified the exact resulting commit.


## Cleanup pass — verification gates and legacy source ownership

Follow-on audit inspected the actual CSS import graph and matched design verification scripts with the updated white-light theme. The 31 direct imports in `src/index.css` include deliberate sub-import aggregators (`wireline-layout-passes.css`, `wireline-product-surfaces.css`, `wireline-marketing-surfaces.css`) and a terminal `type-integrity.css` import nested under `safe-area-ownership.css`. These wrappers are not empty or unused and were **not deleted**.

**Repairs on this branch:**
- Updated stale pre-white checks in `scripts/clear-system/structure-hygiene.mjs` (light tertiary color) and `scripts/clear-system/design-tokens.mjs` (social preview should validate the current white **generator**, not demand a pre-build beige vector). The build asset script has already switched the authored OG background to white. Generated OG PNG/SVG assets still require `npm run assets` during CI/build; no claim is made that the checked-in raster has been updated.
- Synced the canonical design principle and README assertions in `tests/wireline-design-vision-contract.test.ts` and `tests/wireline-product-docs.test.ts` with the true-white source; updated `README.md` and `ARCHITECTURE.md`.
- Repaired nine stale light palette values in the semantic color table of `.superdesign/design-system.md` and added a test that compares 15 documentation roles directly to the dark DTCG source and light CSS overrides.
- Removed `body` text-rendering/font-smoothing overrides in `src/index.css` because they followed the imported type-integrity rules in the cascade; added a source gate to prevent reintroduction.
- Removed unreachable `/overview` CSS selectors from `visual-qa-hotfix.css` and `route-density-fixes.css` (the route redirects to Studio); added a source regression contract.
- Replaced `text-muted` as an ink color and `text-muted/70` on Webhooks, Trial Gate, Agent Templates, Phone Picker and Audit Activity, replacing ineffective `text-eyebrow/60` headings with semantic ink/typography. Expanded guards on modified components.
- Marked the previously asserted 100/100 launch-readiness document as a **historical snapshot**, not a release certification for the untested draft PR.

Independent source-text checks of the seven key gate/doc/cascade conditions passed. The palette comparison of 15 dark/light documented roles found zero differences. **These are source checks only**, not a running Vitest/Playwright/build or preview. CI for this branch and PR #1444 remains unobserved; do not merge until full execution and visual parity at the exact head.
