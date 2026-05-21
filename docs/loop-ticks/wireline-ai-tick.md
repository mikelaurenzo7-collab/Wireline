# Wireline agent loop tick (performance + AI + gateway + visual design)

When this file is referenced by the monitored shell loop, run a **single triage pass** and return **short, actionable** bullets (max ~15 lines total).

## 1) Performance (performance-optimizer lens)

- Hot paths: `src/routes/vapi-routes.ts` (assistant-request, tool-calls), `src/lib/vapi-assistant-factory.ts`, `src/lib/claude-brain.ts` (voice supervisor).
- Call out **tail latency**, **parallel tool fan-out**, **duplicate queries**, **bundle weight** on public routes.
- Top **3** fixes with file paths.

## 2) AI architecture (ai-architect lens)

- Tool gating: `src/lib/vapi-helpers.ts`, `src/lib/tenant-integration-connections.ts`, `src/lib/agent-capabilities.ts`.
- Supervision / fail-open: `superviseClientCommunication` in `src/lib/claude-brain.ts`.
- Top **3** architecture or safety follow-ups.

## 3) Vercel AI Gateway (when touching LLM calls)

- Prefer **`provider/model`** slugs; optional `gateway()` + `providerOptions.gateway` with **`tags`** (e.g. `feature:vapi`, `env:production`) and **`user`** / tenant id where applicable.
- Note any **direct** `@anthropic-ai/sdk` / `@google/generative-ai` usage that should migrate for observability and failover.
- One paragraph max.

## 4) Visual design (UI/UX lens)

- **Auth & onboarding:** `src/components/AuthPortal.tsx`, `src/components/auth/AuthDemoDirectory.tsx` — hierarchy, whitespace, legibility at `lg` + mobile, motion restraint (`motion/react`), perceived “breathing room.”
- **Integrations / CRM:** `src/components/CrmConnectionCard.tsx` and related admin surfaces — density, alignment, empty/loading/error states, focus rings, touch targets (min ~44px where tappable).
- **Brand:** Wireline purple `#4F1E7B`, parchment/paper backgrounds, consistency with existing Tailwind tokens; avoid new one-off hex unless justified.
- **Accessibility:** contrast (WCAG AA where feasible), heading order, form labels, keyboard paths for OAuth + email flow.
- Top **3** visual tweaks with component/file paths; if change is large, split into “quick win” vs “follow-up.”

## 5) Production sanity (optional)

- If `vercel`/dashboard not available, skip; else note latest deploy health for `main`.

Emit your answer in chat (or the PR) as structured bullets under headings **Perf / AI / Gateway / Visual / Prod**.
