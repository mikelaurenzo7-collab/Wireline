# Swarm Dispatch Plan

## Group A: Foundation & Security
- **Focus**: Core data integrity and multi-tenant isolation.
- **Tasks**:
  - Audit and harden Supabase RLS policies.
  - Implement Zod validation on all POST/PATCH API endpoints.
  - Standardize error handling in `authFetch`.
  - Ensure all sensitive keys are stored in `wireline_settings` with proper encryption/access control.

## Group B: Voice Integration Swarm
- **Focus**: Operational integrity of the telephony stack.
- **Tasks**:
  - Stabilize Vapi Webhook ingestion and call status updates.
  - Implement Twilio SMS/WhatsApp fallback mechanisms.
  - Refine phone number sync and registration flows.
  - Build the Live Monitor WebSocket relay.

## Group C: Admin Experience Swarm
- **Focus**: High-end modular configuration interface.
- **Tasks**:
  - Finalize flat architecture for all Admin panels.
  - Implement visual QA for 5 breakpoints across the dashboard.
  - Enhance "Branding" with real-time CSS variable injection.
  - Streamline team invitation and role-based access UI.

## Group D: Growth & Cognitive Swarm
- **Focus**: AI-driven autonomy and training precision.
- **Tasks**:
  - Build the "Knowledge Base" and "Directives" management UI.
  - Implement autonomous prospecting logic in the backend.
  - Create the "Lesson" feedback loop for AI agents.
  - Standardize lead scoring and intent labeling algorithms.
