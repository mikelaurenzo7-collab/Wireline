# CLAUDE.md — Wireline 12-rule execution contract

These rules apply to every task in this repository unless explicitly overridden.
Bias: caution over speed on non-trivial work.

## Rule 1 — Think Before Coding
State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused and name what is unclear.

## Rule 2 — Simplicity First
Write the minimum code that solves the asked problem.
No speculative features and no abstractions for single-use logic.
If a senior engineer would call it overcomplicated, simplify.

## Rule 3 — Surgical Changes
Touch only what you must.
Do not improve adjacent code, comments, or formatting unless required.
Do not refactor unrelated code. Match existing local style.

## Rule 4 — Goal-Driven Execution
Define clear success criteria before implementation.
Iterate until criteria are verified with fresh evidence.
Do not claim completion without verification output.

## Rule 5 — Use the model only for judgment calls
Use the model for classification, drafting, summarization, and extraction from unstructured text.
Do not use the model for retries, routing, status-code handling, or deterministic transforms.
If code can answer deterministically, code answers.

## Rule 6 — Token budgets are not advisory
Per-task budget: 4,000 tokens.
Per-session budget: 30,000 tokens.
If budget is approaching limits, summarize and start a fresh thread.
Surface budget breaches explicitly; never silently overrun.

## Rule 7 — Surface conflicts, do not average them
When existing patterns conflict, pick one pattern (prefer newer or more-tested path).
State the choice and rationale.
Do not blend contradictory patterns into hybrid code.

## Rule 8 — Read before you write
Before adding code in a file, read:
- that file’s exports,
- immediate callers,
- shared utilities used by the area.
If existing structure is unclear, ask before adding code.

## Rule 9 — Tests verify intent, not only behavior
Tests should capture why behavior matters.
Prefer tests that fail when business logic regresses, not just when syntax changes.
Passing shallow tests is not success.

## Rule 10 — Checkpoint after every significant step
For multi-step work, report:
- what changed,
- what is verified,
- what remains.
If state cannot be explained clearly, stop and restate.

## Rule 11 — Match codebase conventions over novelty
Conformance beats personal preference inside this repository.
If a convention seems harmful, surface it explicitly; do not fork style silently.

## Rule 12 — Fail loud
Do not report success if anything was skipped, partial, or uncertain.
If verification is incomplete, state the exact gap.
Default to visible uncertainty over silent failure.

---

## Wireline-specific project rules

1. **Preserve dual-provider architecture**
   - Anthropic Claude is primary and Gemini remains required fallback/legacy voice path.
   - Do not remove either provider or related dependencies.

2. **Claude integration boundary**
   - Claude-powered server logic must go through `src/lib/claude-brain.ts`.
   - Do not call `@anthropic-ai/sdk` directly from UI components.

3. **Primary integration points**
   - API route changes belong in `server.ts`.
   - Frontend components belong in `src/components/`.
   - Schema updates go in `supabase_schema.sql` and must remain idempotent.

4. **Load-bearing files**
   - Never delete load-bearing files listed in `AGENTS.md` without explicit operator approval.

5. **Service-role safety**
   - Service-role database writes must stamp `user_id` explicitly where required by RLS/data isolation.

6. **Verification gate before completion**
   - Run and pass both commands after changes:
     - `npx tsc --noEmit`
     - `npm run build`
   - No “done” claim without fresh successful output from both.

