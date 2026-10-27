# BotBound design master plan

Base: `fba3eccd9a13bb35f30bce81793f98c03e9e9bd5` (main after the design-contract repair).

This plan records what is true in that tree, what a local walk still shows, and the changes worth making. Items already fixed on this SHA are listed so they are not rebuilt. Ranks are P0 (wrong or blocking for an owner), P1 (the page fails its job), and P2 (cohesion and polish).

The reader is a salon, plumber, HVAC, or restaurant owner. Copy stays short. Internal names such as directive layer, Runtime Balance, and visual consistency pass do not belong on a page that owner reads.

## What this SHA already fixed

Verified in source, not assumed from the October 26 QA notes (those notes were taken against `0cc8021`).

- `?plan=lite` stores `preferredPlanId: "usage"` and `preferredUsageTier: "lite"`. `?plan=plus` stores Plus. The old silent map of `lite` onto Starter is gone. `src/lib/signup-intent.ts` and `src/lib/signup-intent.test.ts`.
- The home channel tabs open on Calls. `WireAgentLanding` starts `selected` at 0.
- The sales subtitle "Find Prospects. Start Conversations. Close Deals." is gone. The remaining sales pitch is the button "GET YOUR SALES BOT".
- The customer AI Spend view, its token rows, and its model table are deleted. "Tokens Used" remains on the admin audit panel only.
- Bot creation no longer has a 1-Bot plan cap. `resolveAgentEntitlement` reports `unlimited: true` and `effectiveCap: null`. A second Bot does not wait on a 402 for plan capacity.
- `GET /api/team` returns `200 { available: false }` when shared workspaces are not certified. It does not return 503. Invite writes still return 503, which is the closed gate.
- Set Up already has Permission: Full access, Auto, and Ask for approval, saved at `PATCH /api/agents/:id/permission`.
- The verify-email banner is already the compact variant (`max-height: 64px`, one text line, 32px actions). The old 30% stack is not the current markup.
- `/showcase` redirects to plan-neutral `/signup`. `/blog` redirects to `/changelog`.

## Tokens

Source of truth: `design-tokens/wireline.tokens.json`, emitted to CSS custom properties and `src/constants/generated-design-tokens.ts`.

| Token | Current value | Use |
| --- | --- | --- |
| Canvas | `#F7F7F3` light, `#0A0A0E` dark | Page background. Manifest `theme_color` still uses the dark value on a light public site. |
| Action | `--wireline-color-action-primary-default` | One filled button. Lavender `#A78BFA` is not a second primary. |
| Type | sans body, display for the hero, IBM Plex Mono for overlines only | One H1 voice per template. No mixed 400-weight marketing H1. |
| Space | 4px steps. Page rails use the existing `wl-public-rail`. | Do not invent a second spacing scale. |
| Radius | `--wireline-radius-md` on controls, `--wireline-radius-lg` on cards | Auth currently hard-codes `1rem` and `0.8rem`. New work uses the tokens. |
| Elevation | `--wireline-elevation-xs` on buttons, none on flat marketing sections | No new shadows. |
| Motion | 150ms color, no transform on `prefers-reduced-motion` | Cookie and auth already honor that. Do not add decorative motion. |
| Target | 40px minimum, 44px comfortable | Coarse pointers already lift `button` to 44px. A 390px mouse viewport does not, so phone-width layouts still show 36px controls. |

## Page templates

- Public hero: centered, one H1, one sentence, one filled action, one text action. Top offset follows the shared header, not a one-off 200px pad.
- Pricing: three cards. Price, included usage dollars, and included number and email are visible without opening details.
- Auth card: one centered column. The scrollbar must not shove the card off the viewport center.
- App shell: one scrollport. Banners are one line. Page title, then the work.
- Empty: one sentence and one action. Loading: a skeleton with `aria-busy`, not a paragraph. Error: what failed and a retry. No provider names.

## Copy diet

Say the next action. Drop the second sentence when the control already says it.

| Instead of | Say |
| --- | --- |
| GET YOUR SALES BOT | Get Started |
| Usage Included, amount hidden | $4 usage included (and $14, $36) |
| Calls plan, AI allowance, Runtime Balance on `/for/*` | Lite, Starter, or Plus, with extra usage at the listed rates |
| Texts Aren't in Your Plan | Texts are pending carrier approval |
| Team invitations are currently unavailable | Team invites are coming soon |
| For You. For Your Business. (manifest) | BotBound |

Leave legal and billing descriptions of existing prepaid balances in place. Those sentences describe plans already sold. Do not rename the ledger inside Stripe.

## Component cleanup

Only these, because each one is visible or wrong today:

- Pricing card face in `UsagePricingPanel`.
- Cookie consent stack at 390.
- Home and Features primary label.
- `/for/real-estate`, `/for/everyday`, and `/for/insurance` FAQ answers.
- `site.webmanifest` name, theme color, and background.
- Plain `/signup` restoring an old template or tier chip.
- Auth card horizontal center.
- Phone-width minimum height for `button` and `[role="button"]`.
- New Bot rows writing weekday hours, matching the calendar default.
- Phone and browser prompts dropping a saved "$19/month" line.
- Insights using the shell scrollport once.
- SMS and outbound status copy.
- Team settings status copy.

Do not restyle every card radius, rewrite every hero offset, or add a new permission control. Permission already exists.

## Motion

No new illustration loop. The existing tab, banner, and cookie transitions stay. Anything new must be a color or opacity change and must turn off under `prefers-reduced-motion`.

## Per page

### Home

Before: H1 "YOUR VOICE BOT FOR YOUR WORK." The button says "GET YOUR SALES BOT". Tabs open on Calls. After: same H1, a line that the Bot answers calls and books the job, and a "Get Started" button. P1.

### Pricing

Before: Lite and Starter both say a number and an email. The $4 / $14 / $36 amounts sit inside collapsed Plan Details. After: each card face states its included usage. P1.

### Industry FAQs

Before: real estate and insurance still say "Calls plan". Everyday says "AI allowance" and tells the owner to contact us before email. After: the same Lite, Starter, and Plus model as Pricing, and email included on every plan. P1.

### Cookie notice

Before: at 390 the copy and two stacked buttons cover a large slice of the screen. After: one short line and a single row of actions. P1.

### Auth

Before: a previous Front Desk or Plus visit still labels a later plain `/signup`. The card sits off center when the scrollbar is present. `?plan=lite` is already Lite. After: a plain visit shows the default Starter choice only, and the card is centered. P1.

### Create and hours

Before: a new Bot has no saved hours, so Set Up says "Always open", while Calendar offers Monday to Friday, 9 to 5. After: a new Bot is created with that same weekday window. Bots already saved as always-open stay that way. P1. Product logic, called out in the Studio PR.

### Voice price line

Before: knowledge items containing "$19/month" are dropped, but custom instructions, rules, and the first message are not. The retired catalog row is still named Previous at $19 and is not a public plan. After: those prompt fields lose the stale sentence before a live or browser call. P1. Product logic, called out in the Studio PR.

### Insights

Before: the shell, the page, and the view can each scroll from the `md` breakpoint up. The AI spend screen is already gone. After: one scrollport. P2.

### SMS, outbound, team

Before: a missing SMS channel says it is not in the plan. Outbound has no carrier status. Team says invitations are unavailable, while the read API is already a calm 200. After: SMS and outbound say carrier approval is pending. Team says invites are coming soon. P1 for the copy, not a new carrier integration.

### Manifest

Before: installed name "For You. For Your Business." and theme `#0A0A0E` against a light canvas whose meta theme is `#F7F7F3`. After: name BotBound and the light theme color. P2.

## Explicitly not in this pass

- Stripe price ids, checkout, webhooks, and the prepaid balance ledger.
- Enabling shared workspaces. Certification stays closed.
- Rebuilding Overview, Blog, or Showcase.
- A new permission model.
- A 1-Bot gate. The cap is already gone.
- Production deploys. These changes ship as review PRs only.
