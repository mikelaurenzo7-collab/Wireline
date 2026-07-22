# Full-stack audit + visual QA — 2026-07-22

Status: **Active** — deep launch audit off current `main`, with billing
preset alignment, auth/pricing polish, and multi-viewport visual QA.

## Overall grade: B+ / launch-ready with ops gates

Wireline is architecturally mature: Create → Train → Wire → Run, prepaid
billing, tenant RLS, Twilio+Vapi PSTN, OpenAI→Gemini→Gateway reasoning, and
gated LiveAvatar video. Remaining risk is mostly ops proof and product-breadth
discipline, not missing core architecture.

## Facet grades

| Facet | Grade | Verdict |
| --- | --- | --- |
| Marketing | A- | Strong public story; keep connector/video claims honest |
| Database | B+ | Healthy (73 tables); live-schema drift is operational, not structural |
| Runtime | A- | Single server entry + route registry; live call matrix still required |
| Vendors / integrations | B | Correct keep-map; WhatsApp/Yahoo/video remain beta/planned |
| Personal vs business | B+ | Copy + schema distinguish modes; legacy `agent` remains technical |
| Agent runtime / voice / models | B+ | Broad tools, voices, models; unlock-by-default needs connection honesty |
| Security | A- | Custom auth, RLS GUC, CSP, signed webhooks, spend fail-closed |
| Backend health | A- | `verify:full` gates compensate for Actions phantom risk |
| Docs / codebase health | A- | Indexed docs + hygiene contracts |
| UI / UX | A- | Letterpress/Aurora enforced; pricing/auth polish in this pass |
| Onboarding / flows | B+ | Signup → Studio create is clear; personal/business mode retained |
| Future-proofing / moats | B+ | Number + memory + voice loop; freeze launch SKU around the wedge |
| Billing / pricing / costs | A | Prepaid Runtime Balance, catalog checks, no postpaid meter |
| Video agents | C+ | LiveAvatar plumbing real; catalog gate + custom likeness still pilot |

## Wins shipped in this pass

1. **Runtime Balance preset alignment** — code, Stripe founder catalog,
   Conversation Balance card fallback, and `P0_BILLING_OPS_NOTE` now agree on
   **$10 / $25 / $50 / $100** ($10 minimum). Locked in
   `scripts/clear-system/billing-integrity.mjs`.
2. **Signup consent before OAuth** — Terms checkbox appears above social
   buttons; `wl-auth-terms` is mobile-styled.
3. **Auth safe-area padding** on phones.
4. **Pricing first-impression polish** — sentence-case hero, shorter plan
   details, tokenized secondary CTAs, primary-colored Free/Scale icons, wider
   plan rail.
5. **Marketing proof chips** wrap cleanly on phones.
6. **Studio first-run textarea** uses `text-base` on mobile (no iOS zoom) and
   restrained resize.
7. **Schema comment hygiene** — migration marker updated to `0106`; account
   comment uses current AI-employee language.

## Ops still open (not code)

- Copy Federal DNCScrub `loginId` (`FEDERAL_DNC_API_KEY`) onto Vercel
  **Development** (present on Production/Preview as sensitive).
- Prove live DNCScrub JSON scrub before marketing outbound scale.
- Fund Stripe/Twilio buffers before paid volume.
- Keep `WIRELINE_LIVE_VIDEO_CATALOG_READY` unset until Presence Catalog is
  buyer-ready; custom likeness remains pilot.
- GitHub Actions phantom workflow / Vercel author invite remain org ops.

## Visual QA matrix

Capture via `scripts/capture-visual-qa.mjs` against production with viewports
`phone-390`, `tablet-768`, `desktop-1440` for marketing + authenticated routes
listed in that script. Artifacts land under `/opt/cursor/artifacts/visual-qa/`.

Harness hardening in this pass: marketing and authenticated captures use
separate browser contexts, and authenticated routes re-sign-in once if a
session drop redirects to `/signin` (avoids false P0s like a one-off
`/admin?tab=branding` redirect during a long matrix). Live probe confirmed
admin branding loads cleanly when the session is intact.

## Verification

```bash
npx vitest run src/lib/conversation-balance.test.ts tests/marketing-metadata-contract.test.ts
npm run design:check
npm run docs:check
npm run stripe:catalog:check
```
