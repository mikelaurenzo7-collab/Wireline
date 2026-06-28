## Summary

The Studio Canvas UX stack is well-structured: shared `useStudioActiveAgentId` keeps shell and canvas in sync, MRU resolution with logout purge is implemented, workspace depth is cleanly gated behind `?view=workspace`, and the vision-first contract module aligns tests with implementation. The main gap is agent-switch isolation in `StudioWorkroom` without remount/reset, plus URL param hygiene for command/brief params.

## Issues

### Issue 1 -- Severity: bug
- File: src/components/StudioWorkroom.tsx:85
- Description: `StudioWorkroom` is mounted without `key={active.id}`; agent switch leaks draft, messages, and stream state.
- Suggestion: Add `key={active.id}` on `<StudioWorkroom>` in `StudioWorkspaceV2.tsx`.
- Status: open

### Issue 2 -- Severity: bug
- File: src/components/StudioWorkspaceV2.tsx:131
- Description: MRU URL correction preserves `command`/`commandNonce` when `agent` was missing, misrouting commands.
- Suggestion: Strip ephemeral params when injecting MRU agent without valid `requestedId`.
- Status: open

### Issue 3 -- Severity: suggestion
- File: src/components/StudioWorkspaceV2.tsx:200
- Description: `command` and `commandNonce` never removed from URL after apply.
- Suggestion: `replace` URL to delete them after first render while keeping `agent`/`view`.
- Status: open

### Issue 4 -- Severity: suggestion
- File: src/components/CreateAgentDialog.tsx:67
- Description: `close()` leaves orphaned `brief` in URL.
- Suggestion: Delete `brief` and `posture` in `close()`.
- Status: open

### Issue 5 -- Severity: suggestion
- File: src/contexts/AuthContext.tsx:146
- Description: Session expiry does not clear MRU unlike explicit logout.
- Suggestion: Call `clearStudioLastAgentId()` in `onSessionExpired`.
- Status: open

### Issue 6 -- Severity: suggestion
- File: src/components/WorkspaceShell.tsx:169
- Description: `tablist` nested inside `toolbar` without tabpanels.
- Suggestion: Use navigation landmark or full tabs pattern.
- Status: open

### Issue 7 -- Severity: suggestion
- File: src/components/StudioAgentWorkspacePanel.tsx:53
- Description: Setup status badge not loaded from API; always "In progress" on mount.
- Suggestion: Derive from config or remove until real data exists.
- Status: open

### Issue 8 -- Severity: nit
- File: src/pages/OverviewPage.tsx:254
- Description: `aria-label` still says "workroom".
- Suggestion: Update to Studio canvas copy.
- Status: open

### Issue 9 -- Severity: nit
- File: src/components/WorkspaceShell.tsx:276
- Description: Mobile Workspace/Chat toggle below 44px touch target.
- Suggestion: Add min-h/min-w 44px.
- Status: open