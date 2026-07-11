# Wireline Best Employee Success Playbook

How we win: owners **trust their AI employee** - on the phone, in Studio, and in their CRM.

## North-star metrics

| Metric | Target | Where to measure |
| --- | --- | --- |
| Time to first call | < 10 minutes | Onboarding quickstart on Home |
| Weekly active account holders | > 80% of paid accounts | Product analytics |
| Post-call book rate | Trending up | Insights -> Funnel |
| Escalation rate | Trending down | Triage + Insights -> Failures |
| Voice p95 latency | Stable or down | Insights -> Latency |
| Mobile layout quality | Zero horizontal overflow | `npm run qa:design-screenshots` |

## Activation ladder

1. **Build best employee** - one outcome -> all-purpose employee or specialist preset.
2. **Training** - website scrape or paste pricing and hours.
3. **Number** - included on plan; confirm routing.
4. **Test call** - browser test or dial demo line **(630) 581-1834**.
5. **Integration** - Gmail or Outlook plus CRM when ready.
6. **Go live** - flip agent to active and watch **Live** on Home.

## Agent quality checklist

- First message is short, warm, and scope-clear.
- Personality matches the job.
- Tools are enabled only for connected integrations.
- Post-call follow-up is created when configured.
- QA score is reviewed weekly in Insights -> Quality.

## Voice reliability defaults

- Max **3** parallel tools per Vapi webhook.
- **8s** tool timeout; **1,200** character speakable cap.
- Agent prompt budget around **18k** with trimmed directives and facts.
- Fail-open supervision so one bad tool does not kill the call.

## Sales and demo

- Demo account credentials live only in environment secrets.
- Marketing captures come from `npm run marketing:kit` or `npm run qa:design-showcase`.
- Compare pages stay honest about where Wireline wins.

## Production hygiene

- `main` -> Vercel production; promote via `scripts/promote-vercel-production.mjs` if needed.
- **INTERNAL_JWT_SECRET** (or legacy `SUPABASE_JWT_SECRET`) must be set on Vercel - sign-in returns **503** with `AUTH_NOT_CONFIGURED` when missing.
- `POSTGRES_URL` is required for authenticated routes.

## Next strategic bets

1. Vercel AI Gateway - cost tags and failover for managed reasoning traffic.
2. E2E golden paths in CI.
3. Hosted call recordings in Logs.
4. Zapier and Make distribution.
5. Enterprise SSO plus SCIM.
