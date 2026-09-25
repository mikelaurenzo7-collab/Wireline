# BotBound Design System Audit

Date: 24 September 2026. Baseline: `89cf6b0b50b7acd2ce9c9701cdce0441b34ef067`.

The current identity is coherent. Keep the violet primary action, dark canvas, Inter Tight / Inter / IBM Plex Mono type families, robot wordmark, "Your Next Hire Is a Bot" headline, and concise capability bullets. The useful refinements are in shared semantics and control consistency.

Disposition: the representative audit and follow-up Studio reflow are implemented. The design system still needs the completed release gate and broader state/device coverage below. No merge or deployment is certified by this audit record.

## Baseline findings and refinements

| Priority | Finding | Evidence | Resolution |
| --- | --- | --- | --- |
| P1, open | Studio settings clips content at 320px with 200% root text. | At a 32px root font, `#studio-inspector` has 256px client width and 311px scroll width; a settings section has 175px client width and 305px scroll width. The screenshot shows a clipped heading, squeezed identity control and truncated bottom navigation labels. The same 320px layout at a 16px root font is contained. | Give this a coordinated layout pass: cap cumulative gutters, let context and inspector headers wrap, make tone choices adapt to available inline space, and keep navigation names available without horizontal clipping. Do not conceal the problem with overflow suppression or smaller user text. |
| P2 | Light wire-button labels lose contrast on their normal and hover backgrounds. | Actual Button component: `#6b7280` on `#eef0f3` is 4.234:1; on `#dfe3e8` it is 3.750:1. | Secondary action text becomes `#596170`: 5.460:1 and 4.835:1. |
| P2 | Tertiary text is only safe on a subset of the documented surfaces. | Light metadata is 4.134:1 on container and 3.714:1 on strong; dark metadata is 4.445:1 on strong. | Light tertiary becomes `#625c76`, dark becomes `#908CA5`. Worst standard-surface ratios are 4.626:1 and 4.745:1. |
| P3 | Shared text fields use the marketing corner scale. | Input, Textarea, NativeSelect and Radix SelectTrigger render 20px corners; the design guide specifies 6-12px product corners. | All four use the existing 12px token. |
| P2, follow-up | The cascade has too many overlapping owners for predictable refinement. | 58 reachable CSS files, 15,078 baseline lines, 1,871 rules, 115 `!important` declarations. Several successive refinement files target the same primitives. | Consolidate one component family at a time; retain rendered comparisons before removing overrides. No bulk cascade rewrite in this pass. |
| P3, follow-up | Dialog implementations can drift despite a shared visual contract. | Both `atoms/Dialog.tsx` and `ui/shadcn/Dialog.tsx` implement portal, overlay, close, title and description behavior. | Converge the compatibility entrypoint after comparing its consumers and presentation APIs. |
| P2, follow-up | Some visual test expectations predate the concise Features page. | `tests/e2e/design-flow-polish.spec.ts` still expects a three-step "Get started" list that the current page does not render. | Update that journey to test the six capability bullets and working pricing/signup navigation. |

Contrast calculations use unrounded sRGB relative luminance. The normal-text target is 4.5:1, following [WCAG 2.2 contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). These checks do not constitute a complete WCAG conformance assessment. Decorative borders are not automatically failures; required control indicators need a separate contextual assessment under [non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## System review

| Area | Assessment |
| --- | --- |
| Brand and copy | Keep the current identity and concise Features bullets. Avoid additional explanatory sentences beneath self-explanatory capability labels. |
| Tokens | Canonical dark values remain in `design-tokens/wireline.tokens.json`; light overrides remain in `theme-light.css`. Generated web, extension, Swift and Kotlin values are synchronized. |
| Typography | The three approved families and authored heading casing remain the system. Customer-entered content must keep its casing. |
| Layout | Public routes and account entry use different intentional shells. Assess nested containers, not only document overflow. |
| Buttons and fields | Primary, secondary, destructive, disabled, busy, invalid and read-only states were inspected in a local fixture using the actual components and production stylesheet. |
| Dialogs and menus | Desktop menu-in-dialog selection, containment and focus restoration were exercised. The closing dialog restored focus to its trigger. |
| Accessibility | Focus, descriptions, invalid states, reduced-motion rules, touch geometry and narrow/enlarged-text account entry were reviewed. Native input text scrolling is distinct from layout overflow. |
| Cross-platform | Token generation and parity are checked. Native apps and extension interactions require their own device/runtime review. |

## Evidence and verification

Fresh captures and source inventories are in the local `artifacts/design-system-audit/2026-09-24` package. Earlier screenshot galleries were not used as current evidence. Component fixtures contain synthetic labels; workspace fixtures must not be interpreted as proof of live accounts, calls, billing or provider readiness.

| Rendered coverage | Result |
| --- | --- |
| Home and Features, dark desktop | Hierarchy, existing headline, concise bullets and public navigation inspected. |
| Pricing, dark 390px | Plan layout and controls contained; local availability status is not provider proof. |
| Signup, dark and light 320px | Fields, focus and password guidance inspected. Dark 200% root text had no structural container overflow. |
| Shared components, both appearances | Buttons, badges, text fields, invalid and read-only states inspected. After-build fields compute to 12px corners; wire action foreground computes to `#596170`; tertiary text computes to the new theme values on default, container and strong surfaces. |
| Menu inside Dialog | Selection remained visible and usable; closing restored focus to the trigger. This capture predates the radius refinement. |
| Studio settings, dark desktop 1280px and mobile 390px / 320px | No horizontal overflow in the sampled main, section, aside and tab containers. Closing mobile settings restored focus to the settings trigger. Synthetic account and Bot data only. |
| Studio settings, 320px with 200% root text | Failed containment; retained as a P1 open finding, not a passing screenshot. |

Verification completed:

- Six focused contract files cover 45 unique test cases. All passed after synchronizing the MCP palette and rerunning the affected 12-case design-vision file. Two earlier baseline cases exceeded the default five-second timeout on this machine and passed with a 30-second timeout.
- `npm run design:check`, `npm run design:tokens:check`, `npm run source-control:check`, `npm run docs:check`, and `git diff --check` passed.
- A production Vite build of the real app plus the ignored component-fixture entrypoint passed (3,133 modules). The final workspace and refined-control captures use those compiled assets.
- Changed TS/TSX and test files passed the focused formatting check. Canonical token JSON and light-theme CSS have formatting warnings also present in their untouched baseline copies; no broad reformat was performed.
- The standalone Playwright suite and `verify:full` were not run. No merge or production-readiness claim is based on this pass.

The accompanying local gallery includes accepted captures and the failed enlarged-text state. Native UI, populated tables, screen readers, every route/state and live provider journeys remain outside rendered coverage. No production account, database, DNS, payment or provider configuration is changed by this design pass.

## Next refinement sequence

1. Correct the Studio 320px / 200% text layout, then verify all controls and navigation remain reachable by keyboard and touch. Preserve user text scaling and test nested containers in both appearances.
2. Refresh the Features journey assertions and preserve concise copy as an explicit product expectation.
3. Consolidate Dialog behind one implementation with compatibility exports.
4. Move remaining primitive rules out of broad refinement layers into their component owners, removing only overrides proved redundant by rendered comparisons.
5. Expand fixture coverage to populated tables, long customer data, errors, empty states, keyboard traversal, reduced motion and both appearances. Review native surfaces separately.

This is a system and representative-surface audit, not a claim that every route, data condition, assistive technology or live integration has been exhaustively verified.

## Launch-readiness follow-up

The follow-up on `codex/launch-readiness` lets Studio context and settings headers wrap, caps cumulative mobile gutters, adapts tone choices to available width, and allows dock labels to wrap. Legacy mobile padding rules now respect the shell's existing full-bleed attribute; a high-specificity `main:has(#studio-workroom-message)` rule previously overrode that layout. Knowledge labels and action labels can reflow. The Features journey now checks the six current capability bullets. A new Studio journey exercises nested containment, draft preservation and focus restoration at 320px with a 32px root font.

Fresh browser inspection closes the specific P1 containment finding: at 320px and 32px root text, the settings panel is 320px wide and its structural containers, buttons, links and dock labels have no horizontal overflow in either appearance. Normal-text 320px and 390px layouts also pass containment. A 1280px desktop inspection preserves the split workspace. Changing tone and greeting, switching Review/Setup, and closing settings retained the draft and restored focus to the settings trigger. These are synthetic local fixtures with provider mutations disabled, not live account proof.

Once the local runner was responsive, all 231 tests in 29 focused files passed, including the previously failing contracts and three refund behavioral suites. Earlier worker-stalled and partial runs remain invalid release evidence. The complete release gate is still required before promotion.

The same follow-up repairs source contracts that still asserted retired copy or removed billing helpers. Refund pagination, clamping, retry propagation and historical allowance accounting remain required; their behavioral suites and the full release gate must pass before promotion. The transaction-pool contract now recognizes a helper that explicitly receives the active transaction while continuing to flag missing or mismatched executor arguments.

## Regroup visual verification

A fresh browser pass also exercised the workroom and Bot creation at 320px with
a 32px root font. It found two additional issues beyond the settings panel:
workroom controls exceeded their header width and its composer could fall behind
the navigation dock; compounded dialog padding squeezed the creation heading and
fields. The workroom now wraps its controls and scrolls when its content cannot fit.
Bot creation has one padding layer, bounded grid tracks, and stacked mobile actions.
Desktop structure is preserved. The enlarged-text checks verify nested widths,
retained drafts, focus return and an unobstructed Send control without sending.

All 14 design-flow browser tests passed with these fixes. Current before/after
captures are in the local launch-readiness artifact package under
`2026-09-24/regroup-visual`. They use synthetic accounts and disabled provider
mutations. Earlier screenshots remain historical evidence, not proof of these fixes.

## Bot identity focus pass

Saved Bot marks now appear in roster/comparison lists and explicitly opened
appearance pickers. Single-Bot navigation, the Studio selector, creation summary,
conversation replies, empty states and private voice preview use names without
repeating the identity symbol. Collapsed navigation retains an accessible current-Bot
link with a small generic arrow. Appearance moves below tone, greeting and knowledge
in Setup. Selection, uniqueness, persistence and provider behavior are unchanged.

Fresh before/after captures are in the local design-system artifact package under
`2026-09-24/bot-mark-focus`. The active Activity leaderboard retains three distinct
marks; the legacy Overview roster is retained in source but its route redirects to
Studio, so it is not counted as a tested customer journey. Desktop dark/light,
390px normal text, and 320px with a 32px root font were inspected. Nested workroom,
inspector, textarea and appearance-picker widths stay contained.

Manual fixture checks preserved conversation drafts across Bot switches, setup
drafts across Review/Setup, and name/brief/identity selections after a rejected
creation request. A rejected setup save remained actionable; voice preview opened
without starting a session. All 14 existing design-flow browser tests and all 44
tests in six focused identity, draft, voice-preview, chat and modal suites passed.
The fixtures cannot authenticate a streaming conversation and disable API writes;
they do not prove successful AI responses, production saves or live voice calls.

The earlier full gate for `7fa53d23ed70` passed 649 unit files / 4,557 tests,
static/type/lint/security, coverage, build and server smoke, then failed its browser
server startup timeout. It is failed release evidence, not an in-progress or passing
gate. Source promotion still requires current verification and review.
