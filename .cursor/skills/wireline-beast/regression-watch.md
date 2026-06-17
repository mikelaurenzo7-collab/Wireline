# Regression watch — verify after deploy

Re-run these **first** in Regression mode before a full beast sweep.

## Layout (DF-001)

**Repro:** Sign in → 1440 desktop → sidebar click **Email**

**Pass when:**

- Page title "Email" fully visible (not "mail" / "threads yet" clipped)
- CDP: `--wireline-rail-w` is `216px` when rail shows labels, `main` padding-left matches
- Hover-peek expanded rail does not clip content

**Files:** `Sidebar.tsx` (`effective` → `--wireline-rail-w`), `AppShell.tsx`

## Director stream (DF-002)

**Repro:** `/chat` → send `Audit my fleet — what should I fix first?`

**Pass when:**

- Pipeline shows **Connecting** → **Loading fleet context** → **Reasoning** → reply
- Completes within ~3 min OR clear error + non-streaming fallback within ~60s
- Composer re-enables after terminal state

**Fail:** Eternal "Connecting to Director" with no progress >4 min

**Files:** `useStreamingChat.ts`, `DirectorWorkspace.tsx`, `director-routes.ts`

## Thread hydration (DF-003)

**Repro:** Fresh session → `/chat` and `/design` empty state

**Pass when:** No banner "Some Director data could not be loaded…"

**If banner persists:** check prod DB migration `0047_director_message_thread_key.sql`

**Files:** `director-store.ts`, `director-routes.ts`

## Painter render

**Repro:** `/design` → debt-relief landing prompt → wait ≤3 min

**Pass:** Preview panel shows device frame + HTML; spinner clears

## Mobile shell

**Repro:** 390px → Ops, Chat, Design

**Pass:** Hamburger nav, no horizontal scroll on thread, Chat/Preview tabs on Design
