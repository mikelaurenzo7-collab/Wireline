# Work companion runtime

**Status:** Active.  
**Updated:** August 17, 2026.

Work companions are Wireline-owned prep jobs that mirror Grok Bot style work (research, scouting, creative, outbound briefs) without becoming a second live-call runtime.

They draft. They never send email, never dial, never enroll a campaign, and never change ads.

## Planes

| Plane | Owner | Model |
| --- | --- | --- |
| Live PSTN | Twilio → Vapi | Grok 4.3 language model + xAI voices, OpenAI continuity |
| Studio / guest live voice | Vapi web (same as PSTN) | OpenAI Realtime backup |
| Work companions | Wireline `runStructured` | Grok 4.6 primary |

Grok Bot itself is a Cursor-authenticated teammate product. It is not an embeddable multi-tenant API and must not be Wireline's PSTN engine.

## Jobs

`src/lib/work-companion-runtime.ts` owns the kinds:

- `outbound_research`
- `talent_scout`
- `paid_media`
- `creative`
- `account_health`
- `call_brief`

Every result is a reviewable artifact with `facts`, `inferences`, `pending_approval`, and `unresolved`. Apply sinks are:

- `wireline_knowledge` for durable facts
- `outboundLeads.context` for the live "OUTBOUND CALL OBJECTIVE"
- `leadDossiers.metadata.work_companion_brief` for the compact CALL PREP block

Live outbound injection happens in `src/lib/vapi-client.ts`. The call prompt may include a CALL PREP block. It must not include vendor names.

## HTTP

Authenticated routes in `src/routes/work-companion-routes.ts`:

- `GET /api/work-companions` — catalog
- `POST /api/work-companions/runs` — draft a brief
- `POST /api/work-companions/apply` — persist a reviewed brief

Spend uses `enforceSpendCap` and `withAudit`. Launch hard-gate pauses the POST paths.

## Customer copy

Use "Work companions" and "Call prep". Never "Grok Bot". Never pair "AI" with "agent".
