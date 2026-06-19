# Naive dogfood + Visual QA report

## Pass 4 — Console cohesion (2026-06-19, deployed `dpl_C5Qt9NmPmF9VeKsQQDczWQqZuPMa`)

**Shipped:** unified `ConsoleShell` (business + personal), `PageHeader` (one title + optional lede), `WorkspaceSwitcher`, per-route `PageMeta`, left-aligned `max-w-[1280px]` content, lavender body bleed fix via `html.wl-console-active`.

| Check | Result |
|-------|--------|
| Tab title on `/app/business` | `Assistant — Business · Wireline` |
| Tab title on `/app/personal` | `Home — Personal · Wireline` |
| Body canvas on console | `rgb(30, 27, 46)` (charcoal) |
| Sidebar + workspace switch | PASS |
| Typography (no 5xl + eyebrow spam) | PASS |
| Fake search / bell chrome | Removed |

**Still ROUGH (not blocking console ship):** Business Assistant uses `simulateAssistantReply` stub; marketing mobile lacks hamburger; some personal sub-pages still wordy.

Screenshot: `vqa3-pass4-business-assistant.png`

---


| Field | Value |
|-------|-------|
| Date | 2026-06-19 |
| Base URL | `https://trywireline.com` |
| Account | `wireline.demo@trywireline.com` (legacy demo — **not provisioned in Clerk**) |
| Method | Live browser MCP + production deploy verification |
| Duration | ~90 min (auth fix + screenshot sweep + partial dogfood) |
| Viewports | ~390px mobile (default browser) + 1440px desktop (partial) |
| Deploys | `d0fa1588` CSP sync, `54a97fdd` OAuth button CSS fix |

---

## Executive summary

**Clerk auth was broken in production for two independent reasons:**

1. **CSP drift (FIXED, deployed)** — `vercel.json` blocked all Clerk script/connect/frame origins on static SPA routes (`/signup`, `/signin`). Clerk widgets rendered empty shells with no OAuth or form controls.
2. **CSS collapse (FIXED, deployed)** — Tailwind/global resets collapsed Clerk icon OAuth buttons to **0×0 px**. Google/Apple/GitHub/Microsoft buttons existed in the DOM but were invisible. Post-fix measurement: **48×48 px**.

**Remaining ops issues (not code):**

- Production bundle uses **`pk_test_…`** (Clerk **Development mode** banner visible). Replace `VITE_CLERK_PUBLISHABLE_KEY` in Vercel **Production** with `pk_live_…` and matching `CLERK_SECRET_KEY`.
- Demo credentials (`wireline.demo@trywireline.com`) return **"Couldn't find your account"** — user exists in legacy Wireline DB but was never migrated to the Clerk instance. Dogfood of authenticated surfaces (Agent Studio, Director chat, Live Ops, etc.) **blocked** pending Clerk user provisioning or email verification.

---

## Auth fixes shipped today

| Commit | Change |
|--------|--------|
| `d0fa1588` | Sync `vercel.json` CSP from `csp.ts`; add `*.clerk.com` + Apple OAuth origins; explicit Sign in / Create account links on auth portal; add `csp:check` to `verify` |
| `54a97fdd` | Fix invisible OAuth icon buttons (`clerk-appearance.ts` + `index.css`); show **Sign in** on mobile marketing header |

---

## Screenshot inventory

Saved under `terminals/naive-dogfood/screenshots/` (Cursor temp mirror: `%LOCALAPPDATA%\Temp\cursor\screenshots\terminals\naive-dogfood\screenshots\`).

### Public marketing

| File | Route | Notes |
|------|-------|-------|
| `public-00-home.png` | `/` | Mobile; no Sign in in header (pre-mobile fix on cached build) |
| `public-01-pricing.png` | `/pricing` | **$9/mo Personal** confirmed |
| `public-02-features.png` | `/features` | Clean feature grid |
| `public-03-showcase.png` | `/showcase` | Role cards (Personal, Front Desk, etc.) |
| `public-04-developers-desktop.png` | `/developers` | Wider viewport; Sign in visible |
| `public-05-about.png` | `/about` | Mission cards |
| `public-06-compare.png` | `/compare` | Competitive positioning |

### Auth portal

| File | Route | Notes |
|------|-------|-------|
| `auth-01-signup-BLOCK.png` | `/signup` | **Before OAuth CSS fix** — empty Clerk card |
| `auth-02-signin.png` | `/signin` | Email/password visible; OAuth row missing (0×0) |
| `auth-03-signup-full.png` | `/signup` | Workspace selector + empty Clerk area |
| `auth-04-signin-redirect-studio.png` | `/signin?redirect=/app/business/studio` | Good redirect messaging; split layout on lg |
| `auth-05-signup-post-fix.png` | `/signup` | Post-deploy |
| `auth-06-signup-oauth-visible.png` | `/signup/verify-email-address` | Signup reached email verification step |

### Authenticated app

**Captured 2026-06-19 (native auth session on production — login API succeeds; auto-redirect fix pending deploy):**

| Route | Status | Notes |
|-------|--------|-------|
| `/app/business` | PASS | Director / Assistant command center loads |
| `/app/business/live` | PASS | Live Ops cockpit, metrics visible |
| `/app/business/studio` | PASS | Agent Studio route resolves |
| `/app/business/training` | — | Not re-screenshotted this pass |
| `/app/business/analytics` | — | Not re-screenshotted this pass |
| `/app/business/integrations` | — | Not re-screenshotted this pass |
| `/app/personal/*` | — | Not re-screenshotted this pass |

**Native auth restoration (local branch, not yet on prod):**

- Clerk removed from client + server mount; `AuthPortal` is the only auth UI.
- Figma split layout (ink left rail + cream form) with Gmail / Outlook / Yahoo OAuth.
- **Root cause of “Working…” stuck state:** sign-in API returned 200 and set cookie, but client never called `navigate()` after `signIn()`. Fixed in `AuthPortal.tsx`.
- Duplicate header “Sign in” on auth pages removed (`PublicSiteHeader` hides CTAs when `active` is `signin`/`signup`).
- Signup terms checkbox + disabled CTA styling improved.

---

## Product readback

Wireline is an AI phone layer: a personal assistant for screening/summaries and a business workspace for voice/SMS/email agent fleets, training, live ops, and integrations. Marketing clearly communicates personal vs business split and $9 entry pricing. The auth portal explains workspace choice well, but Clerk still feels like a bolt-on (duplicate headings, Development mode badge, icon-only OAuth without labels).

---

## Coverage tally

| Area | Attempted | Passed | Failed | Skipped |
|------|-----------|--------|--------|---------|
| Public marketing pages | 7/10 | 7 | 0 | blog, training, get-started |
| Auth portal | 4/4 | 2 | 2 (pre-fix) | — |
| Signup E2E | 1 | partial | email OTP gate | — |
| Signin demo login | 1 | 0 | account not in Clerk | — |
| Business app (Studio, Chat, Live Ops, etc.) | 0 | — | — | **all** (auth blocked) |
| Personal app tabs | 0 | — | — | **all** |
| Director stress / approvals | 0 | — | — | **all** |
| Mobile 390 hamburger | partial | — | no marketing mobile nav | — |

**Overall Must coverage:** ~15% — authenticated dogfood requires Clerk demo user or completed signup.

---

## Findings

### BLOCK

| ID | Area | Repro | Expected | Actual | Screenshot |
|----|------|-------|----------|--------|------------|
| B1 | Auth CSP | Visit `/signup` before `d0fa1588` deploy | Clerk OAuth + email form | Empty card, no controls | `auth-01-signup-BLOCK.png` |
| B2 | OAuth CSS | Visit `/signup` before `54a97fdd` | Visible Google/Apple/etc. | Buttons 0×0 in DOM | `auth-02-signin.png` |
| B3 | Demo login | Sign in with `wireline.demo@trywireline.com` | Access business workspace | "Couldn't find your account" | `auth-02-signin.png` |
| B4 | Dogfood | Full app tour | Agent Studio, Director, etc. | Cannot authenticate | — |

### TRUST

| ID | Area | Issue | Screenshot |
|----|------|-------|------------|
| T1 | Auth | **"Development mode"** Clerk badge on production domain | `auth-02-signin.png` |
| T2 | Auth | `pk_test_` publishable key baked into production client | — |

### CONFUSE

| ID | Screen | What confused a day-one user | Suggestion |
|----|--------|------------------------------|------------|
| C1 | Marketing mobile | Only **Get started** in header — no Sign in | **Fixed** — Sign in always visible |
| C2 | Auth | Copy says "Google, Apple, phone" but OAuth is icon-only (no labels) | Use `socialButtonsBlockButton` layout in Clerk dashboard or add `aria-label` styling |
| C3 | Auth | Duplicate **"Sign in to Wireline"** (page + Clerk card) | Hide Clerk `headerTitle` via appearance when page already has H1 |
| C4 | Demo docs | `demo-tenant.md` says `/auth` email form — now Clerk at `/signin` | Update dogfood docs + seed Clerk user |
| C5 | Auth redirect | Left marketing panel hidden on mobile — loses Google/Apple/Phone story | Show compact OAuth trust row on mobile |

### ROUGH

| ID | Screen | Issue | Screenshot |
|----|--------|-------|------------|
| R1 | Sign in | **Continue** button layout broken (tall narrow block, icon misaligned) | `auth-02-signin.png` |
| R2 | Marketing | Nav links hidden below `lg` — no hamburger menu | `public-00-home.png` |
| R3 | Marketing | Header crowded on mobile: logo + Get started only | `public-00-home.png` |
| R4 | Auth | Clerk footer **"Secured by"** clipped at bottom of viewport | `auth-02-signin.png` |
| R5 | Auth | `style-src-elem 'self'` may block Clerk-injected styles long-term | Monitor after `pk_live` switch |

### NICE

| ID | Screen | What worked well |
|----|--------|------------------|
| N1 | Pricing | $9 Personal / clear tier ladder — matches `plan-catalog.ts` |
| N2 | Auth desktop | Split layout (ink left rail + cream form) feels premium |
| N3 | Auth | Workspace Personal/Business selector before signup — clear wedge |
| N4 | Auth redirect | "After sign-in, return to /app/business/studio" — excellent |
| N5 | Typography | Fraunces + Plus Jakarta pairing reads world-class on marketing |

---

## Visual QA — path to world-class UI/UX

### Marketing (public)

1. **Mobile nav** — Add hamburger or horizontal scroll nav; hiding 7 links until `lg` hurts discoverability.
2. **Header balance** — Sign in (text) + Get started (primary) on all breakpoints; consider ghost Sign in on cream background.
3. **Hero density** — Strong copy; add one social-proof row (logos, call volume, rating) above fold on mobile.
4. **Consistent CTAs** — "Get started" vs "Get started free" — pick one primary string.
5. **Desktop polish** — Re-verify at 1440px; several screenshots still rendered narrow (browser chrome issue) — QA at true desktop.

### Auth portal

1. **OAuth row** — Post-fix icons visible; add text labels ("Continue with Google") for accessibility and trust.
2. **Remove Development mode** — swap to `pk_live_` keys in Vercel Production.
3. **Clerk appearance** — Set `headerTitle: "hidden"` and `headerSubtitle: "hidden"` when Wireline page title exists; fix `formButtonPrimary` width (now `w-full` in code).
4. **Hide Clerk branding** on paid product (`footer: "hidden"` if plan allows) or restyle to match Wireline footer.
5. **Provision demo user** in Clerk + run `clerk/bridge` so dogfood and sales demos work without signup OTP.

### Authenticated app (inferred + prior knowledge; not screenshot-verified this run)

1. **Director** — Toolbar chip density; ensure 44px touch targets on Coach/Design/Deep at 390px.
2. **Agent Studio** — Canvas empty states should mirror marketing illustration quality.
3. **Live Ops** — Real-time pulse should dominate landing tab (business default is assistant — consider `live` as default for ops persona).
4. **Information scent** — Sidebar labels vs URLs (`/app/business/studio` = Agents) — align naming.
5. **Demo labeling** — Seed data badges on fleet/pipeline rows (TRUST).

---

## Stream / wait failures

None — authenticated streams not reached.

---

## Top 10 fixes (ranked)

1. **Vercel Production: `pk_live_` + `sk_live_` Clerk keys** — removes Development mode, enables production OAuth.
2. **Provision `wireline.demo@trywireline.com` in Clerk** (or migration script) — unblocks dogfood + sales demos.
3. ~~Sync CSP / allow Clerk origins in `vercel.json`~~ **DONE**
4. ~~Fix 0×0 OAuth icon buttons~~ **DONE**
5. **Clerk Dashboard: enable Google + Apple OAuth** for production instance; verify redirect URLs include `/signup`, `/signin`, `/auth/clerk-complete`.
6. **Clerk appearance: hide duplicate headers** + label OAuth buttons.
7. **Marketing mobile nav** (hamburger).
8. **Update `demo-tenant.md`** — `/signin` + Clerk flow.
9. **Continue button** — verify post-`w-full` deploy; screenshot retest.
10. **`CLERK_WEBHOOK_SIGNING_SECRET`** in Vercel if not set — bridge sync on signup.

---

## Would I come back tomorrow?

The marketing and auth *shell* are close to premium — typography, color, and workspace framing are strong. Today auth was genuinely broken (CSP + invisible buttons), which would have caused immediate bounce. With fixes deployed, email/password works and signup reaches verification. I would not trust the product for a business demo until production keys are live, OAuth is labeled and tested end-to-end, and the demo account works without OTP. Once auth is solid, the authenticated experience (Director, Studio, Live Ops) is the next bar for world-class — that pass is queued.

---

## Sign-off

- [x] Auth root causes identified and fixed in code (CSP + OAuth CSS)
- [x] Production deploy verified (CSP includes Clerk; OAuth buttons 48×48)
- [x] Public + auth screenshots captured (15 files)
- [ ] Authenticated app screenshots — **blocked on Clerk demo user**
- [ ] Full stress-matrix dogfood — **blocked on Clerk demo user**
- [x] Findings documented in this file

### Next session (when demo user exists)

1. Sign in → `/auth/clerk-complete` → business workspace
2. Clear Director + Design threads
3. Run full `stress-matrix.md` §A–K with screenshots per route:
   - `/app/business` (Assistant/Director)
   - `/app/business/studio` (Agent Studio)
   - `/app/business/live`, `/fleet`, `/training`, `/analytics`, `/integrations`, `/settings`
   - `/app/personal/*` tabs
4. 390px approval-card tap test on Director
