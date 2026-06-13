# Wireline Wizard + Director Mode Architecture

Status: preview migration direction. Do not treat this as a production launch checklist until the Figma design and Vercel preview are approved.

## Naming decision

Wireline keeps the company and platform brand. Wireline Wizard becomes the main user-facing AI builder/copilot across personal and business accounts. Director Mode becomes the advanced fleet-management layer for multi-agent business operations.

| Layer | User-facing name | Purpose |
| --- | --- | --- |
| Company/platform | Wireline | The product umbrella. |
| Main AI assistant | Wireline Wizard | Builds, tunes, launches, explains, and supervises agents with the user. |
| Agent creation surface | Agent Studio | Visual workspace for voice, brain, knowledge, rules, tools, tests, and launch. |
| Advanced operations | Director Mode | Fleet-level routing, QA, escalation, analytics, governance, and live operations. |
| Internal implementation | director-* | Can remain internal until a deliberate code cleanup pass. |

## Product rule

Use Wireline Wizard anywhere the user is asking the system to help them build, configure, understand, or approve agent behavior.

Use Director Mode anywhere the user is managing multiple agents, live operations, fleet performance, routing, QA, escalation, or governance.

Do not use Director as the default assistant name. It is too enterprise-heavy for Personal and future iOS surfaces. Do not use Wizard as the company name. The company remains Wireline.

## Public marketing copy

### Personal plan

Headline:

> Your personal AI for the calls you avoid.

Body:

> Tell Wireline Wizard what you need, approve the script, and let your agent call, wait on hold, schedule, dispute, follow up, or report back. You stay in control before, during, and after the call.

Primary use cases:

- Appointment booking: dentist, vet, doctor, salon, auto shop, restaurants.
- Customer service: returns, order issues, billing disputes, insurance follow-ups.
- Phone anxiety/accessibility: the user can delegate the call while keeping live control.
- Routine follow-up: callbacks, reschedules, confirmations, and status checks.

Safety copy:

> Wireline Wizard only calls within the bounds you approve. It does not call emergency services, impersonate you unlawfully, or complete sensitive verification flows unless the workflow is explicitly allowed and safe.

### Business plans

Headline:

> Wireline Wizard builds your agents. Director Mode runs the fleet.

Body:

> Build agents in Agent Studio with Wireline Wizard, then manage call volume, routing, QA, escalations, and performance from Director Mode.

Primary use cases:

- Inbound call coverage.
- Outbound speed-to-lead.
- Email and SMS follow-up.
- Agent QA and post-call coaching.
- Team routing and escalation governance.

## Authenticated product copy

Agent Studio:

- Primary CTA: Build with Wireline Wizard
- Empty state: Ask Wireline Wizard to draft your first agent.
- Helper text: Wizard can turn your website, script, calendar rules, and escalation preferences into a launch-ready agent.

Wireline Wizard chat:

- Page title: Wireline Wizard
- Subtitle: Build, tune, test, and understand your agents.
- Personal workspace hint: Tell Wizard what call you want handled and approve the plan before it dials.
- Business workspace hint: Ask Wizard to tune agent rules, simulate calls, or explain fleet performance.

Director Mode:

- Page title: Director Mode
- Subtitle: Fleet operations, QA, routing, and governance.
- Entry hint: Available when your workspace has multiple agents, team routing, QA review, or business-scale operations.

## Future iOS Swift direction

Native iOS should lead with Wizard, not Director. The first iOS build should feel like a personal command surface that later unlocks Director Mode for business users.

Suggested SwiftUI surfaces:

- `WizardView`: primary chat/control surface.
- `CallPlanView`: review what the agent will say and what it is allowed to do.
- `LiveCallControlView`: pause, take over, approve next action, or hang up.
- `AgentBuilderFlow`: personal and business agent setup.
- `DirectorFleetView`: business-only fleet health, routing, and QA.
- `ApprovalSheet`: reusable approval UI for sensitive actions.

Suggested call state model:

```swift
enum CallPlanState: String, Codable {
  case draft
  case awaitingApproval
  case dialing
  case inProgress
  case onHold
  case needsUserApproval
  case completed
  case escalated
  case failed
}
```

The web migration should keep API naming stable enough that a Swift client can reuse the same auth/session, account mode, agent, call-log, transcript, and approval endpoints.

## Preview migration checklist

1. Update Figma v2 frames with the naming architecture.
2. Update public marketing copy for Personal and business positioning.
3. Update app copy so user-facing assistant references say Wireline Wizard.
4. Use Director Mode only for fleet operations surfaces.
5. Keep internal `director-*` names unless a later cleanup pass is scoped.
6. Deploy a Vercel preview from `preview/wireline-personal-wizard-migration`.
7. Review visually before any merge to `main`.
