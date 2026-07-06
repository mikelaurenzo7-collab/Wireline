# Wireline Product Showcase Matrix

Status: **Active canonical showcase**. This document keeps every meaningful Wireline capability visible while separating launch-critical product from deliberate expansion surfaces.

## Commercial wedge

Wireline's first commercial wedge is owner-operated service businesses that need an agent to answer, route, book, qualify, text outcomes, and escalate. The whole product still matters, but every surface should reinforce one clear loop before it branches outward: **Create -> Train -> Wire -> Run**.

## Showcase pillars

| Pillar | Customer promise | Active surfaces | Launch standard |
| --- | --- | --- | --- |
| Agents | Create focused voice, SMS, email, and follow-up agents. | Web Studio, native setup helpers, ChatGPT drafting. | New users can create one useful agent quickly and understand what it can do. |
| Training | Teach facts, sources, policies, tone, escalation, pronunciation, and workflows. | Knowledge workspace, agent-config API, Studio proposals, mobile setup helpers. | Training changes are durable, reviewable, and tied to the selected agent. |
| Wire | Connect numbers, tools, billing controls, routing, approvals, and launch posture. | Connections, Carrier, OAuth integrations, Conversation Balance, spend controls. | Live side effects are deliberate and server-owned. |
| Run / Studio | Execute calls, texts, follow-up, approvals, handoffs, and review. | Studio workroom, call logs, SMS threads, email, activity, QA, analytics. | Operators can see what happened, what needs action, and what the agent should learn. |
| Voice | Production PSTN agents and authenticated realtime test paths. | Vapi/Twilio, OpenAI/Gemini runtime, Grok live test path, voice observability. | Calls are tenant-scoped, metered, observable, and cost-controlled. |
| Browser context | Explicitly bring page context into Wireline. | Wireline Command browser extension. | No silent browsing, no broad host permissions, no token storage. |
| Native control | Urgent owner control on the go. | iOS, Android, widgets, live activity, push/device registration. | Native apps handle calls, approvals, notifications, handoff, wallet safety, and daily review. |
| ChatGPT App | Private account-bound drafting, refinement, simulation, and agent workflows. | OAuth MCP routes and ChatGPT app docs. | ChatGPT can help configure and simulate without bypassing Wireline authorization. |
| Video presenters | Optional live face for business agents. | Video presenter routes, catalog, consent states, live add-on. | Customer copy says presenter/face/live video add-on, not vendor names. |
| Integrations | Let agents work with calendars, email, CRM, commerce, documents, and alerts. | OAuth routes, CRM/email/calendar services, certified integration UI. | Customer-owned integrations stay server-authorized and scoped. |
| Trust and compliance | Make automation safe to buy. | RLS, authz checks, audit logs, CSP, SOC2 evidence, TCPA/DNC, spend controls. | Trust claims are truthful, current, and backed by code or runbooks. |
| Margin engine | Keep usage profitable and predictable. | Conversation Balance, credit wallet, audit spend, plan catalog, Stripe. | Expensive usage is metered, gated, visible, and funded. |

## Surface posture

| Surface | Role | Must showcase | Must not do |
| --- | --- | --- | --- |
| Web app | Primary command center and setup workbench. | Full Create -> Train -> Wire -> Run loop. | Hide critical launch controls behind ambiguous dashboard language. |
| API | Server-owned execution and authorization boundary. | Stable partner contracts, webhooks, mobile adapters, MCP tools. | Let clients own provider keys, billing decisions, or tenant authorization. |
| iOS / Android | Urgent control surface. | Calls, handoff, notifications, approvals, recent summaries, wallet. | Become a full admin clone before core urgent loops are flawless. |
| Browser extension | Explicit context capture. | Prepare call, extract facts, draft follow-up, send context to Studio. | Harvest pages silently or store auth tokens. |
| ChatGPT App | Private assistant for configuration and simulation. | Drafts, improvements, simulations, account-bound tools. | Claim external actions happened unless Wireline actually performed them. |
| Marketing site | Explain and convert. | Service-business wedge, trust proof, ROI, all product pillars. | Fabricate proof or imply inactive features are generally available. |

## Feature status discipline

- **Live** means mounted, typechecked, documented, and verified.
- **Beta** means real but gated, priced, and supported by an owner.
- **Planned** means showcased as roadmap only, not promised in active product copy.
- **Historical** means useful context but not active source of truth.

Every feature in this matrix should map to one of those states before paid acquisition scales.
