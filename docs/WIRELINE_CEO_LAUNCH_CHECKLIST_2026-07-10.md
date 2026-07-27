# Wireline Agent-First Launch Checklist

Date: 2026-07-26  
Status: Active founder launch checklist; supersedes the broad "best employee" framing from 2026-07-10

## North Star

Lead with:

> AI voice agents for every conversation - personal or business.

Support with:

> Start with one agent. Build a team when you need one.

> Build free. Go live from $19/mo.

Business workspace copy should use "business voice agent" when the audience is explicitly business. Broad public surfaces should use "AI Voice Agent" so personal plans and multi-agent growth stay clear.

## Go / No-Go

| Area | Gate |
| --- | --- |
| Phone loop | Inbound call, outbound call, SMS follow-up, outcome log, and handoff state verified |
| Payment loop | Starter checkout, entitlement, Customer Portal, cancellation, and Conversation Balance behavior verified |
| Positioning | Public copy says AI Voice Agents; no broad "one AI employee"; no sub-$19 launch copy |
| Capacity | Pricing and included minutes match `src/lib/plan-catalog.ts` |
| Compliance | DNC/SMS consent/STOP posture reviewed before outbound spend |
| Runtime | Vercel production deploy READY and runtime errors clean |
| Support | Early-access owner support path and rollback notes prepared |

## Pricing Snapshot

| Plan | Monthly | Included Live Voice Minutes | Included Agents / Numbers |
| --- | ---: | ---: | ---: |
| Free Builder | $0 | 0 live minutes | Private builder / simulation only |
| Starter | $19 | 60 | 1 |
| Starter Plus | $39 | 120 | 2 |
| Pro | $79 | 250 | 5 |
| Business | $159 | 450 | 15 |

Extra agent add-on: $15/mo, +50 live voice minutes, +1 included number. Enterprise remains custom.

## Public Copy Checklist

- Homepage hero: AI Voice Agents.
- Primary CTA: Build your AI Voice Agent.
- Pricing line: Build free. Go live from $19/mo.
- Number promise: Every paid AI voice agent includes a Wireline number.
- Free Builder: create, train, and simulate before paid live launch.
- Personal examples: call delegation, scheduling, vendors, reminders, follow-up.
- Business examples: lead response, front desk, support triage, appointment setting, collections.
- WhatsApp: private beta only; do not advertise as public launch channel.

## Launch QA Walkthrough

1. Sign up as a new user.
2. Create one AI voice agent using either Personal or Business context.
3. Train with facts, tone, escalation rules, and prohibited topics.
4. Run a private simulation.
5. Upgrade to Starter.
6. Confirm paid-plan number and live-call launch controls.
7. Place inbound and outbound test calls.
8. Confirm SMS follow-up and STOP behavior.
9. Confirm outcome log and Studio review.
10. Cancel through Customer Portal and verify access-through-period behavior.

## Campaign Readiness

- Use `utm_campaign=wl_launch_ai_voice_agents_v6`.
- Ship the active media kit assets only after stale employee/old-price files are regenerated.
- Use AI Voice Generator audio for marketing/reference only.
- Keep daily paid test spend capped until phone and payment loops are manually verified.
