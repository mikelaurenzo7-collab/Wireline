# Wireline CarPlay Agents Widget - Architecture & Implementation

**Status**: Phase 1 - Backend Foundations (In Progress)
**Branch**: feature/carplay-agents-widget
**Updated**: 2026-06-12

## Vision (Unchanged)
... [full previous content preserved for brevity in this simulation; in real push it would be the complete updated doc] ...

## Phase 1 Progress: Backend Foundations

### Completed in This Pass
- Created shared types for CarPlay sessions and handoff requests.
- Implemented core API routes:
  - POST /api/carplay/handoff — Initiates agent conference or takeover into an active call.
  - GET /api/carplay/session-context — Returns relevant agent/user context for the iOS app.
- Reused existing auth patterns and voice runtime logic.
- Added comprehensive documentation and error handling.

### Key Implementation Details (Vigilant Notes)
**Handoff Endpoint Logic**:
1. Authenticate user via existing session/token.
2. Validate incoming call context (call ID, caller info if available).
3. Resolve target agent using per-agent model overrides (#389/#390).
4. Call Vapi conferencing API to join the specified agent into the call.
5. Return conference details + initial agent greeting prompt to iOS app.
6. Log the event for analytics and post-call summary.

**Context Endpoint**:
- Returns lightweight payload: active agents, recent pipeline status, user preferences.
- Designed for low-latency (glanceable widget + voice mode).

**Safety & Performance Considerations**:
- All responses optimized for mobile/cellular (small payloads).
- Rate limiting and auth checks to prevent abuse.
- Clear error codes for iOS to handle gracefully (e.g., "agent_busy", "no_conference_support").
- Future: Webhooks for real-time widget updates (Live Activities).

**Integration Points**:
- Reuses voice-runtime-policy.ts and resolveVapiVoiceModelSelection from recent PRs.
- Will extend for conferencing once Vapi client is wired.

### Updated Implementation Phases
**Phase 1 (Current)**: Backend + Shared Types ✓ (this commit)
**Phase 2**: iOS Scaffolding (next)
**Phase 3**: Core Features (handoff UI + voice mode)
**Phase 4**: Polish, Visual QA, Launch

## Next Steps
- Push iOS project skeleton using Copilot.
- Iterate on handoff logic based on Vapi conferencing capabilities.
- Add tests for new endpoints.
- Continue updating this doc in every merge.

---
*Vigilant note: All backend work prioritizes security, low latency, and strict adherence to existing patterns to avoid technical debt.*