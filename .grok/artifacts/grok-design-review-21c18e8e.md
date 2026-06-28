## Design Document Review: Wireline Studio Canvas UX Overhaul

### Summary
**Approve with minor revisions.** The document accurately reflects the working-tree implementation (~70% complete), cites real file paths, and proposes a realistic 5-PR incremental plan. Two minor gaps need clarification before implementation.

### Issue 1: PR dependency graph allows unsafe parallelization
- **Severity**: minor
- **Section**: PR Plan
- **Description**: PR 2 lists "Dependencies: PR 1 (optional; can parallel)" but both touch `WorkspaceShell.tsx` `AgentSwitcherPill` — parallel merges will conflict.
- **Suggestion**: State PR 2 depends on PR 1, or scope PR 1 to MRU-only files and PR 2 to switcher a11y-only with explicit non-overlap.
- **Status**: addressed
- **Response**: Scoped PR 1 to MRU-only files (`studio-agent-preference.ts`, `StudioWorkspaceV2.tsx`) with explicit **no `WorkspaceShell` edits**. Moved `scrollIntoView` to PR 2. Changed PR 2 dependencies to **PR 1 (required — merge sequentially)**. Added PR dependency graph (Mermaid + ownership table) and updated Rollout Plan to state PR 1→PR 2 is sequential, not parallel.

### Issue 2: PR 3 dependency on PR 4 is inverted in narrative
- **Severity**: nit
- **Section**: PR Plan / PR 4
- **Description**: PR 4 says "Dependencies: PR 3 (copy/constants shared)" but PR 3 does not block workspace extraction logically — only composer DS.
- **Suggestion**: Change PR 4 dependencies to "None" or "PR 1" — workspace extraction is independent of composer dock classes.
- **Status**: addressed
- **Response**: Changed PR 4 dependencies to **None**, noted it may land in parallel with PR 3. Updated dependency graph to show PR 3 ↔ PR 4 as parallel-safe. Removed incorrect coupling between composer dock work and workspace panel extraction.

### Strengths
- Accurate audit of `WorkspaceShell`, `StudioWorkspaceV2`, `StudioWorkroom` current state
- Clear URL routing table and Mermaid flows
- MRU utility spec is concrete and testable
- Contracts and `check-wireline-clear-system.mjs` updates enumerated
- Alternatives section is substantive

---

## Revision Summary

**Date:** 2026-06-27

**Issues addressed:** 2 / 2 open

| Issue | Resolution |
|-------|------------|
| Unsafe PR 1 ∥ PR 2 parallelization | PR 1 MRU-only; PR 2 owns all `WorkspaceShell` switcher work; sequential merge required |
| Inverted PR 4 → PR 3 dependency | PR 4 dependencies set to None; parallel with PR 3 |

**Design doc updated:** `grok-design-doc-21c18e8e.md` — PR Plan, Rollout Plan, MRU persistence section, React component interfaces table.

**Reviewer verdict:** Ready for implementation with clarified merge order.