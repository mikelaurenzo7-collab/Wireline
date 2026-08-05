# Production Outcome Proof Command

Use the production outcome report to evaluate real customer evidence without mixing in demo or test activity.

```bash
npx tsx scripts/production-outcome-report.ts \
  --from 2026-08-01T00:00:00Z \
  --to 2026-09-01T00:00:00Z
```

The report is read-only, bounded to a maximum 366-day window, and emits no customer PII. It requires both the account and every product event to be classified as `production`, excludes demo calls, and reports:

- production calls and duration;
- outcome-tagged calls and explicit `outcome_reviewed` events;
- managed-provider cost;
- tool-call failures;
- escalation attempts and success;
- pipeline, STT, and TTS failure counts;
- QA coverage and average QA score;
- account/event classification drift.

`proofState` is deliberately strict:

- `unproven_no_production_calls`: no production calls exist in the period;
- `production_calls_without_recorded_outcomes`: production calls exist but no tagged or reviewed outcome was recorded;
- `production_outcomes_observed`: at least one tagged or reviewed production outcome exists.

An outcome tag or review is not treated as booked revenue. Revenue attribution requires authoritative system-of-record evidence, such as the selected field-service CRM integration.
