# Industry-Leader Audit — 2026-07-22

Status: **Active** — verified deep audit off current `main`, with code wins
shipped for security, Twilio/Vapi resilience, integration honesty, spend
controls, and catalog/marketing truth.

## Scope

Fresh pass across vendor wiring (Twilio, Vapi, OpenAI/Gemini/Gateway, Stripe,
Resend, Upstash, OAuth/CRM), product honesty (catalog, personas, changelog,
onboarding), and operator surfaces (compliance, mailbox, team invites). Ops-only
items (Federal DNCScrub `loginId`, Twilio balance, GitHub Actions phantom
workflow, Vercel author invite) were confirmed out of code scope.

## Verified wins shipped

### Security / integrations
1. **Microsoft token refresh** no longer persists `encryptSecret(undefined)` on
   failed refresh; terminal `invalid_grant` clears tokens so reconnect is
   detectable.
2. **Google Sheets** marks `active: false` on terminal refresh failure (HubSpot-
   style) instead of serving a stale token forever.
3. **Integration health** now surfaces `reconnect_hubspot`,
   `reconnect_salesforce`, `reconnect_google_sheets`, and
   `reconnect_microsoft_mailbox` — banner attention is no longer calendar-only.
4. **Spend rate limiters** (`dial`, `sms`, `campaigns-write`, `phone-numbers`)
   fail closed when Upstash is unavailable, matching Claude/intake posture.

### Twilio + Vapi
5. **Number provisioning** attaches `voiceFallbackUrl` /
   `voiceFallbackMethod` so carrier-side Vapi failures hit the existing
   degraded-mode handler.
6. **Failover voicemail** persists `RecordingUrl` (+ transcript) into
   `wireline_call_logs` and best-effort emails the owner via Resend — no longer
   log-only.

### Product honesty (industry-trust)
7. **Plan catalog** sells branded call/weekly recap links only — drops unshipped
   proposal/presentation/report artifact claims.
8. **Casey/Mira sales personas** quote Free Builder → Starter → Scale (custom
   SSO), not Personal/Team/Enterprise + live SSO/SCIM.
9. **Public changelog** aligns to OpenAI → Gemini → Gateway; retired mobile IA
   labels removed.
10. **Marketing kit** CTA is Free Builder, not “Start free trial”.
11. **Onboarding / Compare / Trust / Compliance** copy matches product matrix
    (Phone approvals today; supervisor listen roadmap; learning loop roadmap;
    Federal DNC next-step link).
12. **WhatsApp** removed from Twilio platform capability chips; stays private
    beta in detail copy.
13. **Yahoo** removed from mailbox connect UI until XOAUTH2 IMAP fetch/send
    ship (catalog already `planned`).
14. **Commerce stubs** (`shopify_apply_discount`, `square_send_invoice`) removed
    from role default tool sets; catalog descriptions are honest no-promises.
15. **Team invites** prefer Resend, return `email_sent`, fall back to connected
    mailbox — no silent “success” when mail never left.
16. **Goals CTA** routes to Insights goals view (not Knowledge).

## Vendor posture (unchanged keep decisions)

| Plane | Keep | Why |
| --- | --- | --- |
| Structured AI | OpenAI → Gemini → Gateway | Already fail-over ready |
| PSTN | Twilio + Vapi | Carrier + orchestration fit |
| Live test voice | OpenAI Realtime (Studio/ChatGPT/guest) | Correctly separated from PSTN |
| Email | Resend (+ mailbox OAuth) | Transactional + tenant send |
| Video | LiveAvatar/HeyGen gated | Add-on, not core calls |
| Billing / DB / host | Stripe Cadence, Supabase, Vercel | Confirmed |

## Ops still open (not code)

- Real Federal DNCScrub `loginId` on all Vercel targets before marketing scale
- Twilio prepaid top-up before volume
- Invite `laurenzomike` to Vercel team `revaluate` (or keep promoting Cursor builds)
- GitHub Actions phantom `BuildFailed` workflow (Settings/support)

## Verification

```bash
npx vitest run tests/industry-leader-audit-contract.test.ts
npm run design:check
npm run docs:check
```

Locked by `tests/industry-leader-audit-contract.test.ts` plus extended
`scripts/clear-system/billing-integrity.mjs` exclusions.
