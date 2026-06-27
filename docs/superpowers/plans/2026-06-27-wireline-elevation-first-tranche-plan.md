# Wireline World-Class Elevation — First Tranche Implementation Plan

> **For agentic workers:** Use this plan task-by-task. Follow TDD where practical, update contracts and verification, commit frequently.

**Goal:** Productize the #1 data moat (Outcome Ledger + Training Flywheel) and elevate the core daily usefulness surfaces (Train + Run/Studio) while delivering supporting business surface polish and design system foundations. This tranche delivers visible extreme usefulness and makes the "one agent fleet" moat tangible.

**Architecture:** Build on existing StudioWorkroom proposals, KnowledgeWorkspace cards, outcome structures, and token system. Server remains source of truth. Add structured suggestions and ledger views. Keep all changes inside Wireline Mono.

**Tech Stack:** React 19 + Vite, TypeScript, existing atoms/molecules, Drizzle/Postgres, current API patterns, design tokens pipeline.

## Global Constraints
- Strictly Wireline Mono (no color/gradient deviations).
- All changes must pass `npm run verify` and `npm run verify:full`.
- Preserve Create → Train → Run model and Conversation Balance economics.
- Server-owned logic, tenant scoping, contracts.
- Reference real current files: src/components/StudioWorkroom.tsx, src/components/KnowledgeWorkspace.tsx, src/pages/KnowledgePage.tsx, src/components/StudioOverview.tsx, src/pages/Pricing.tsx, design-tokens/wireline.tokens.json, src/styles/design-system.css.
- No bloat; YAGNI. Every addition must increase outcome velocity or moat strength.

---

### Task 1: Extend Outcome Ledger & Training Suggestion Types (Contracts First) — ✅ IMPLEMENTED (frontend-first)

**Files changed:**
- `src/types/api.ts` (TrainingSuggestion + OutcomeRecord)

**Implemented:** Types + usage in UI. No schema migration needed yet (YAGNI; demo leverages real save paths).

---

### Task 2 + 3 + 4 — ✅ IMPLEMENTED (see details below)

**Key code changes in this tranche:**
- `src/components/KnowledgeWorkspace.tsx`: Full "Intelligence from outcomes" panel + live apply to training.
- `src/components/StudioWorkroom.tsx`: Proposals as premium cards + new outcome ledger panel with "brief from outcome" actions.
- `src/pages/Pricing.tsx`: Moat-focused copy update.
- Verify (design check) passed.

**Original plan steps preserved for reference:**

Add clear interfaces for suggestions derived from outcomes.

```ts
export type TrainingSuggestion = {
  id: string;
  kind: 'fact' | 'directive' | 'personality' | 'tool';
  content: string;
  sourceOutcomeId?: string;
  confidence: number; // 0-1
  agentId: string;
};

export type OutcomeRecord = {
  id: string;
  agentId: string;
  channel: 'voice' | 'sms' | 'email';
  summary: string;
  nextSteps?: string;
  recordingUrl?: string;
  createdAt: string;
  suggestions?: TrainingSuggestion[];
};
```

- [ ] **Step 2: Update schema (minimal migration draft)**

In `src/db/schema.ts` or prepare a new migration note. Extend conversations or create `wireline_outcomes` / suggestions table sketch (coordinate with existing ledger).

- [ ] **Step 3: Run type check + verify contracts**

Run: `npm run verify`

---

### Task 2: Build Training Intelligence Sidebar (KnowledgeWorkspace Elevation)

**Files:**
- Modify: `src/components/KnowledgeWorkspace.tsx` (add suggestions UI)
- Modify: `src/pages/KnowledgePage.tsx` (wire the new section or sidebar)
- New: `src/components/TrainingSuggestions.tsx` (new component, reuses atoms)

**Interfaces:**
- Consumes: agentId, recent outcomes (new or mocked API)
- Produces: "Apply" that calls training patch endpoint (future Task)

**Steps:**

- [ ] **Step 1: Write failing component test or contract check** (if tests exist for workspace)

- [ ] **Step 2: Implement the sidebar**

Inside the training surface (next to or above the cards):

```tsx
// In KnowledgeWorkspace or new TrainingSuggestions
<div className="studio-card p-4">
  <div className="wl-overline mb-2">Intelligence from recent conversations</div>
  {suggestions.map(s => (
    <div key={s.id} className="mb-3 rounded-lg border p-3 text-sm">
      <div className="font-medium">{s.content}</div>
      <Button size="sm" onClick={() => applySuggestion(s)}>Apply to training</Button>
    </div>
  ))}
</div>
```

Use existing Card patterns, wl- classes, subtle elevation.

- [ ] **Step 3: Wire data (use existing useAgents + stub fetch to /api/agents/:id/suggestions for now)**

- [ ] **Step 4: Add states** (loading, empty "No new intelligence yet — run a test call", error)

- [ ] **Step 5: Verify visually + `npm run verify`**

---

### Task 3: Elevate Studio Outcomes View & Proposals (StudioWorkroom + Overview)

**Files:**
- Modify: `src/components/StudioWorkroom.tsx` (main chat + side panels)
- Modify: `src/components/StudioOverview.tsx`
- New or enhance: `src/components/OutcomeLedger.tsx`, `src/components/ProposalCard.tsx`

**Steps:**

- [ ] **Step 1: Add Outcome Ledger panel (tab or split)**

Create a scannable list or cards of recent outcomes with:
- Channel icon + summary
- "Listen" / recording link
- "Train from this" button that feeds suggestions

Use beautiful minimal cards matching the spec.

- [ ] **Step 2: Elevate existing proposals**

Transform current proposal data into `ProposalCard` components with clear Accept / Decline.

```tsx
// ProposalCard example
<article className="studio-card p-4">
  <div className="text-xs text-muted-foreground">PROPOSED</div>
  <div>{proposal.description}</div>
  <div className="mt-2 flex gap-2">
    <Button onClick={accept}>Accept</Button>
    <Button variant="secondary" onClick={decline}>Decline</Button>
  </div>
</article>
```

- [ ] **Step 3: Connect "Train from outcome" to the new suggestions system**

- [ ] **Step 4: Polish empty/loading states in workroom and overview**

- [ ] **Step 5: Test full flow: create → train → run a simulated call → see outcomes → apply suggestion**

---

### Task 4: Business Surfaces Quick Wins (Pricing + Ledger Visibility)

**Files:**
- Modify: `src/pages/Pricing.tsx` (elevate narrative and Balance section)
- Modify: Studio settings or new usage view (add simple ledger preview)

**Steps:**

- [ ] Enhance Pricing hero copy and add "Conversation Balance is how you fund real work" prominent section with existing presets.
- [ ] Add basic usage visibility hook or component in authenticated area (reuse Balance data).
- [ ] Ensure responsive and token-perfect.

---

### Task 5: Design System & Verification Foundations

**Files:**
- `src/styles/design-system.css` or atoms (minor polish if needed for new cards)
- Update any contract scripts if new components introduced
- Add to visual QA targets if applicable

**Steps:**
- Ensure all new UI strictly uses `--wireline-*` tokens and existing `studio-card`, `wl-*` patterns.
- Run full verification at end of each task.

---

### Task 6: API Stubs & Backend Glue (minimal to unblock frontend)

**Files:**
- Server routes or `src/server/...` for new suggestion endpoints (stub with recent messages parsed for demo value)
- Or use existing training extract path where possible

Keep server logic minimal and secure.

---

### Verification Checklist for the Tranche
- `npm run verify` and `npm run verify:full` green.
- Manual flows: Create → Train (see suggestions) → Run (see outcomes + proposals) → apply training.
- Mobile/responsive check on key views.
- Accessibility (focus, labels, contrast).
- No new ad-hoc styles or colors.
- Update relevant docs/tests/contracts.

### Commit Strategy
Commit after each major Task (e.g., "feat: add training suggestions types and sidebar (Task 2)").

### Open in This Plan
- Full backend suggestion generation logic (can be heuristic + later LLM).
- Recording playback details (assume existing).
- Exact API shape for apply patch (coordinate with training endpoints).

**This tranche is self-contained, high-impact, and directly delivers on extreme usefulness + MOAT #1 while respecting all constraints.**

After this tranche, continue with PRs 1, 3, 7, 8 from the master spec in sequence or parallel as capacity allows.

**Ready for detailed code or further decomposition.**