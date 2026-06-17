# Demo account contract

**Account:** `wireline.demo@trywireline.com` / `WirelineDemo!2026`

The beast treats this tenant as a **living showroom**. Missing seed data is a
**product bug** when the UI promises demo content.

## Never do

- Delete agents or bulk re-seed unless user explicitly asks
- Send real outbound SMS/calls to non-test numbers
- Spam team invites or Stripe checkout

## Expected demo signals (verify when UI claims them)

| Surface | Expected | If empty |
|---------|----------|----------|
| **My Fleet** `/agents` | Multiple agent cards (demo fleet) | OK if empty state is designed |
| **Live Ops** | Fleet count in pulse (e.g. ~19 agents cited in prior runs) | Note drift vs fleet tab |
| **Pipeline** | Stages + showcase/demo badge on seeded leads | Empty showcase OK with copy |
| **Phone** | Call history rows OR clear empty state | Expand row if present |
| **Email/SMS** | Threads or designed empty | Not clipped under sidebar |
| **Integrations** | Marketplace cards always | Connect flow opens |
| **Director execute** | Jordan Lee estimate callback prompt | ProposalCard path |
| **Coach** | Named agents (e.g. Casey, Ava) in picker | Fail if picker empty |

## Canonical Director copy (from contract)

These strings are **source-of-truth probes** in `wireline-director-design.ts`:

- Execute: *"Call Jordan Lee back about tomorrow's estimate"*
- Coach agents referenced in skill docs: Casey, Ava

If prompts change in code, update beast probes in same PR.

## Demo vs production data

Schema flags `demo=true` on seeded rows. UI should:

- Show **demo** / **showcase** badge where seeded data appears
- Never present demo calls/leads as customer's real revenue without label

Fail as **TRUST** if badges missing when demo rows visible.

## Thread state

Before full Director/Painter run:

1. Clear **Chat** thread via UI
2. Clear **Design** thread via UI
3. Confirm no persistent "Director data could not be loaded" on empty hero

Stuck mid-stream from prior session → Clear thread before judging stream probes.

## Environment

| URL | Use |
|-----|-----|
| `https://trywireline.com` | Default prod dogfood |
| `http://localhost:3000` | Only when user runs local + beast explicitly |

Prod is source of truth for **production-ready** verdict unless user says otherwise.
