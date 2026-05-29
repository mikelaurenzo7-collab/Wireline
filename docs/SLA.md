# Wireline Service Level Agreement (SLA)

**Effective:** May 2026
**Applies to:** Pro, Business, and Enterprise plans

---

## 1. Platform Availability

Wireline commits to the following monthly uptime targets:

| Plan | Uptime Target | Monthly Downtime Budget |
|------|---------------|------------------------|
| Pro | 99.5% | ~2h 11m |
| Business | 99.9% | ~43m |
| Enterprise | 99.95% | ~22m |

**"Uptime"** means the Wireline voice agent platform successfully processes
inbound and outbound calls. Measured as `(total_minutes − downtime_minutes) / total_minutes × 100`.

## 2. Exclusions

The following do not count toward downtime:

- Scheduled maintenance (announced 48h+ in advance via status page)
- Upstream provider outages (Vapi, ElevenLabs, Twilio, Anthropic) beyond
  Wireline's control — though we maintain fallback providers where possible
- Force majeure events
- Customer-side configuration errors
- Features explicitly marked as "beta"

## 3. Response Time Targets

| Severity | Definition | First Response | Resolution Target |
|----------|-----------|----------------|-------------------|
| **P0 — Critical** | Voice agents completely unavailable for all customers | 15 min | 1 hour |
| **P1 — Major** | Voice agents degraded (>2s latency, partial failures) | 30 min | 4 hours |
| **P2 — Minor** | Non-voice features impacted (dashboard, billing portal) | 2 hours | 24 hours |
| **P3 — Low** | Cosmetic issues, documentation, feature requests | 24 hours | Best effort |

## 4. Service Credits

If we miss the uptime target in a calendar month:

| Uptime Achieved | Credit (% of monthly bill) |
|-----------------|---------------------------|
| 99.0% – 99.5% | 10% |
| 95.0% – 99.0% | 25% |
| < 95.0% | 50% |

Credits are applied to the next billing cycle. Maximum credit per month: 50%
of that month's charges. Credits must be requested within 30 days.

## 5. Monitoring

- **Public status page:** [trywireline.com/status](/status)
- **Health endpoint:** `GET /api/health` (public, no auth required)
- **Internal probes:** `GET /api/health/internal`, `GET /api/health/models`
- **Synthetic monitoring:** Automated call probes run every 15 minutes against
  showcase agents to detect voice-path degradation before customers do

## 6. Communication During Incidents

- **Status page** updated within 5 minutes of confirmed incident
- **Email notification** to affected account owners for P0/P1
- **Post-incident report** published within 72 hours for any P0/P1 event

## 7. Support Channels

| Channel | Availability | Plans |
|---------|-------------|-------|
| In-app chat | 24/7 (AI first, human escalation) | All |
| Email (support@trywireline.com) | Business hours ET | All |
| Phone escalation to founder | 24/7 for P0 | Business, Enterprise |
| Dedicated Slack channel | Business hours ET | Enterprise |

## 8. Data Durability

- Database: Supabase Postgres with point-in-time recovery (30 days)
- Backups: Daily automated, tested monthly
- Retention: Configurable per tenant (default 365 days, minimum 90 days)
- Deletion: Account deletion cascades all data within 30 days

---

*This SLA is a commitment to operational excellence. It will be updated as
our infrastructure matures and as we achieve SOC 2 Type II certification.*
