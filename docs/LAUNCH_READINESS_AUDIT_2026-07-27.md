# Launch Readiness Audit — 2026-07-27 (round 7)

Status: **Active** — vigilant double-pass deep audit with verified code fixes, Vercel env boundary edits, and usable launch creatives.

Baseline: `main` at `003ab671` (AI voice-agent positioning already landed). Prior rounds 1–6 remediations (RLS/GDPR, TCPA honesty, token atomicity, enrichment isolation, Stripe allowance retry) confirmed present on `main`.

## Executive result

Wireline remains a **strong controlled-beta / founder-led launch candidate**. Live `GET /api/health/launch-readiness` scored **100** with `compliance_ready` **degraded** solely on Federal DNCScrub credentials. This pass shipped five verified product/code fixes, tightened preview deployment boundaries, flipped production demo-mode tagging off, and produced branded static ad creatives plus HeyGen video sessions.

**Do not declare unconditional GA** until Federal DNC is vendor-valid, `SENTRY_DSN` is restored on production (see ops incident below), Twilio prepaid working capital is topped up, and one production-like voice+SMS+email smoke completes.

## Verified bugs fixed this pass

1. **Public copy drift after AI Voice Agents repositioning** — `Compare.tsx`, `PrivacyPolicyPage.tsx`, `PublicChangelog.tsx`, and verification email still said “AI employee” / “One trained employee” on broad public surfaces. Rewrote to AI voice agent language; `product-voice-contract` now pins those files.
2. **`/api/onboarding/progress` always reported `has_voice: false`** — keyed off unused per-tenant `vapi_private_key` (0/128 live rows). Now derives voice readiness from provisioned `wireline_phone_numbers` and upserts derived steps into `wireline_onboarding_progress` (previously a dead table with no writers).
3. **OAuth state TTL (20m) vs bridge cookie (10m) mismatch** — aligned signed state to 10 minutes so the mid-window “Sign-in session expired” dead zone is gone.
4. **`oauthRateLimiter` fail-open without Upstash** — now uses the same distributed-limiter refusal + production fail-closed options as signin/signup.
5. **GDPR purge orphaned carrier numbers** — failed Vapi/Twilio releases are written to `wireline_orphan_carrier_resources` (migration `0116`, applied live) before `purgeAccount` deletes ownership rows.

## Verified polish

- Preview deployment boundary blocklist now includes `TWILIO_WEBHOOK_BASE_URL`, `FEDERAL_DNC_API_URL`, and `WIRELINE_LAUNCH_DEMO_MODE`.
- Contract pack: `tests/round7-launch-finetune-contract.test.ts`.

## Vercel env actions taken

| Action | Result |
| --- | --- |
| Remove `WIRELINE_LAUNCH_DEMO_MODE` from Preview | Done (was shared with Production) |
| Set Production `WIRELINE_LAUNCH_DEMO_MODE=false` | Done — product events no longer auto-tagged demo |
| Remove Preview `FEDERAL_DNC_API_URL` / `FEDERAL_DNC_PROVIDER` | Done — production DNC URL retained |
| Remove Preview `SENTRY_DSN` | **Incident:** the shared Production+Preview entry was deleted entirely. Production `SENTRY_DSN` must be re-added from the Sentry project DSN. Server degrades to log-only (`startup.ts` warns). |

## Ops still open (not code-blockable)

| Item | Notes |
| --- | --- |
| Restore Production `SENTRY_DSN` | Paste the existing Sentry project DSN into Vercel Production only (do not re-share onto Preview unless intentional). |
| Federal DNCScrub `loginId` | `FEDERAL_DNC_API_KEY` still missing on Production; marketing outbound stays fail-closed. |
| `VITE_SENTRY_DSN` | Browser DSN still unset (build-time). |
| Twilio prepaid balance | Last measured ~$23 vs $150 launch cushion. |
| Rotate the pasted `vcp_` Vercel token | User pasted a personal token into chat — revoke after this session. |
| Mainframe video | Plugin requires Mainframe web onboarding before generate. |

## Creative / campaign deliverables

Static assets (usable for Meta/LinkedIn/X upload; not committed to git per `CODEBASE_HEALTH.md`):

- `/opt/cursor/artifacts/wireline-launch-campaign-2026-07-27/social/wireline-social-ai-voice-agents.png` (1:1)
- `/opt/cursor/artifacts/wireline-launch-campaign-2026-07-27/social/wireline-social-missed-call.png` (1:1)
- `/opt/cursor/artifacts/wireline-launch-campaign-2026-07-27/ads/wireline-ad-build-free-live-19.png` (16:9)
- `/opt/cursor/artifacts/wireline-launch-campaign-2026-07-27/stories/wireline-story-voice-agent.png` (9:16)

HeyGen sessions (open in HeyGen to download when complete):

- Landscape: https://app.heygen.com/video-agent/99c98ddc91b84633a6005c8081e870e0 (first attempt failed; retry queued separately if present)
- Portrait social: https://app.heygen.com/video-agent/0bfcca47221b4484a51fff39d9c7ad8b

Copy spine remains: **Build free. Go live from $19/mo.** / **Build your AI Voice Agent** — see `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md`.

## Final assessment

Code and product truth are tighter: public language matches the voice-agent doctrine, activation progress is honest, OAuth/rate-limit edges are closed, and carrier-purge orphans are durable. Remaining launch risk is **ops configuration** (Sentry restore, DNC vendor key, Twilio balance) plus funded `verify:full` / production-like channel smoke — not known unpatched source defects from this pass.
