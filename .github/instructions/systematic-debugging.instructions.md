---
applyTo: "**"
---
# Systematic Debugging

> Source: obra/superpowers · systematic-debugging skill

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

Random fixes waste time and create new bugs. Quick patches mask underlying issues.
If you haven't completed Phase 1, you cannot propose fixes.

---

## Phase 1 — Root Cause Investigation

**BEFORE attempting ANY fix:**

### 1. Read Error Messages Carefully
- Don't skip past errors or warnings — they often contain the exact solution.
- Read stack traces completely. Note line numbers, file paths, error codes.

### 2. Reproduce Consistently
- Can you trigger it reliably? What are the exact steps?
- If not reproducible → gather more data, don't guess.

### 3. Check Recent Changes
- `git diff`, recent commits, new deps, config changes, environmental differences.

### 4. Gather Evidence in Multi-Component Systems

Wireline's layers: **Vite frontend → Express server.ts → Supabase → Vapi → Claude Brain**

BEFORE proposing fixes, add diagnostic instrumentation at EACH boundary:
```ts
// Layer: Express endpoint
console.log("[debug] incoming body:", req.body);
console.log("[debug] env ANTHROPIC_API_KEY set:", !!process.env.ANTHROPIC_API_KEY);

// Layer: Claude Brain
console.log("[debug] claudeBrain.isClaudeAvailable():", claudeBrain.isClaudeAvailable());

// Layer: Supabase
const { data, error } = await supabase.from("...").select("*");
console.log("[debug] supabase result:", { data, error });
```
Run once to find WHERE it breaks, then investigate that layer.

### 5. Trace Data Flow Backwards
- Where does the bad value originate?
- What called this with the bad value?
- Keep tracing up until you find the source.
- Fix at the source, not at the symptom.

---

## Phase 2 — Pattern Analysis

1. Find a **working analogue** in the same codebase.
2. Compare working vs. broken **line-by-line**.
3. List every difference, however small — don't assume "that can't matter".
4. Understand dependencies: config, env vars, component assumptions.

---

## Phase 3 — Hypothesis and Testing

1. State clearly: **"I think X is the root cause because Y."** Write it down.
2. Make the **SMALLEST possible change** to test the hypothesis.
3. One variable at a time.
   - Did it work? → Phase 4
   - Didn't work? → Form a NEW hypothesis. Do NOT add more fixes on top.
4. If you don't understand something, say "I don't understand X" — don't pretend.

---

## Phase 4 — Implementation

1. Write a failing test case first (simplest possible reproduction).
2. Implement **ONE fix** targeting the root cause.
3. Verify: issue resolved, no regressions.
4. If fix doesn't work:
   - < 3 attempts: Return to Phase 1 with new information.
   - **≥ 3 attempts: STOP.** Question the architecture. Discuss before continuing.

### Architectural Red Flag Pattern
- Each fix reveals new shared state / coupling / problem in a different place.
- Fixes require "massive refactoring".
- Each fix creates new symptoms elsewhere.

→ This is a wrong architecture, not a wrong hypothesis.

---

## Red Flags — STOP Immediately

- "Quick fix for now, investigate later"
- "Just try changing X and see"
- Adding multiple changes at once and running tests
- On the 3rd+ failed fix without reconsidering approach
- "I'll manually verify" instead of writing a test

---

## Wireline-Specific Debug Checklist

When something breaks in Wireline, check in order:

1. **TypeScript errors?** → `npx tsc --noEmit`
2. **Build broken?** → `npm run build`
3. **Env vars missing?** → Check `.env` against `.env.example`
4. **Supabase schema mismatch?** → Confirm column exists via `supabase_schema.sql`
5. **Claude Brain offline?** → Check `ANTHROPIC_API_KEY` / call `/api/claude/status`
6. **Vapi webhook not firing?** → Check `VAPI_WEBHOOK_SECRET` + signature verification in `server.ts`
7. **Auth broken?** → Check `AuthContext.tsx` + Supabase session + `authenticateUser` middleware
