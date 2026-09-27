# BotBound Incident Response Runbook

**Owner:** BotBound platform owner
**Last reviewed:** September 1, 2026

This is an operator runbook. Response-time language below is prioritization guidance, not a customer SLA unless a signed customer agreement explicitly incorporates it.

## 1. Severity

| Level  | Criteria                                                                                               | Examples                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **P0** | Core live-call platform broadly unavailable, active data-integrity risk, or critical security incident | Voice call chain unavailable across tenants, database unavailable, payment/webhook corruption, confirmed cross-tenant exposure |
| **P1** | Material degradation or meaningful subset of customers affected                                        | One provider degraded with fallback active, sustained webhook/job failures, severe latency, provisioning outage                |
| **P2** | Important but bounded feature failure                                                                  | Dashboard workflow broken, email delay, billing-portal problem, one integration unavailable                                    |
| **P3** | Low-impact defect                                                                                      | Cosmetic issue, documentation error, isolated edge case                                                                        |

## 2. Detection surfaces that actually exist

### Scheduled production work

The Render scheduler configuration in `render.yaml` defines:

- `/api/jobs/sweep` every **minute** for durable background work.
- `/api/daily-brief/schedule` every **15 minutes** for due daily-brief dispatch.

The former public demo-line canary is retired. Do not reintroduce a paid synthetic call without an explicit cost, ownership, and alert-response review.

Do not describe a monitoring cadence as live until it is present in production configuration and verified.

### Request-driven / operator health

- `GET /api/health` — application/database health.
- `GET /api/health/public` — cached, distributed runtime posture used by backstage release and incident checks.
- Authenticated `GET /api/insights/voice-reliability?days=1` — tenant-scoped recent voice reliability.
- Authenticated/operator health routes expose deeper provider, SLO, queue, and integration diagnostics.
- The incident-response target on the operator SLO surface requires both a protected monitor credential and an owner contact. A configured target is not evidence that an external monitor is polling it or that an alert destination has been tested.
- Render API, voice-worker, and scheduler logs are deployment evidence. Confirm the affected service and source revision; legacy Vercel logs apply only to an explicitly verified rollback deployment.
- Structured error reporting is forwarded to Sentry **only when the production Sentry DSN is configured**; do not assume an email/Slack routing rule exists without verifying that rule in the active Sentry account.

### Human / external signals

- Customer reports through product/support channels.
- Material changes in call volume, queue health, delivery failures, or spend/economics alerts.
- Official provider status pages and support consoles.

## 3. Response procedure

### P0 — critical

1. **Confirm the blast radius.** Check runtime health, voice status, deployment state, runtime errors/logs, database health, and provider status.
2. **Protect integrity before availability.** If billing, tenant isolation, webhook authenticity, or data correctness is uncertain, fail closed on the risky mutation path.
3. **Identify the failing layer.** Separate BotBound deployment/configuration from database, Twilio carrier/PSTN/SIP transport, OpenAI Realtime call control, the structured-model provider chain, email, payments, and rate-limit/cache dependencies.
4. **Mitigate using an already-tested path.** Prefer a configured structured-model fallback, bounded degraded mode, feature pause, or rollback over an improvised production change. Voice failures remain on the observable OpenAI Realtime path and do not switch providers.
5. **Verify recovery.** Re-run the exact health surface that detected the issue and verify representative end-to-end behavior before declaring resolution.
6. **Communicate material customer impact.** Use BotBound product messaging and the appropriate support channel; do not publish an unverified root cause.

### P1 — major degradation

1. Confirm affected tenants/features and whether a fallback is active.
2. Review provider diagnostics, queue/webhook health, database/runtime errors, and recent deployment changes.
3. Bound impact: pause the failing optional path, reduce concurrency, or use the tested fallback when appropriate.
4. Verify normal operation with both telemetry and a representative user flow.

### P2/P3

1. Capture the defect with reproducible evidence.
2. Fix in the normal reviewed deployment path.
3. Escalate severity if customer impact, security, billing, or data-integrity evidence expands.

## 4. Provider triage

Use the relevant official provider status/support surface for the component actually in the call or transaction path. Current production dependencies include managed hosting, Postgres, Twilio carrier/PSTN/SIP transport, OpenAI Realtime voice and call control, the configured structured-model provider chain, Stripe, email delivery, and Upstash Redis. Voice incidents must not be routed to xAI, Vapi, or ElevenLabs: those providers are retired from the production voice runtime, and BotBound does not silently fail an active call over to another voice provider.

Never infer an upstream outage solely from one failed health request. Re-probe after the public-health cache TTL and compare against provider status plus BotBound runtime logs.

## 5. Rollback standard

Rollback is appropriate when all of the following are true:

- a recent BotBound deployment is strongly correlated with the incident;
- the prior production deployment is known good and schema-compatible;
- rolling back will not reverse a required data migration or recreate a known security/billing defect; and
- provider-side degradation is not the actual root cause.

After rollback, verify application health, voice status, critical authenticated reads, billing/webhook processing, and the affected user flow.

## 6. Post-incident review

Run a written review for P0 and material P1 incidents. Complete it after facts are stable; do not trade accuracy for an arbitrary publication deadline.

```markdown
## Incident: [title]

Date:
Severity:
Customer impact:
Detection signal:

### Timeline

- HH:MM — first verified signal
- HH:MM — investigation started
- HH:MM — cause isolated
- HH:MM — mitigation applied
- HH:MM — recovery verified

### Root cause

[Evidence-backed cause]

### What limited impact

- [fallback / guard / fast detection]

### What failed or was missing

- [technical / process / monitoring gap]

### Corrective actions

- [ ] [action] — owner / priority
- [ ] [regression test or monitor]
- [ ] [runbook/documentation change]
```

## 7. Security or data-integrity incident

If cross-tenant access, credential exposure, webhook forgery, payment corruption, or unauthorized data disclosure is suspected:

- preserve relevant logs and identifiers;
- stop the unsafe mutation or data path before restoring convenience;
- rotate affected credentials when exposure is credible;
- do not include secrets or unnecessary personal data in incident chat/tickets;
- assess notification obligations with qualified counsel based on the actual facts and jurisdictions; and
- restore service only after the boundary is demonstrably closed.

## 8. Launch truths to keep current

- Public status is evidence, not an uptime guarantee.
- Public demo voice and its demo-line canary are retired; authenticated reliability evidence is the supported voice-health path.
- Vercel cron is the source of truth for Vercel-scheduled jobs.
- Sentry alert destinations must be verified in Sentry; code presence alone does not prove a Slack/SMS/email rule.
- Provider fallback claims must match the active runtime policy and vendor configuration.
- Any contractual response time, recovery objective, support channel, or service credit belongs in the signed customer agreement, not this internal runbook.

Update this runbook whenever production monitoring, provider topology, or incident tooling changes materially.
