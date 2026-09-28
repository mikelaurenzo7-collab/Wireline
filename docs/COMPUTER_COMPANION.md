# Owner-controlled computer planning

The companion is a general Windows/macOS window and owner-selected MCP client. It can assist with research, organizing business information, native applications, and browser workflows. Existing Calendar, mail, mobile-push, and inbound MCP integrations remain separate and supported.

## Authority and execution

`plan_computer_step` is an **inbound** BotBound MCP tool that returns one proposal. It never dispatches a desktop action or a remote MCP call. The authenticated account must explicitly consent to both `computer.plan` and `agents.read`, select its own Bot, and have an active paid plan and available managed AI allowance. Public phone/chat callers cannot inherit this OAuth grant or any owner's device access.

The public native client ID is `botbound-desktop`, with PKCE S256 and an exact `http://127.0.0.1:<ephemeral-port>/callback`. The name is not attestation of a trusted binary. This client can request only `agents.read computer.plan`; it receives no privileged execution scope. Existing clients that omit scope retain their original permissions. Code and refresh token responses for this client include `botbound_account_id` from the authenticated account. The companion must isolate credentials and private history by that ID, and serialize refresh with disconnect.

Desktop installations share the public client ID but keep independent access tokens. Connecting or refreshing one computer does not revoke another computer's token. Access tokens expire after one hour; refresh tokens still rotate once per use. Existing non-desktop clients retain their prior client-wide access-token rotation behavior. If initial issuance or rotation succeeds remotely but cannot be saved locally, the running app retains that credential for Disconnect and blocks another connection. Normal close settles pending issuance and revokes any unsaved grant before quitting; failed revocation leaves recovery visible. Force termination cannot preserve this in-memory recovery, so account Apps settings remain the recovery path after a crash.

`POST /mcp/oauth/revoke` accepts form `token` and `client_id`; optional `resource` defaults to this server's canonical `/mcp` audience. An explicitly incorrect resource is rejected before any credential changes. Present the current refresh token. The handler matches its hash, client and resource, locks the existing account row, rechecks the token, and removes only matching access/refresh/code grants. Unknown tokens return an empty 200 without revealing account state. A consumed old token cannot revoke a newer grant: refresh/disconnect must therefore be serialized locally. Network failure must not be reported as confirmed revocation.

Revocation of a matched valid token is account/client/resource-wide: it revokes that account's BotBound Desktop cloud-planning grants on every computer. An already-invalid token's idempotent 200 does not prove a global session inventory. Disconnect does not remotely undo an action or stop a separately approved local action on another computer; use that computer's Stop control. Other clients and accounts are unchanged. This uses the existing client-wide grant lifecycle, without a new token-family table.

## Shared protocol

`src/lib/computer-protocol.ts` is the pure shared contract. Input contains `agent_id`, `task_id`, `goal`, zero-based `step`, a fresh `observation`, up to 8 recent receipt summaries, and up to 32 owner-selected MCP tool descriptions. Output is `action`, `complete`, or `needs_input`, with a summary and one nullable action. Actions are click, scroll, type text, keypress, or a namespaced MCP call; there is no shell/script action. Coordinates refer to screenshot pixels, never arbitrary desktop coordinates.

Each local task is limited to 20 steps and a 30-minute grant. The server validates step bounds and per-account burst/hour limits; the companion owns durable per-task step counting, expiration, stop, selected-window identity, approval, and replay protection. Every action needs local approval. MCP calls need the exact approved endpoint, current selected schema, validated arguments, and isolated credentials. Tool annotations and model-generated confirmations never grant authority. Do not automatically retry an unknown write outcome. Normal window close immediately revokes the task grant, blocks new operations and waits for the active operation, helper exit and receipt cleanup to settle before quitting. Repeated close requests cannot bypass this wait.

The local MCP client supports public HTTPS Streamable HTTP endpoints with no credential or an owner-supplied bearer token. Third-party OAuth and local stdio servers are not implemented. Tool schemas use the supported draft-07 or 2020-12 dialect with bounded JSON and local JSON Pointer references; regular-expression constraints, remote references and unsupported dialects are rejected. The task interface reports these limits before execution. Native browser work uses the one selected browser window, not an unrestricted cross-window session.

The model sees only observations deliberately shared by the owner. Screenshots, page contents, tool descriptions/results, and stored Bot context are untrusted data; they cannot change the goal or permissions. Credentials, CAPTCHAs, payments, attestations, and consequential account/security operations require a direct owner handoff. A plan is not a completion receipt. The local client verifies actual outcomes and preserves `unconfirmed` when it cannot prove completion.

## Spend and image bounds

Planning reserves the full configured structured-provider attempt sum before inference, through `runWithManagedAiSpend`. Actual known usage settles once; ambiguous provider work retains the conservative hold. Audit metadata records the Bot, hashed task ID, step, screenshot presence and tool count, without pixels, task text, or tool arguments. Remote MCP server charges are not included in BotBound's AI allowance; the owner controls those accounts locally.

Runtime failure logs record only bounded error classifications and HTTP status, never provider error messages or JSON parse excerpts. Unknown planner errors are reduced to a safe response after the spend lifecycle settles or retains their usage; existing allowance errors keep their recovery guidance. AI-provider processing and retention remain subject to the provider's terms.

One PNG is limited to 2 MiB and 1536 pixels per side. The server verifies encoded chunk structure and header dimensions without inflating pixels. Images travel as real inline image inputs through Responses/Gateway and Gemini, never as base64 text. Known GPT-5.6 high-detail and Gemini 3 families reserve 3000 image tokens per possible attempt; unrecognized image model overrides fail closed. Provider output is bounded to 1800 tokens. Both the main and dedicated MCP entrypoints accept the bounded request envelope.

The companion negotiates the existing supported 2025-06-18 server transport. This change does not claim 2026-07-28 conformance for BotBound's older inbound transport. Third-party client transport negotiation, bounded JSON/SSE parsing, OAuth issuer/resource binding, endpoint approval, and SSRF protection remain the local client's responsibilities. No remote endpoint or credential is fetched by the server planner.

References: [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), [OpenAI vision](https://developers.openai.com/api/docs/guides/images-vision), [Gemini media resolution](https://ai.google.dev/gemini-api/docs/media-resolution).

## Local client and release validation

The [BotBound Desktop package](../apps/desktop/README.md) contains the local renderer, narrow preload bridge, native helper packaging checks, and Windows/macOS build instructions. Root `verify:full` and PR CI install its locked dependencies once, then run desktop typecheck and build before shared tests. For standalone root tests after a fresh checkout, run `npm run desktop:deps` first. The CI bootstrap skips install scripts and does not download or launch Electron; use ordinary `npm ci` inside `apps/desktop` for a real development launch.

Native OS execution and real signed-installation behavior require separate device validation. Passing server tests, renderer fixtures, or an unsigned build is not evidence of a completed desktop action or a distributable signed release.
