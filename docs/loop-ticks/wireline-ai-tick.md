# Wireline overnight loop — wake-up “cheat code”

The monitored shell prints `AGENT_LOOP_TICK_wireline_ai` + JSON with this file as `prompt`. **On each tick**, run one pass and reply under the headings below (keep tight: **≤20 bullets total** unless the user asked for depth).

**Goal:** So when Mike opens Cursor in the morning, he’s **launch-ready**: prod looks right, risks are flagged, and the next 1–3 commits are obvious.

---

## Morning launch (do first — ≤5 bullets)

- **Prod URL:** `https://trywireline.com` — auth hero, sign-in, OAuth buttons, collapsible demo directory (mobile + desktop width).
- **Vercel:** latest `main` deployment is **production** (not preview-only); note `dpl_` + inspector link if anything’s off.
- **CDN:** if HTML looks stale after a promote, mention cache / hard refresh / `Age` header — don’t assume code didn’t ship.
- **Voice smoke (optional):** mention only if something changed in Vapi routes / assistant factory since last tick.
- **One sentence “ship narrative”** — what changed for customers since last tick (honest, no invented metrics).

---

## 1) Performance (performance-optimizer lens)

- Hot paths: `src/routes/vapi-routes.ts` (assistant-request, `tool-calls`), `src/lib/vapi-assistant-factory.ts`, `src/lib/claude-brain.ts` (voice supervisor).
- Watch: parallel tool **tail latency**, DB/API **saturation**, **duplicate queries** on assistant-request, **bundle / TTI** on `AuthPortal` + `motion/react` + `lucide-react`.
- **Top 3** fixes with file paths (quick wins first).

---

## 2) AI architecture (ai-architect lens)

- Tooling: `src/lib/vapi-helpers.ts` (`buildRoleToolDefsForTenant`), `src/lib/tenant-integration-connections.ts`, `src/lib/agent-capabilities.ts` (plan unlocks).
- Safety: `superviseClientCommunication` fail-open, idempotency on mutating tools, Vapi retries.
- **Top 3** architecture or safety follow-ups with paths.

---

## 3) Vercel AI Gateway (ai-gateway lens)

- Repo today: **`@anthropic-ai/sdk`** / **`@google/generative-ai`** in `src/lib/claude-brain.ts` (and related) — note gap vs Gateway-routed **`provider/model`** strings on AI SDK v6.
- When migrating or adding calls: prefer tags like `feature:vapi`, `env:production`, plus **`user`** (tenant/user id) for attribution and rate limits; optional `order` / `models` failover per https://vercel.com/docs/ai-gateway and https://ai-sdk.dev/docs/foundations/providers-and-models — **do not guess model slugs**; cite current docs if recommending specific IDs.
- **One short paragraph** — what to do next, not a tutorial.

---

## 4) Design polish (UI/UX lens)

- **Auth / home:** `src/components/AuthPortal.tsx`, `src/components/auth/AuthDemoDirectory.tsx` — spacing, hierarchy, motion restraint, thumb reach on mobile.
- **Integrations:** `src/components/CrmConnectionCard.tsx` — density, states, focus rings, tap targets (~44px).
- **Brand:** `#4F1E7B` + existing tokens; avoid stray one-off hex.
- **Top 3** visual tweaks with paths (quick win vs follow-up).

---

## 5) Production sanity

- Note deploy health / regressions only if observable; otherwise skip.

**Output format:** headings **Launch / Perf / AI / Gateway / Visual / Prod** (omit empty sections).
