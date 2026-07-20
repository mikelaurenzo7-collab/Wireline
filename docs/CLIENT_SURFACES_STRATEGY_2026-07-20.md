# Client Surfaces Strategy — 2026-07-20

Status: **Active** — product decision note after a deep monorepo / companion-surface audit.
Canonical posture object: `CLIENT_SURFACE_POSTURE` in `src/lib/product-copy.ts`.
Ownership contract: `docs/CLIENT_SURFACES.md`.

## Verdict in one page

| Surface | Keep? | Why it exists | What only it can do vs web |
| --- | --- | --- | --- |
| **Web/API** | **Canonical** | Create → Train → Wire → Run, billing, dial, SMS, launch | Everything that matters |
| **Browser Command** | **Yes — keep thin** | Capture *this tab* into Studio without copy/paste | Page/selection/`tel:` context on explicit gesture |
| **ChatGPT MCP** | **Yes — early access** | Draft/simulate where the user already chats | Natural-language draft + private voice sim inside ChatGPT |
| **Claude via MCP** | **Yes — same server** | Same connector, Claude OAuth DCR | No separate Claude plugin package |
| **Cursor via MCP** | **Yes — server only** | Same `/mcp` + Cursor redirect allowlist | **No Cursor plugin in this repo** |
| **iOS / Android** | **Keep building, don't market as live** | OS call UI, push, widgets, Siri | CallKit/Telecom/FCM/widgets — not a Studio clone |
| **Video presenter** | **Gated add-on** | Optional face for business agents | Not a separate app |

**North star:** companions capture context or urgent control; the web app owns agency, money, and launch.

---

## Does the browser extension make sense?

**Yes — as a privacy-minimal handoff, not as a second product.**

### What it offers that the web app cannot

1. **Page-native context** — title, URL, meta description, user selection, `tel:` links from the tab the founder is already looking at (CRM, inbox, Google result, lead page).
2. **Zero copy/paste friction** — one gesture → Studio brief with “reference only” framing.
3. **Always-available command palette** — side panel / context menu / `Ctrl+Shift+Y` without opening trywireline.com first.

### What it deliberately does *not* offer

- No dialing, SMS, email send, number provision, billing, Training edits, or agent lifecycle.
- No tokens, no API calls, no background scraping, no broad host permissions.
- It opens Studio; Wireline's server does the work.

### Better way (already applied in this pass)

- Copy: “Send this page into Studio…” (not “It calls, texts, emails…”).
- Drop unused `tabs` permission + Google Fonts network from CSP.
- Fail closed on missing `capturedAt` so forged fragments cannot skip the TTL.
- Runtime handoff schema grants `wireline_server` so fresh envs don't silently break redeem.

**Store GA stays deferred.** In-product install is live at `/settings/apps/command` (Chromium + Firefox zips under `/downloads/`). Keep store listings off until that path is the default dogfood route.

---

## ChatGPT vs Claude vs Cursor — what is actually built?

```text
                    ┌─────────────────────────────┐
                    │  https://trywireline.com/mcp │
                    │  OAuth PKCE + account tools  │
                    └──────────────┬──────────────┘
           ┌───────────────────────┼───────────────────────┐
           ▼                       ▼                       ▼
     ChatGPT (CIMD)          Claude (DCR)            Cursor (DCR)
     Early access UI         Connectors UI           Server allowlist only
     No separate plugin      No Claude plugin pkg    No Cursor plugin pkg
```

| Client | In-repo package? | Server support? | Product UI? |
| --- | --- | --- | --- |
| ChatGPT | No (uses MCP) | Yes — primary | Yes — `/developers`, `/settings/apps` |
| Claude | No | Yes — Anthropic redirect DCR | Yes — connectors link |
| Cursor | **No** | Yes — Cursor redirect allowlist in `mcp-client-registry.ts` | Yes — `/settings/apps` + `/developers`; `draftSource: cursor_mcp` |

**Live MCP tools (account-bound):** draft create/get/update, list agents, workspace summary, private voice simulation.

**Hard non-goals (enforced):** no number provision, dial, SMS, launch, billing mutations.

Guest demo tools (`CHATGPT_MCP_GUEST_DEMO`) are **removed** from the OAuth/MCP router — account-bound `POST /mcp` is the only tool transport. Do not reintroduce guest tools.

There is **no** Claude Desktop extension, **no** Cursor `.cursor-plugin`, and **no** `plugins/` tree in this monorepo. Those would be separate products; the correct Wireline shape is one remote MCP server.

---

## Native apps

Keep them. They earn their place only when OS primitives matter:

- Inbound CallKit / Telecom presentation
- Push / FCM wake for live calls and approvals
- Widgets + Siri shortcuts for “call this lead”

They must stay thin adapters on `/api/mobile/*`. This pass closed a real gap: mobile outbound now requires the same marketing consent artifact as web (`CONSENT_ARTIFACT_REQUIRED`).

Do **not** sell iOS as live while `CLIENT_SURFACE_POSTURE.ios = Planned`. Align docs to Early access / Internal beta / Planned — not blanket “Beta + store in progress.”

---

## Web-first launch decision (2026-07-20)

**GO: promote and sell the web app without store-ready natives or extension.**

Companions are optional early access. Create → Train → Wire → Run is complete on `trywireline.com`. Waiting on App Store / Play / Chrome Web Store is a perfectionist trap, not a product dependency.

Real gates before inviting paid strangers (ops, not companions): Federal DNCScrub for marketing dials, live billing/voice/SMS/email E2E proof, Stripe buffer, Twilio top-up, rotate leaked tokens. See `docs/LAUNCH_GURU_PLAYBOOK_2026-07-20.md`.

## Investment order (companions after web GA)

1. **Web honesty** — done for Apps/Developers/Security posture.
2. **MCP polish** — guest tools removed; Cursor/Claude on shared `/mcp`.
3. **Extension** — in-product install live; store GA deferred.
4. **Android internal beta → dogfood** — after web launch traffic exists.
5. **iOS** — Planned; CarPlay Phase 2.

Kill candidates (not recommended yet): none. Shrink candidates: extension agency claims (done), Developers API-key fiction (done), guest MCP demos (done).
