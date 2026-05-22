# Wireline production demo account

Use this account for **sales screenshots**, **design QA**, and **prospect walkthroughs** on [https://trywireline.com](https://trywireline.com).

| Field | Value |
|-------|--------|
| Email | `composer.demo@trywireline.com` |
| Password | `WirelineDemo2026!Showcase` |
| Display name | Wireline Demo Showcase |
| User ID | `2f85bad8-f9f6-479f-bb39-818d9cb9bf07` |

## What’s seeded

- **Agents:** Avery (front-desk), Riley (sales-development)
- **Call logs:** 20 demo calls (`demo=true`) for Triage, Logs, and Insights

## Capture showcase screenshots (3 viewports)

```bash
set E2E_BASE_URL=https://trywireline.com
set DEMO_EMAIL=composer.demo@trywireline.com
set DEMO_PASSWORD=WirelineDemo2026!Showcase
npm run qa:design-showcase
```

Output: `test-results/design-showcase/{mobile,laptop,desktop}/*.png`

## Owner seed (richer data)

Owners can POST `/api/admin/seed-demo-account` with body `{ "email": "composer.demo@trywireline.com" }` after at least one agent exists. That tops up calls, leads, appointments, knowledge, and DNC rows to marketing targets.

## Rotate credentials

1. Sign in → account menu → sign out  
2. Use forgot-password on `composer.demo@trywireline.com`, or update `password_hash` in `wireline_users` via Supabase SQL  
3. Update this doc and any CI secrets

**Do not** use this account for real customer data or billing cards.
