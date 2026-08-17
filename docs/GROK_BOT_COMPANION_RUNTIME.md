# Work companion runtime

**Status:** Active.  
**Updated:** August 17, 2026.

Wireline agents should be as capable as Grok Bot teammates **and** own a real voice runtime. That is one product, not two APIs.

There is no Grok Bot HTTP API to call. Official docs: [overview](https://docs.x.ai/grok-bot/overview), [FAQ](https://docs.x.ai/grok-bot/faq). Grok Bot is a Cursor-authenticated desktop/iOS app. A team of named Bots shares **one account-scoped cloud computer**. Isolation is per Cursor user, not per Bot. Do not use separate Bots as a security boundary. Routing tenant jobs onto that computer would share founder logins, files, and cookies across customers.

What Wireline builds instead: the **same job types** Grok Bot is good at (research, outbound prep, talent scout, paid-media drafts, creative, account health), executed as **skills of the tenant's Wireline agent**, plus the phone stack Grok Bot does not provide.

## Capability split

| Job | Grok Bot app | Wireline agent |
| --- | --- | --- |
| Live phone (PSTN) | No | Yes. Twilio → Vapi, Grok 4.3 language model + xAI voices |
| Studio live voice | No | Yes. Same Vapi web path as PSTN; OpenAI Realtime backup |
| Research, scouting, creative, media drafts, call prep | Yes, on a shared computer | Yes, as reviewable drafts via xAI Responses `grok-4.6` |
| Send, dial, enroll, change ads, publish | Computer-use inside that app | Wireline-owned launch paths after a human reviews |
| Render Imagine video files | Consumer Imagine still watermarks | **Not offered.** Files include a Grok watermark that cannot be turned off |

## Three different xAI products

| Product | What it is | Used by Wireline tenants? |
| --- | --- | --- |
| **Grok Bot** | Cursor teammate app. Shared cloud computer. No create-bot / message-bot API. | **No.** Operator-only, outside Wireline. |
| **xAI Responses API** | `POST https://api.x.ai/v1/responses` with `grok-4.6` | **Yes.** Tenant-scoped briefs, spend caps, audit. |
| **Imagine Videos API** | `POST https://api.x.ai/v1/videos/generations` with `grok-imagine-video-1.5` | **No.** No watermark field. FAQ: there is no setting to remove the watermark. AUP forbids stripping it. |

`grok-4.20-multi-agent` is a Responses **model** for deep research, not Grok Bot. Optional later. Companion skills stay on Grok 4.6 unless a job explicitly needs that model.

## Planes

| Plane | Owner | Runtime |
| --- | --- | --- |
| Live PSTN | Twilio → Vapi | Grok 4.3 + xAI voices, OpenAI continuity |
| Studio / guest live voice | Vapi web (same as PSTN) | OpenAI Realtime backup |
| Agent skills (work companions) | Wireline `runStructured` | Grok 4.6 reviewable drafts |
| Operator computer-use | Grok Bot app | Cursor Ultra / SuperGrok Heavy / Cursor Teams Premium |

## Cursor, Grok Bot, and a helping hand

Wireline agents stay Grok-capable through tenant skills. Grok Bot stays an operator app. Cursor already hosts Wireline as an MCP client. Do not merge those three.

### Can an enterprise Cursor account still use Grok Bot?

Yes as a **founder or operator seat**, not as a Wireline runtime.

- Eligible plans named in the [Grok Bot FAQ](https://docs.x.ai/grok-bot/faq): SuperGrok Heavy, Cursor Ultra, Cursor Teams Premium. Enterprise access is rolling out; contact the Cursor account team.
- Grok Bot signs in with a **Cursor account**. Privacy and training opt-out follow Cursor settings. Current Privacy Mode is compatible. **Legacy Privacy Mode is not** — Grok Bot needs cloud storage.
- There is still **no create-bot / message-bot / subagent API**. Wireline cannot spawn Grok Bot from Express, Vapi, or a work-companion run.
- All Bots on that Cursor user share **one cloud computer**. Do not route tenant jobs onto it.

### When a helping hand is actually useful

Use Grok Bot only for work Wireline cannot do because there is no tenant-safe API:

- Click through LinkedIn, ads consoles, or other sites without connectors
- Record a browser workflow, then paste a reviewed brief into Wireline
- Founder-only expense, calendar, or ops chores that must not touch customer data

A Wireline agent does **not** call Grok Bot mid-call or mid-job. The human reviews, then applies the artifact in Wireline (`POST /api/work-companions/apply`) or launches on Wireline-owned paths.

### Wireline inside Cursor (already shipped, keep)

This is the beneficial Cursor integration. It is the inverse of Grok Bot:

```text
Cursor / ChatGPT / Claude
  -> https://trywireline.com/mcp  (OAuth)
  -> draft / inspect / privately simulate a Wireline agent
  -> launch, dial, CRM, billing stay in Wireline
```

Same tool contract as `docs/CHATGPT_APP.md`. Non-goals stay: no dial, launch, CRM mutations, or raw customer data. Connecting that MCP server into a **Grok Bot** is founder-scoped operator work only. If that Bot then acts across tenants, it becomes a shared-computer leak.

### Make Wireline agents “work in Cursor like Grok”? Not beneficial

Grok Bot in Cursor is a persistent teammate with a shared computer, connectors, and computer-use. Wireline cannot become that product. Cloning it would compete with Cursor on the wrong axis and weaken tenant isolation.

| | Pros | Cons |
| --- | --- | --- |
| **Keep Wireline agents Grok-capable (current)** | Same job types as Grok Bot, plus PSTN. Tenant-scoped spend, audit, and review. No shared computer. | No live computer-use on sites without APIs. |
| **Founder Grok Bot as optional helping hand** | Covers LinkedIn / ads UI / CAPTCHA-gated sites. Uses an existing Cursor Ultra or Teams Premium seat. | No API. Manual handoff. Enterprise access may need the Cursor account team. Legacy Privacy Mode blocks it. |
| **Call Grok Bot as a Wireline subagent / special runtime** | None that survive the security model. | No HTTP API. Shared computer would mix tenant work with founder logins. Cannot isolate per Bot. |
| **Ship a Cursor plugin that impersonates Grok Bot** | Familiar IDE surface. | Cursor already uses `/mcp`. A teammate/computer-use clone is Cursor’s product, not Wireline’s. Extra plugin package violates the shared-MCP contract. |
| **Connect Wireline MCP into Grok Bot** | Operator can draft agents from the Bot they already live in. | Easy to over-scope. One computer, many tenants. Do not do this for customer work. |

**Decision:** do not build a Grok Bot subagent, special runtime, or Cursor-teammate clone. Keep work-companion skills on Grok 4.6. Keep Cursor on the existing `/mcp` server. Use Grok Bot only as an operator helping hand when a site has no API.

## Jobs

`src/lib/work-companion-runtime.ts` owns the kinds. They are skills of the Wireline agent, not a cloned Bot team:

- `outbound_research`
- `talent_scout`
- `paid_media`
- `creative`
- `account_health`
- `call_brief`
- `video_clip` — shot list / script only. No Imagine file.

Every result is a reviewable artifact with `facts`, `inferences`, `pending_approval`, and `unresolved`. Apply sinks are:

- `wireline_knowledge` for durable facts
- `outboundLeads.context` for the live "OUTBOUND CALL OBJECTIVE"
- `leadDossiers.metadata.work_companion_brief` for the compact CALL PREP block
- `leadDossiers.metadata.work_companion_video` for a reviewed script (prompt / duration / aspect)

They draft. They never send email, never dial, never enroll a campaign, never change ads, and never publish a clip. Live outbound injection happens in `src/lib/vapi-client.ts`. The call prompt may include a CALL PREP block. It must not include vendor names.

## Video

Live talking-head lip-sync (LiveAvatar / HeyGen) is retired. Identity badges remain the in-app live visual.

Imagine file generation is not offered:

- REST has no watermark parameter ([videos API](https://docs.x.ai/developers/rest-api-reference/inference/videos))
- [Grok FAQ](https://docs.x.ai/grok/faq): there is no setting to remove the watermark
- [Acceptable Use Policy](https://x.ai/legal/acceptable-use-policy): stripping, altering, or circumventing watermarks is prohibited

`POST /api/work-companions/video` returns `410 IMAGINE_WATERMARK_NOT_OFFERED`. Draft `video_clip` scripts instead.

## HTTP

Authenticated routes in `src/routes/work-companion-routes.ts`:

- `GET /api/work-companions` — catalog
- `POST /api/work-companions/runs` — draft a brief or clip script
- `POST /api/work-companions/video` — 410, generation not offered
- `GET /api/work-companions/video/:requestId` — 410, generation not offered
- `POST /api/work-companions/apply` — persist a reviewed brief

Spend uses `enforceSpendCap` and `withAudit`. Launch hard-gate pauses the POST paths.

## Customer copy

Use "Work companions", "Call prep", and "Identity and clips". Never "Grok Bot". Never pair "AI" with "agent".
