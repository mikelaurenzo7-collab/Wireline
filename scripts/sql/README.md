# Operator SQL Audits

These files are **read-only diagnostics** for an authorized Wireline operator. Run them against the intended environment with a read-only database role whenever possible.

## Stripe Runtime Allowance reversals

`audit-stripe-runtime-allowance-reversal-gaps.sql` lists recent processed Stripe refund and dispute money-movement events that do not have a ledger row linked by `provider_event_id`.

```bash
psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 \
  --file scripts/sql/audit-stripe-runtime-allowance-reversal-gaps.sql
```

A returned row is a **review candidate**, not proof that a customer needs a debit. Before any correction, verify the Stripe event, charge, invoice, subscription, historical plan, tenant owner, base-plan share, and existing ledger rows keyed by refund/dispute object ID. Never mutate customer balance directly from this report.
