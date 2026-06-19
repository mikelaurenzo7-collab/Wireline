# Retired Stripe/Vercel Pricing Runbook

This runbook is retired. It described a previous business-first package that is no longer the active product strategy.

Current packaging lives in `src/lib/plan-catalog.ts` and is mirrored by `README.md`, `/pricing`, and JSON-LD:

- `personal` → Everyday
- `personal-plus` → Plus
- `business-starter` → Studio
- `starter` → Operator
- `scale` → Custom / talk to sales

Do not use this document to create Stripe prices or Vercel variables. Use the active plan catalog and `npm run docs:check` instead.
