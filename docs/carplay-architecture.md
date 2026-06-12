# Wireline CarPlay Agents Widget - Architecture & Implementation

**Status**: Planning / Initial Documentation
**Branch**: feature/carplay-agents-widget
**Created**: 2026-06-12
**Owner**: Grok + mikelaurenzo7-collab

## Vision

Wireline CarPlay integration turns drive time into productive, safe agent interaction time. Users can:
- Interact with their specialized agents (SDR, CS, etc.) hands-free via voice.
- Use glanceable widgets for quick actions and status.
- Intelligently handle incoming calls by handing off to agents.

This is a first-class native iOS experience built as part of the Wireline monorepo, deeply integrated with existing agents, auth, and design system.

## Goals
- Safety-first (voice-primary, minimal distraction per Apple CarPlay guidelines).
- Seamless integration with existing Wireline agents (Vapi + LLM providers).
- Premium UX matching Aurora Cream design system and recent UI/UX audits.
- High-value v1: Widget + Voice Control + Smart call handoff.

## User Flows

### 1. Widget on CarPlay Dashboard
- Glanceable status: "Connected • 3 agents ready"
- Quick actions: Talk to SDR Agent, Check pipeline, Schedule demo, etc.
- Voice activation via Siri shortcuts.

### 2. Voice Conversational Mode
- Activated via widget tap or "Hey Siri, talk to my SDR agent"
- Uses CPVoiceControlTemplate with waveform, prompts, responses, and safe action buttons.
- Agent handles real calls or queries with full context.

### 3. Incoming Call Handoff (Key Innovation)
- When personal/business call rings:
  - Native CarPlay incoming call UI + Wireline widget action.
  - One-tap/large button: "Let my SDR Agent handle this call"
  - Agent conferences in, screens, qualifies, or takes message.
  - User stays focused on driving.
- Fallbacks: Answer on speaker + agent listening, Send to voicemail + agent note.

## Architecture

### Monorepo Structure (Recommended)
```
wireline/
├─ apps/
│   ├─ web/                 # Existing Next.js Agent Studio + marketing
│   └─ ios/                 # New: SwiftUI + CarPlay app (v1)
├─ packages/
│   ├─ shared/              # Types, API clients, design tokens
│   └─ ui/                  # Shared components (extend for mobile)
├─ docs/                    # This and other architecture docs
├─ backend/ or api/         # Existing backend enhancements
└─ README.md
```

### Backend Enhancements Needed
- New endpoints:
  - POST /api/carplay/handoff (initiate agent conference or takeover)
  - GET /api/carplay/session-context (share agent state)
  - Webhook for call events to update widget/Live Activities.
- Agent runtime integration: Support conferencing (Vapi supports this).
- Auth: Reuse existing (token-based or deep link with short-lived tokens).
- Context persistence: Allow agents to remember drive-time conversations.

### iOS App (Native Required for Full CarPlay)
- Framework: CarPlay + SwiftUI
- Key Templates:
  - CPVoiceControlTemplate for conversations
  - Widget / Live Activity for dashboard
  - NowPlaying if audio involved
- Integrations:
  - SiriKit for intents ("Talk to my SDR Agent")
  - CallKit for call handling and conferencing
- Auth flow: Deep link or OAuth to existing Wireline session
- Design: Match Aurora Cream (light elegant, subtle purple accents, premium feel)

### Data Flow for Incoming Call Handoff
1. Call rings on iPhone (native or VoIP).
2. iOS notifies CarPlay + Wireline app/widget.
3. User taps "Let agent handle" (or voice command).
4. App calls backend to conference agent into call.
5. Agent joins, handles interaction, logs everything.
6. Post-call: Summary pushed to user (notification or dashboard).

## Design Principles
- Voice-first, glanceable secondary.
- Large touch targets, high contrast for driving context.
- Consistent with recent UI/UX audits (#366, #380).
- Progressive disclosure: Simple widget → full voice mode.
- Accessibility: WCAG AA, reduced motion support.
- Safety: Comply with all Apple CarPlay guidelines (no distracting visuals while driving).

## Implementation Phases

**Phase 1: Documentation & Backend (Current)**
- Architecture doc
- Backend APIs for handoff and context
- Shared types in packages/shared

**Phase 2: iOS Scaffolding**
- New apps/ios/ target with CarPlay enabled
- Basic widget + Voice Control template
- SiriKit intents

**Phase 3: Core Features**
- Agent handoff & conferencing logic
- Incoming call integration
- Design polish (Aurora Cream)

**Phase 4: Polish, QA & Launch**
- Visual QA (using visual-qa-ui-ux-master skill)
- CarPlay Simulator testing
- Accessibility & safety review
- TestFlight beta
- PR with detailed docs

## Risks & Mitigations
- Apple approval: Follow guidelines strictly (voice primary). Mitigate with minimal UI in driving mode.
- Latency: Optimize prompts and use efficient models. Provide clear audio cues.
- Auth & permissions: Careful token handling, user consent.
- Scope creep: Strict v1 focus on widget + voice + handoff.

## Next Steps
1. Backend API prototypes.
2. iOS project setup with Copilot assistance.
3. Design mockups iteration (already have initial concepts).
4. Create PR with full implementation + this doc.

## References
- Apple CarPlay Developer Guide (2026)
- Recent Wireline PRs: #366 (UI/UX audit), #380 (marketing polish), #389/#390 (per-agent voice model)
- Vapi documentation for conferencing

---
*This document will be updated in every significant merge/commit.*