# Wireline Incident Response Runbook

**Owner:** Mike Laurenzo (founder)
**Last reviewed:** July 2026

---

## 1. Severity Classification

| Level  | Criteria                                              | Examples                                                                   |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| **P0** | All live calls or the core platform down              | Vapi/OpenAI/Twilio chain outage, DB unreachable, DNS failure               |
| **P1** | Voice agents degraded or subset of customers affected | Latency >2s, one provider down (fallback active), webhook delivery stalled |
| **P2** | Non-critical features broken                          | Dashboard slow, billing portal error, email delivery delayed               |
| **P3** | Minor issues                                          | UI cosmetic bug, documentation error, single-user edge case                |

## 2. Detection

### Automated Monitoring

| Check                            | Frequency | Alert Channel                  |
| -------------------------------- | --------- | ------------------------------ |
| `GET /api/health`                | 1 min     | Uptime monitor → SMS + email   |
| `GET /api/health/models`         | 5 min     | Vercel cron → Slack            |
| Synthetic call to showcase lines | 15 min    | Scheduled job → SMS on failure |
| Stripe webhook delivery lag      | 5 min     | Job queue sweep → log alert    |
| Error rate spike (Sentry)        | Real-time | Sentry → email + Slack         |

### Manual Indicators

- Customer reports via support channel
- Sudden drop in call volume (dashboard or daily brief anomaly)
- Vapi, Twilio, xAI, OpenAI, Gemini, Supabase, or Vercel reports degradation

## 3. Response Procedure

### P0 — Critical (all voice agents down)

```
1. ACKNOWLEDGE (within 5 min)
   □ Update status page: "Investigating voice service disruption"
   □ Start incident timer

2. DIAGNOSE (within 15 min)
   □ Check /api/health/models — which provider is down?
   □ Check Vapi status: https://status.vapi.ai
   □ Check Twilio status: https://status.twilio.com
   □ Check xAI status: https://status.x.ai
   □ Check OpenAI status: https://status.openai.com
   □ Check Google Cloud status: https://status.cloud.google.com
   □ Check Supabase status: https://status.supabase.com
   □ Check Vercel status: https://www.vercel-status.com
   □ Check Sentry for error spike patterns

3. MITIGATE
   □ If OpenAI structured runtime is down → verify Gemini/Gateway fallback
   □ If OpenAI PSTN model is down → verify Vapi moved calls to Gemini
   □ If Vapi is down → pause new calls and verify limited Twilio fallback behavior
   □ If Twilio is down → pause number/SMS provisioning; assess Vapi-owned inventory
   □ If DB down → Supabase incident, wait for recovery
   □ If our code → identify commit, revert if clear cause

4. COMMUNICATE
   □ Status page update every 15 min during active incident
   □ Email affected customers if duration > 30 min

5. RESOLVE
   □ Confirm voice agents processing calls normally
   □ Update status page: "Resolved"
   □ Begin post-incident review
```

### P1 — Major (degraded service)

```
1. ACKNOWLEDGE (within 15 min)
   □ Update status page: "Degraded performance"

2. DIAGNOSE (within 30 min)
   □ Check /api/health/internal for tiering status
   □ Review Sentry errors for patterns
   □ Check rate-limit counters for unusual spikes
   □ Review job queue for stuck jobs (/api/jobs/sweep)

3. MITIGATE
   □ Scale if load-related (Vercel auto-scales, but check)
   □ Clear stuck jobs if queue is backed up
   □ Disable non-critical features if they're causing load

4. RESOLVE (within 4 hours)
   □ Confirm metrics back to normal
   □ Update status page
```

### P2/P3 — Minor

```
1. Log issue in project tracker
2. Prioritize in next work session
3. No status page update unless customer-facing
```

## 4. Post-Incident Review

Required for all P0 and P1 incidents within 72 hours:

### Template

```markdown
## Incident Report: [Title]

**Date:** YYYY-MM-DD
**Duration:** X hours Y minutes
**Severity:** P0/P1
**Impact:** [number of customers affected, calls dropped]

### Timeline

- HH:MM — First detection signal
- HH:MM — Investigation started
- HH:MM — Root cause identified
- HH:MM — Mitigation applied
- HH:MM — Service restored

### Root Cause

[What actually broke and why]

### What Went Well

- [Detection was fast because...]
- [Fallback worked because...]

### What Went Poorly

- [Detection was slow because...]
- [Took too long to identify because...]

### Action Items

- [ ] [Preventive measure 1] — owner, due date
- [ ] [Preventive measure 2] — owner, due date
- [ ] [Monitoring improvement] — owner, due date
```

## 5. Escalation Path

```
Level 1: Automated monitors detect → alert fires
Level 2: Mike Laurenzo (founder) — all hours for P0/P1
Level 3: Upstream provider support (Vapi, Twilio, xAI/OpenAI/Google, Supabase)
```

## 6. Key Contacts

| Service    | Support Channel     | Account            |
| ---------- | ------------------- | ------------------ |
| Vapi       | support@vapi.ai     | Wireline workspace |
| xAI        | support (console)   | Wireline team      |
| OpenAI     | support (console)   | Wireline project   |
| Google AI  | support (console)   | Wireline project   |
| ElevenLabs | support (console)   | Wireline account   |
| Supabase   | support (dashboard) | Wireline project   |
| Vercel     | support (dashboard) | Wireline team      |
| Twilio     | support (console)   | Wireline account   |
| Stripe     | support (dashboard) | Wireline account   |

## 7. Preventive Measures

- **Dependency health:** Integration health panel in AdminSettings
- **Budget guards:** Spend caps prevent runaway costs during incidents
- **Rate limits:** Per-user and system-wide limits prevent cascading load
- **Fallback providers:** structured OpenAI → Gemini → Gateway; Vapi PSTN OpenAI → Gemini. xAI remains opt-in for structured experiments and authenticated realtime tests.
- **Idempotent webhooks:** Stripe event deduplication prevents double-processing
- **Job queue retry:** Failed background jobs retry with exponential backoff

---

_This runbook evolves with every incident. Update it after every P0/P1 review._
