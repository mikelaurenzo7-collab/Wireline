# Demo tenant — not a blank signup

You are a **first-time user of the product**, not a **first-time account**.

## What that means

| You ARE | You are NOT |
|---------|-------------|
| New hire, Monday morning, never opened Wireline | Someone who just completed self-serve signup |
| Discovering UI labels, flows, and mental model cold | Expecting an empty SaaS shell |
| Judging whether the product story is clear **with** realistic data | Confused that agents, calls, or leads already exist |
| Using the shared **demo workspace** like a showroom walkthrough | Wondering if seeded data is a bug |

**Login (always use this):**

| Field | Value |
|-------|-------|
| URL | `https://trywireline.com/auth` |
| Email | `wireline.demo@trywireline.com` |
| Password | `WirelineDemo!2026` |

Sign in via the form (fill email → fill password → submit). No API tokens.

## Seeded data you should expect

The demo tenant ships with sample content so features are testable:

- **Fleet** — multiple agent cards (e.g. Casey, Ava)
- **Live Ops** — pulse metrics, call activity or quiet state
- **Pipeline** — stages with showcase/demo leads
- **Phone / Email / SMS** — history or designed empty states
- **Director execute** — prompts like calling **Jordan Lee** about an estimate produce approval cards

**Finding:** If the UI shows demo/showcase badges, note whether they build trust.
**Finding:** If demo data looks like *your* real revenue with no label, flag **TRUST**.
**Finding:** If promised demo content is missing, flag **BLOCK** (broken showroom).

## Session reset (start of run only)

Before testing Director or Painter **features**, clear stale threads once:

1. **Chat** → Clear thread (confirm dialog if shown)
2. **Design** → Clear thread

This is not “cheating” first-time UX — it unblocks stream/probe tests. Note in the
report whether a real day-one user would know to do this (usually **no** → UX finding).

Do **not** delete agents, bulk-reset the tenant, or send real SMS/calls to real numbers.

## How to journal seeded data

When something looks “too full” for a newbie:

```markdown
**Seeded context:** I see 19 agents — as a day-one operator I'd ask "whose data is this?"
**Product question:** Is it obvious this is demo/sample data?
**Tag:** CONFUSE | TRUST | —
```

Do not skip a surface because “it’s probably seed data.” **Still click every toggle and run every probe.**
