# Wireline — Copilot Agent Instructions

> These instructions are active in every Copilot chat session in this repo.
> They embed three skills from [obra/superpowers](https://github.com/obra/superpowers):
> **verification-before-completion**, **systematic-debugging**, and **writing-plans**.
> All three override default agent behavior where they conflict.

---

## 1 · Verification Before Completion

**Core principle: Evidence before claims, always.**

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

### The Gate (run before ANY success/done claim)

1. **IDENTIFY** — What command proves this claim?
2. **RUN** — Execute the full command fresh right now.
3. **READ** — Full output. Check exit code. Count failures.
4. **VERIFY** — Does output confirm the claim?
5. **ONLY THEN** — Make the claim, quoting the evidence.

For Wireline, the standard verification commands are:

```bash
npx tsc --noEmit   # must be clean (zero errors)
npm run build      # must succeed (vite + esbuild server)
```

### Red Flags — STOP

- Writing "should work", "probably", "seems to"
- Expressing satisfaction before running verification ("Great!", "Done!", "Perfect!")
- About to commit / suggest a PR without having run tsc + build this message
- Trusting a previous terminal run if code changed since then

### Rationalization Traps

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Linter passed" | Linter ≠ compiler |
| "Just this once" | No exceptions |

---

## 2 · Systematic Debugging

**Core principle: Find root cause BEFORE attempting fixes. Symptom fixes are failure.**

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

### The Four Phases

**Phase 1 — Root Cause Investigation (MUST complete before Phase 2)**
1. Read the full error message and stack trace — don't skim.
2. Reproduce consistently — exact steps, every time.
3. Check recent changes — `git diff`, new deps, config changes.
4. In multi-component systems (Wireline: Vite frontend → Express server → Supabase → Vapi → Claude Brain), add diagnostic log points at each boundary BEFORE guessing a fix. Run once to find WHERE it breaks, then investigate that layer.
5. Trace data flow backwards from the bad value to its origin.

**Phase 2 — Pattern Analysis**
- Find a working analogue in the same codebase.
- Compare working vs. broken line-by-line.
- List every difference, however small.

**Phase 3 — Hypothesis and Testing**
- State: *"I think X is the root cause because Y."*
- Make the SMALLEST possible change to test it.
- One variable at a time. Did it work? → Phase 4. Didn't work? → NEW hypothesis.
- Never stack multiple fixes simultaneously.

**Phase 4 — Implementation**
- Write a failing test first (if a test framework is in scope).
- Implement the single fix for the confirmed root cause.
- Verify: tests pass, no regressions, issue actually resolved.
- If ≥ 3 fixes have failed: **STOP** — question the architecture and discuss before continuing.

### Red Flags — STOP

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- Adding multiple changes at once and running tests
- On the 3rd+ failed fix without reconsidering the approach

---

## 3 · Writing Plans (for multi-step features)

**Use before touching any code when a request involves multiple files or steps.**

**Announce at start:** *"I'm using the writing-plans skill to create the implementation plan."*

### Principles
- **TDD** — failing test before implementation, always.
- **YAGNI** — build only what the spec requires.
- **DRY** — no duplication across tasks.
- **Frequent commits** — at minimum after each task.

### Plan Structure

Every plan starts with:
```
# [Feature Name] Implementation Plan

**Goal:** [one sentence]
**Architecture:** [2–3 sentences on approach]
**Tech Stack:** [key libs]
---
```

Then numbered tasks. Each task:
```
### Task N: [Component Name]
**Files:**
- Create: exact/path/file.ts
- Modify: exact/path/other.ts

- [ ] Step 1: Write the failing test
      [actual test code here]
- [ ] Step 2: Run test — confirm it FAILS
      Command: npx tsc --noEmit && npm run test (or equivalent)
- [ ] Step 3: Write minimal implementation
      [actual code here]
- [ ] Step 4: Run test — confirm it PASSES
- [ ] Step 5: Commit
      git commit -m "feat: …"
```

### Forbidden Content in Plans
- "TBD", "TODO", "implement later"
- "Add appropriate error handling" without showing the code
- "Similar to Task N" — repeat the code; tasks may be read out of order
- Steps that describe what to do without showing how (code blocks required)

### Wireline-Specific Conventions
- Server endpoints go in `server.ts` (Express). Check `AGENTS.md` before adding near load-bearing files.
- Frontend components go in `src/components/`. Lazy routes are resolved dynamically — do not remove a component just because grep finds no static reference.
- Claude-powered paths MUST go through `src/lib/claude-brain.ts`. Never call `@anthropic-ai/sdk` directly from a component or endpoint.
- After any plan that touches `server.ts` or `src/lib/claude-brain.ts`, run `npx tsc --noEmit && npm run build` as the final plan step.

---

## Quick Reference

| Situation | Skill to apply |
|-----------|---------------|
| About to say "done" / "fixed" / "working" | § 1 — run tsc + build first |
| Encountered a bug or unexpected behavior | § 2 — four phases, root cause first |
| Feature request spans multiple files | § 3 — write the plan before touching code |
