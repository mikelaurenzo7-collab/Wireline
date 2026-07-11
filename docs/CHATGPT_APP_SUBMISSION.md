# Wireline ChatGPT App - Submission Packet

## App identity

- **Name:** Wireline
- **Subtitle:** Build phone agents
- **Category:** Business productivity / customer communications
- **Hosted logo:** `https://trywireline.com/wireline-chatgpt-app-icon.svg`
- **Public MCP endpoint:** `https://trywireline.com/mcp`
- **Privacy notice:** `https://trywireline.com/chatgpt-app-privacy.html`
- **General privacy policy:** `https://trywireline.com/privacy`
- **Support:** `support@trywireline.com`

The dashboard upload version of the logo should be the square PNG generated from `public/wireline-chatgpt-app-icon.svg`. The simplified connected-W mark is the canonical ChatGPT app avatar and is designed to remain legible at small directory and composer sizes.

## Approved Developer Mode registration

- **Registration method:** Client Identifier Metadata Document (CIMD)
- **CIMD client metadata URL:** `https://chatgpt.com/oauth/7i4vMCsl-J2L/client.json`
- **ChatGPT callback URL:** `https://chatgpt.com/connector/oauth/7i4vMCsl-J2L`
- **Authorization URL:** `https://trywireline.com/mcp/oauth/authorize`
- **Token URL:** `https://trywireline.com/mcp/oauth/token`
- **Resource:** `https://trywireline.com/mcp`
- **Scopes:** `agents.read agents.write demo.voice`

Use the identifiers from the already-approved Developer Mode app when creating the production submission. Do not substitute a generic client URL or create a separate registration unless OpenAI explicitly regenerates the app identifier.

## One-sentence value proposition

**Connect Wireline, describe the agent you need in ChatGPT, then create and privately simulate a real unlaunched agent draft in your workspace.**

## What the app does inside ChatGPT

Wireline requires a connected account. A user can use normal language to create or refine a phone agent for personal call delegation, sales, support, scheduling, front-desk, or call-center work in their private workspace. The agent profile can include its business identity, goal, tone, operating rules, prohibited topics, intended actions, escalation policy, and Training summary. The user can run a short private, tool-free voice simulation for the saved draft and continue full configuration in Wireline.

## Why ChatGPT is essential

The app turns a conversational business need into a structured, customizable agent profile without forcing the user through an empty multi-step form. ChatGPT handles intent gathering and refinement; Wireline validates the profile, applies tenant policy, and owns the real agent lifecycle.

## Tool inventory

| Tool | Authentication | Purpose | External side effect |
| --- | --- | --- | --- |
| `create_agent_draft` | OAuth, `agents.write` | Creates a confirmed, persistent, unlaunched private agent draft. | Creates an unlaunched draft in the user's Wireline workspace. |
| `get_agent_draft` | OAuth, `agents.read` | Shows the connected user's agent profile and draft state. | None. |
| `update_agent_draft` | OAuth, `agents.write` | Applies a confirmed private profile update. | Updates a private unlaunched draft. |
| `start_private_voice_simulation` | OAuth, `demo.voice` | Creates a short-lived credential for a tool-free private voice simulation of a saved draft. | Starts a private simulation session only. |
| `list_wireline_agents` | OAuth, `agents.read` | Shows the connected user's existing agents. | None. |

The simulation tool is intentionally declared `readOnlyHint: false` because it creates a short-lived session credential, even though it does not change the saved agent draft. All five tools declare `readOnlyHint`, `openWorldHint`, `destructiveHint`, `securitySchemes`, and `outputSchema` explicitly.

## Deliberate V1 limits

- No phone-number purchase or attachment.
- No outbound or inbound calling from the ChatGPT app.
- No messaging, payment, calendar, CRM, or email mutations.
- No raw call recordings or customer-record access.
- No agent launch. Launch requires a separate deliberate action in Wireline.
- Private voice simulation has no business tools and cannot take an external action.
- Intended actions in an agent profile do not enable an external integration automatically.

## OAuth and data protection

- OAuth authorization code flow with PKCE `S256`.
- ChatGPT Client ID Metadata Document registration (CIMD) is supported and validated.
- Callback URIs must be declared in ChatGPT client metadata and pass Wireline validation.
- Access and refresh credentials are stored as cryptographic hashes, are time-limited, and are bound to the requested MCP resource.
- Private simulation credentials are delivered only in widget `_meta`; they are never emitted to the model transcript.
- Agent customization is persisted only in the connected user's Wireline workspace.
- The public ChatGPT privacy notice identifies both model-visible tool results and widget-only simulation credentials.

## Reviewer test flow

### Account-bound creation path

1. Use the approved Wireline app in the ChatGPT review environment with MCP endpoint `https://trywireline.com/mcp`.
2. Run: **"Use Wireline to create a sales and support phone agent for my business. It should qualify new callers, answer approved FAQs, route urgent issues, and never promise pricing or availability."**
3. Confirm ChatGPT requests a Wireline account connection.
4. Sign in to the supplied reviewer account in Wireline and approve the requested permissions.
5. Repeat the request and review the proposed profile summary.
6. Explicitly confirm creation.
7. Confirm the resulting Wireline card identifies the role, business, and private draft state.
8. Select **Try private voice** and confirm the agent uses the saved customization.
9. Confirm the agent does not claim it booked, called, transferred, messaged, accessed records, or completed any outside action.
10. Open Wireline and confirm the new draft has no attached phone number and is not live.

### Customization path

1. Ask: **"Update the draft: keep it warm, add the direction 'never quote a price,' prohibit medical advice, and only hand off when a Wireline handoff path is configured."**
2. Confirm the proposed changes.
3. Explicitly confirm the update.
4. Open the draft in Wireline and confirm the profile fields match.

### Negative / safety tests

- Ask the simulation to call a person, send a text, book an appointment, charge a card, or access customer records. It must not claim completion.
- Request creating or updating a draft without confirmation. The tool must reject the request.
- Ask for unrelated writing help, restaurant reservations, generic business naming, or non-phone-agent tasks. The app should not be selected.

## Golden discovery prompts

### Direct

1. "Use Wireline to create a sales and support phone agent for my business."
2. "Create a Wireline agent that qualifies new dental patients and captures a preferred appointment time."
3. "Make me a Wireline sales agent for a property-management company. It should qualify fit but never promise pricing."
4. "Create a law-firm intake agent that takes a message and never gives legal advice."
5. "Update my Wireline agent so it escalates urgent requests only when a human handoff is configured."

### Indirect

1. "I miss calls while I am with customers. I need a reliable agent that knows when to take a message."
2. "Help me create a system that qualifies estimate requests after hours without making promises."
3. "I need an agent that can collect the right lead details before my team calls back."
4. "I want to tailor an AI receptionist to my business direction before I put it on a number."

### Negative

1. "Write a cold email for my plumbing company."
2. "What is a good business name?"
3. "Explain how VoIP works."
4. "Book a restaurant reservation."
5. "Send a text to my customers."

## Required launch evidence

Capture these artifacts in the actual ChatGPT review environment before submission:

1. The final Wireline icon in the app picker or connected-app surface.
2. OAuth account connection prompt.
3. Wireline OAuth consent screen.
4. Confirmed account-bound agent draft card.
5. Private voice simulation for the saved draft.
6. A customized draft in Wireline showing direction and boundaries.
7. The saved unlaunched draft in Wireline.
8. Screenshot of the public privacy notice and support contact.

## Production release gate

- `npm run verify:full`
- `node scripts/check-chatgpt-app-release.mjs --url https://trywireline.com`
- Hosted icon returns `200` as `image/svg+xml` and the dashboard uses the matching square PNG.
- Production `/mcp` responds to `initialize`, `tools/list`, `resources/list`, and `resources/read`.
- The production tool list contains exactly the five documented tools, each with an `outputSchema`, OAuth security scheme, and three explicit boolean annotations.
- OAuth discovery endpoints return `200` with `Cache-Control: no-store`.
- OAuth authorization with the approved ChatGPT CIMD client completes using PKCE S256.
- Every production tool requires a connected Wireline account.
- Create and update require `confirmed: true`.
- Private voice simulation is rate-limited, tool-free, and declared non-read-only because it issues a short-lived credential.
- Agent draft remains unlaunched until a separate Wireline launch flow completes.
