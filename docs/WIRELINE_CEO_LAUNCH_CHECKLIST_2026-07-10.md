# BotBound Launch Checklist

Date: 2026-07-26  
Status: Active founder launch checklist; supersedes the broad "best employee" framing from 2026-07-10

## North Star

Lead with:

> Your Bot for calls, texts, and email.

Support with:

> Start with one Bot. Add another when the work needs it.

> Build free. Go live from $19/mo.

All public and workspace copy uses one audience-neutral Bot language. Specific roles describe jobs, not customer categories.

## Go / No-Go

| Area | Gate |
| --- | --- |
| Phone loop | Inbound call, outbound call, SMS follow-up, outcome log, and handoff state verified |
| Payment loop | Starter checkout, entitlement, Customer Portal, cancellation, and Conversation Balance behavior verified |
| Positioning | Public copy says Bot; no AI-employee framing, audience split, or sub-$19 launch copy |
| Capacity | Pricing and included minutes match `src/lib/plan-catalog.ts` |
| Compliance | DNC/SMS consent/STOP posture reviewed before outbound spend |
| Runtime | Vercel production deploy READY and runtime errors clean |
| Support | Early-access owner support path and rollback notes prepared |

## Pricing Snapshot

| Plan | Monthly | Included Live Voice Minutes | Included Bots / Numbers |
| --- | ---: | ---: | ---: |
| Free Builder | $0 | 0 live minutes | Private builder / simulation only |
| Starter | $19 | 50 | 1 |
| Starter Plus | $39 | 100 | 2 |
| Pro | $79 | 190 | 5 |

Extra Bot add-on: $15/mo, +50 live voice minutes, +1 included number. Scale remains a custom sales path.

## Public Copy Checklist

- Homepage hero: Your Next Hire Is a Bot.
- Primary CTA: Build Your Bot.
- Pricing line: Build free. Go live from $19/mo.
- Number promise: Every active paid Bot gets its own BotBound production number.
- Free Builder: create, train, and simulate before paid live launch.
- Role examples: call delegation, scheduling, lead response, front desk, support triage, appointment setting, and collections.
- WhatsApp: private beta only; do not advertise as public launch channel.

## Launch QA Walkthrough

1. Sign up as a new user.
2. Create one Bot from a role starter or blank canvas.
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
