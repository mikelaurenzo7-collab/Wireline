---
applyTo: "**"
---
# Writing Plans

> Source: obra/superpowers · writing-plans skill

**Announce at start:** *"I'm using the writing-plans skill to create the implementation plan."*

Use this whenever a request touches multiple files or steps. Write the plan before touching code.

---

## Principles

- **TDD** — write the failing test before implementation, always.
- **YAGNI** — build only what the spec requires, nothing more.
- **DRY** — no duplication across tasks.
- **Frequent commits** — at minimum after each task.
- **No placeholders** — every step must contain actual code and commands.

---

## Scope Check

If the spec covers multiple independent subsystems, suggest breaking it into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

---

## File Structure First

Before tasks, map out which files are created or modified and what each one owns:
- One clear responsibility per file.
- Split by responsibility, not technical layer.
- Follow Wireline's existing patterns.

---

## Plan Document Header

```markdown
# [Feature Name] Implementation Plan

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

---

## Task Structure

Each task follows this exact format:

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts`

- [ ] **Step 1: Write the failing test**

```ts
// actual test code here — no placeholders
it("does X when Y", () => {
  expect(fn(input)).toEqual(expected);
});
```

- [ ] **Step 2: Run test — confirm it FAILS**

```bash
npx tsc --noEmit
# Expected: error TS2304: Cannot find name 'fn'
```

- [ ] **Step 3: Write minimal implementation**

```ts
// actual implementation code here
export function fn(input: T): R {
  return expected;
}
```

- [ ] **Step 4: Run test — confirm it PASSES**

```bash
npx tsc --noEmit && npm run build
# Expected: exit 0
```

- [ ] **Step 5: Commit**

```bash
git add exact/path/to/file.ts exact/path/to/existing.ts
git commit -m "feat: add X to Y"
```
````

---

## Forbidden Content

Never write these in a plan:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" (without showing the code)
- "Similar to Task N" (repeat the code — tasks may be read in isolation)
- Steps that describe what to do without showing how (code blocks required)
- References to types or functions not yet defined in any task

---

## Wireline-Specific Conventions

| Concern | Where it goes |
|---------|--------------|
| New API endpoint | `server.ts` (Express) — search for existing pattern first |
| New frontend component | `src/components/NewThing.tsx` |
| New route in App.tsx | `src/App.tsx` — lazy import pattern |
| Claude-powered logic | `src/lib/claude-brain.ts` — NEVER call `@anthropic-ai/sdk` directly from a component |
| New Claude tool schema | `TOOLS` object in `src/lib/claude-brain.ts` |
| New recipe UI | `src/components/ClaudeRecipes.tsx` — add to `RECIPE_META` + `RecipeModal` switch |
| Database schema change | `supabase_schema.sql` — idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` |
| New env var | `.env.example` — must be documented |

**Final step of ANY plan touching `server.ts` or `claude-brain.ts`:**
```bash
npx tsc --noEmit && npm run build
# Both must exit 0 before the plan is considered complete.
```

---

## Self-Review Before Handing Off

After writing the complete plan, check:
1. **Spec coverage** — can you point to a task for each requirement? List gaps.
2. **Placeholder scan** — search for any forbidden content patterns. Fix them.
3. **Type consistency** — do method signatures in later tasks match what's defined in earlier tasks?

Fix issues inline, then hand off.
