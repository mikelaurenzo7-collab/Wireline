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

**Do not invest in Chrome/Firefox store GA** until `/settings/apps` has a real sideload/install path and the waitlist mailto is replaced. Until then: Early access + install guide.

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
| Cursor | **No** | Yes — Cursor redirect allowlist in `mcp-client-registry.ts` | Added on `/developers` this pass; not a first-class Apps tile yet |

**Live MCP tools (account-bound):** draft create/get/update, list agents, workspace summary, private voice simulation.

**Hard non-goals (enforced):** no number provision, dial, SMS, launch, billing mutations.

Guest demo tools behind `CHATGPT_MCP_GUEST_DEMO` are **shadowed** by the account router on `POST /mcp` — treat as dead/legacy, not a launch path.

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

## Investment order (next)

1. **Web honesty** — done for Developers + extension copy; keep matrix/docs in sync with `CLIENT_SURFACE_POSTURE`.
2. **MCP polish** — delete or quarantine shadowed guest tools; optional Apps tile for Cursor.
3. **Extension** — real install instructions in-product; then store packaging.
4. **Android internal beta → dogfood** — only after dial/consent/push smoke on device.
5. **iOS** — after signing + CallKit acceptance; CarPlay stays Phase 2.

Kill candidates (not recommended yet): none. Shrink candidates: extension agency claims (done), Developers API-key fiction (done), guest MCP demos (next).
