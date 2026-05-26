# Wireline operator success playbook

How we win: operators **trust the fleet** — on the phone, in the console, and in their CRM.

## North-star metrics

| Metric | Target | Where to measure |
|--------|--------|------------------|
| Time to first call | &lt; 10 minutes | Onboarding quickstart on Home |
| Weekly active operators | &gt; 80% of paid seats | Product analytics |
| Post-call book rate | Trending up | Insights → Funnel |
| Escalation rate | Trending down | Triage + Insights → Failures |
| Voice p95 latency | Stable or down | Insights → **Latency** |
| Mobile layout quality | Zero horizontal overflow | `npm run qa:design-screenshots` |

## Activation ladder (every new tenant)

1. **Agent** — one sentence → Persona wizard or Fleet.
2. **Knowledge** — website scrape or paste pricing/hours.
3. **Number** — included on plan; confirm routing in Fleet.
4. **Test call** — browser test or dial demo line **(630) 581-1834**.
5. **Integration** — Gmail/Outlook + CRM (HubSpot/Salesforce) when ready.
6. **Go live** — flip agent to active; watch **Live** on Home.

## Agent quality checklist

- First message is short, warm, and scope-clear (see `contact-agents.ts` templates).
- Personality matches vertical (warm / playful / authoritative).
- Tools enabled only for connected integrations (`tenant-integration-connections`).
- Post-call: triage task created, CRM note when configured.
- QA score reviewed weekly in Insights → Quality.

## Voice reliability (engineering defaults)

- Max **3** parallel tools per Vapi webhook.
- **8s** tool timeout; **1,200** char speakable cap.
- Assistant prompt budget ~**18k** with trimmed directives/knowledge.
- Fail-open supervisor so one bad tool does not kill the call.

## Sales / demo (internal only)

- Demo account credentials: stored in environment secrets (never in source control).
- Marketing captures: `npm run marketing:kit` (local mocks) or `npm run qa:design-showcase` (prod).
- Compare page: honest matrix vs Bland / Retell / DIY Vapi.

## Production hygiene

- `main` → Vercel production; promote via `scripts/promote-vercel-production.mjs` if needed.
- **INTERNAL_JWT_SECRET** (or legacy `SUPABASE_JWT_SECRET`) must be set on Vercel — sign-in returns **503** with `AUTH_NOT_CONFIGURED` when missing (not opaque 500).
- `POSTGRES_URL` required for all authenticated routes.

## Next strategic bets

1. Vercel AI Gateway — cost tags + failover for Claude traffic.
2. E2E golden paths in CI (`npm run e2e:golden`).
3. Hosted call recordings in Logs (seed or Vapi storage URLs).
4. Zapier / Make distribution.
5. Enterprise SSO (Entra) + SCIM.
