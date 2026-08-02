# Launch Perfection Pass — 2026-07-19

Status: **Historical snapshot, superseded** — this audit records the 2026-07-19 state. For current launch truth, run `npm run launch:status`, which probes live production and writes the untracked `docs/LAUNCH_STATUS.generated.json`.

## What was verified against live vendors (production credentials, read-only)

| Vendor | Result |
| --- | --- |
| OpenAI Responses (`gpt-5.6-terra`) | 200 — primary structured runtime works |
| OpenAI Realtime model ids | `gpt-realtime-2.1`, `gpt-realtime-2`, `gpt-realtime` all valid; prod env pins `gpt-realtime-2` while code defaults to `gpt-realtime-2.1` |
| Gemini (`gemini-3.5-flash`) | 200 — first fallback works |
| Vercel AI Gateway | 200 — 302 language models visible |
| xAI Responses + TTS | 200 both — Grok structured opt-in path and Wireline Live voice previews work (TTS returned real audio) |
| ElevenLabs | `creator` (paid) tier, cloning enabled — the July 14 preview 402s were the pre-upgrade free tier |
| Resend | `trywireline.com` **verified** (us-east-1) |
| Twilio | Account active, type Full |
| Vapi | Reachable; 18 phone numbers on the account |
| Stripe | Livemode, charges enabled; every catalog price id resolves active with amounts matching `plan-catalog.ts` ($9/$19/$59/$149 + $15 extra agent + $19 live video, monthly + annual); webhook endpoint `https://trywireline.com/api/stripe-webhook` enabled (11 events) |
| Upstash Redis | PONG |
| LiveAvatar | 200 |
| Production `/api/health` | `{"ok":true}` |

## Open vendor/ops items (not code)

1. **Resolved/superseded:** the -$207.00 balance belonged to the retired Stripe project. The active launch account reported $0 available on 2026-07-21.
2. **GitHub Actions CI is dead repo-wide.** Every push to `main` since 2026-06-27 produces only a `startup_failure` run attributed to a corrupt phantom workflow registration (workflow id `296195680`, path literally `BuildFailed`, state `deleted`, created 2026-06-15). Real gates have not run at all: `ci.yml` last ran 2026-06-27 (failure), `verify-full.yml` and `product-contracts.yml` have **zero runs ever**. `build-diagnostics.yml` and `drive-origin-main-export.yml` are registered as active but have no backing files on `main`. Verification currently rests entirely on local `npm run verify:full`. Fix at the GitHub account level: check repo Settings → Actions policy, org Actions billing/spending limit, and rulesets/required workflows referencing `BuildFailed`; GitHub support can purge the corrupt registration.
3. **`STRIPE_ENTERPRISE_PRICE_ID` in Vercel points at a nonexistent price** (Stripe 404). No code reads it — delete the env var. Same for the other legacy inactive-price vars no code reads: `STRIPE_PRO_*` (4), `STRIPE_BUSINESS_STARTER_*` (4).
4. **Unused Vercel env cruft** safe to delete after review: `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY` (runtime purge is contract-enforced), `FIGMA_*`, `CANVA_*`, `GITHUB_DESIGN_*`, `MIGRATION_TOKEN`, `SLACK_APP_TOKEN`/`SLACK_SIGNING_SECRET`/`SLACK_VERIFICATION_TOKEN`/`SLACK_REFRESH_TOKEN`, `META_CLIENT_*`/`META_BUSINESS_ID`/`META_GRAPH_API_BASE`/`META_OAUTH_*`, `X_BEARER_TOKEN`, `YAHOO_APP_ID`, `SQUARE_PRODUCTION_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY`, `TWILIO_VERIFY_SERVICE_SID`, `ZOOM_WEBHOOK_SECRET_TOKEN`, `OPENAI_EXTRACTION_MODEL`, `OPENAI_OPTIMIZER_MODEL`.
5. **`OPENAI_REALTIME_MODEL=gpt-realtime-2` and `OPENAI_REALTIME_TRANSCRIBER=gpt-realtime-whisper` in Vercel override newer code defaults** (`gpt-realtime-2.1`, `gpt-4o-mini-transcribe`). Both pinned values mirror the stale `.env.example` rather than a deliberate rollback (the example is now fixed). Decide: remove the pins to adopt code defaults, or keep the pins intentionally.
6. **`HEALTH_MONITOR_TOKEN` is not set in Vercel** — launch-readiness monitors authenticate via the `CRON_SECRET` fallback. Set a dedicated token so cron signing and monitor access can rotate independently.
7. **`WIRELINE_LAUNCH_DEMO_MODE=true` in production** — correct until the first real customer is admitted; flip to `false` at that moment so launch telemetry stops being marked demo.
8. **Twilio scoped REST key (`TWILIO_API_KEY`/`TWILIO_API_SECRET`) is not configured in Vercel**, so the credential hardening in `twilio-service-base.ts` silently falls back to the master auth token. Create a Standard API key in Twilio Console and set both vars.
9. Federal DNC vars are present in production as sensitive-type env (not pullable locally, so value validity was not re-verified from this pass; the launch-readiness endpoint remains the authority).

## Code and docs defects fixed in this pass

- **Runtime narrative unified to code truth** (OpenAI Responses primary → Gemini → AI Gateway; xAI structured strictly opt-in; OpenAI Realtime powers Studio/ChatGPT/guest live-voice demos). The guest MCP demo referenced in the original 2026-07-19 audit was fully retired on 2026-07-21.
- **`/api/ai/status` reported `primary_provider: "xai"` while serving GPT-5.6 Terra**, and `RecipeModal` disabled all recipe forms unless the provider equaled `"xai"` — a coupling landmine. The route now reports `openai`, the client gates only on availability, and `managed-ai-recipe-health-contract` enforces the decoupling.
- **Signup/verification emails promised a "14-day trial" that no longer exists** (`email-service.ts` signup-link + verification templates, Vapi `create_account` fallback line, `EmailVerifyBanner`). All now speak the Free Builder truth: build/train/simulate free, pick a live plan for a customer number.
- **Tenant webhook deliveries were silently unsigned** for any webhook created through the current API: creation stores the secret vault-encrypted (`secretEncrypted`) and nulls the legacy `secret` column, but delivery signed only from the legacy column. Delivery now decrypts the vault secret (legacy plaintext still honored) and fails closed with `secret_decrypt_failed` instead of sending an unsigned request.
- **Meta Pixel checkout conversion values were stale** (`StripeBillingCard` hardcoded `team: 29` — actual $19 — and omitted starter/business): now derived from the live plan catalog.
- **Dead DNC-less `sendTenantMessage` removed from `twilio-service-base.ts`** — it was shadowed by the DNC-gated canonical implementation in `twilio-service.ts` but importable directly, a latent suppression-bypass footgun; a pointer comment now marks the canonical path.
- **Dead legal pages deleted** (`LegalPage.tsx` `PrivacyPolicy`/`DataDeletion`/`ZoomDocs`, 515 lines): the unmounted PrivacyPolicy still claimed "xAI (Grok) — Primary AI model inference," contradicting the live `/privacy` page; the runtime-policy contract and `check-runtime-policy.mjs` now guard the live `PrivacyPolicyPage.tsx` instead ( `/legal/data-deletion` is served by the static `public/legal/data-deletion.html`; `/terms` still renders `LegalPage.TermsOfService`).
- **Vendor-name leak removed from the pre-auth shell**: `index.html` dns-prefetch hints for `api.openai.com` / `api.vapi.ai` deleted.
- **Voice-preview failures are now diagnosable**: the Wireline Live TTS call logs upstream status + body snippet on rejection (the July 18 production failures were opaque 503s).
- **Security-header parity**: `server.ts` now emits the same Permissions-Policy directive set and 2-year HSTS max-age as `vercel.json`.
- **`.env.example` rewritten to operational truth**: OpenAI primary (required in prod) instead of "optional fallback"; dead Anthropic/design-export/`MIGRATION_TOKEN`/ghost vendor sub-vars removed (22 vars with zero code references); realtime defaults corrected; `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK`, managed-chain overrides, `HEALTH_MONITOR_TOKEN`, launch controls, Twilio scoped key + webhook base URL, `WIRELINE_AUTO_PROVISION_NUMBERS`, and `VAPI_WEBHOOK_CREDENTIAL_ID` documented. `TWILIO_API_KEY`/`TWILIO_API_SECRET` added to the env-validator registry.
- **Pricing docs drift at the time of this audit**: the then-shipped runtime presets differed from the fixed catalog. This was superseded on 2026-07-21 when runtime, catalog, and docs were standardized on $5/$10/$25/$50.
- **Misleading auto-provisioning copy fixed** (`vapi-client.ts` customer error, `vapi-phone-numbers.ts` header): agent creation never silently provisions numbers.
- **`site.webmanifest`** now lists the generated 192px PNG icon alongside the SVG.

## Known inconsistencies intentionally left for a product decision

- Operating-loop step-1 verb differs across surfaces (docs "Create", homepage "Brief", features page "Build") and both public variants are pinned by `product-voice-contract` — unify deliberately, not mechanically.
- "AI Voice Employee" appears 21× on buying surfaces but is not a `product-copy.ts` term.
- `product-copy.ts` labels iOS "Planned/Join waitlist" while `CLIENT_SURFACES.md` calls it Beta (TestFlight pending) — currently understated on purpose.
- `IntegrationLogos` default "powered by" strip is exported but unmounted (contract-guarded); mount or remove deliberately.
- Conversation Balance fixed prices and runtime presets now match at $5/$10/$25/$50 (resolved 2026-07-21).
