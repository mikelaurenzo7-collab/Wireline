# Drizzle schema parity repair checklist

This file is intentionally non-executable evidence for the follow-up tracked in the repository issue created by the 2026-08-04 E2E audit.

Required repair:

- Add `settings.accountEnvironment` mapped to `account_environment`, default `production`, NOT NULL.
- Align `spendBudgets.monthlyLimitUsd` to default `0.50` and NOT NULL.
- Align `spendBudgets.hardCap` to default `true` and NOT NULL.
- Mark `warnThresholdPct`, `enabled`, and `updatedAt` NOT NULL.
- Update the schema-version comment through migration `0131`.
- Run `npm run db:generate` and accept the repair only when generated SQL contains no destructive production change.

Do not import this file or treat it as a runtime contract. It exists solely to make the known repair searchable until the full schema file is edited safely.
