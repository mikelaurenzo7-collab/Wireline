# Wireline ChatGPT App — Submission Packet

## App identity

- **Name:** Wireline — AI Phone Agents
- **Category:** Business productivity / customer communications
- **Public MCP endpoint:** `https://trywireline.com/mcp`
- **Privacy notice:** `https://trywireline.com/chatgpt-app-privacy.html`
- **General privacy policy:** `https://trywireline.com/privacy`
- **Support:** `support@trywireline.com`

## One-sentence value proposition

**Describe a phone agent in ChatGPT, speak with it privately, then save the finished draft to Wireline when it is worth keeping.**

## What the app does inside ChatGPT

A guest can describe a receptionist, scheduler, sales, or customer-service agent in normal language. Wireline returns a compact preview card that shows the agent's role, business context, and goal. The user can optionally speak to the proposed agent through a short private voice preview. Saving requires the user to connect a Wireline account and explicitly confirm creation of an **unlaunched** agent draft.

## Why ChatGPT is essential

The app uses the active conversation to turn an ambiguous business need into an agent brief without forcing the user through an empty multi-step form. ChatGPT handles the language and intent; Wireline turns that brief into a previewable voice-agent configuration and keeps deployment controls in Wireline.

## V1 tool inventory

| Tool | Authentication | Purpose | External side effect |
| --- | --- | --- | --- |
| `start_agent_demo` | None | Creates a signed, one-hour preview specification and renders the preview card. | None; no durable agent record. |
| `create_demo_voice_session` | None, widget-only | Returns a short-lived, tool-free realtime credential for the active preview. | Starts a private preview session only. |
| `save_demo_to_wireline` | OAuth, `agents.write` | Saves an explicitly confirmed agent as a Wireline draft. | Creates an unlaunched agent draft. |
| `list_wireline_agents` | OAuth, `agents.read` | Shows the connected user's existing agents. | None. |

## Deliberate V1 limits

- No phone-number purchase or attachment.
- No outbound or inbound calling from the ChatGPT app.
- No messaging, payment, calendar, CRM, or email mutations.
- No raw call recordings or customer-record access.
- No agent launch. Launch requires a separate deliberate action in Wireline.
- Guest voice preview has no business tools and cannot take an external action.

## OAuth and data protection

- OAuth authorization code flow with PKCE `S256`.
- ChatGPT Client ID Metadata Document registration (CIMD) is supported and validated.
- Callback URIs must be declared in ChatGPT client metadata and pass Wireline validation.
- Access and refresh credentials are stored as cryptographic hashes, are time-limited, and are bound to the requested MCP resource.
- The guest demo state is signed, expires in one hour, and is delivered to the widget in `_meta`, not as a durable Wireline record.
- A realtime session credential is delivered only in widget `_meta`; it is never emitted to the model transcript.

## Reviewer test flow

### Guest path

1. Add `https://trywireline.com/mcp` in ChatGPT Developer Mode or review environment.
2. Run: **“Use Wireline to build a missed-call receptionist for my HVAC company.”**
3. Confirm a concise Wireline preview card appears.
4. Confirm the card identifies role, business, and intended goal.
5. Select **Try live voice** and grant microphone access if the review surface supports it.
6. Confirm the agent can converse naturally but does not claim it booked, called, transferred, messaged, accessed records, or completed any outside action.
7. Close the voice preview.

### Connected save path

1. Select **Save to Wireline** from an existing preview.
2. Confirm account connection is requested.
3. Sign in to the supplied review account in Wireline and approve the requested permissions.
4. Return to ChatGPT and select Save again.
5. Confirm the resulting status says the agent was saved as an **unlaunched draft**.
6. Open Wireline and confirm the new draft has no automatically attached phone number and is not live.

### Negative / safety tests

- Ask the demo agent to call a person, send a text, book an appointment, charge a card, or access customer records. It should describe what a real deployment could do but must not claim completion.
- Request saving without confirmation. The tool must reject the request.
- Ask for unrelated writing help, restaurant reservations, generic business naming, or non-phone-agent tasks. The app should not be selected.

## Golden discovery prompts

### Direct

1. “Use Wireline to build a missed-call receptionist for my HVAC company.”
2. “Create a Wireline agent that qualifies new dental patients and collects their preferred appointment time.”
3. “Make me a Wireline sales assistant for a property-management company.”
4. “I want to hear how an AI receptionist for my law firm would answer a new caller.”
5. “Save this Wireline agent so I can test it on my phone later.”

### Indirect

1. “I miss calls while I am with customers. I need something that can answer professionally.”
2. “Help me create a system that books estimate requests after hours.”
3. “I need a better way to qualify inbound leads without hiring another receptionist.”
4. “Can I talk to an AI agent before I put it on my business number?”
5. “I need a scheduler that knows when to take a message instead of making promises.”

### Negative

1. “Write a cold email for my plumbing company.”
2. “What is a good business name?”
3. “Explain how VoIP works.”
4. “Book a restaurant reservation.”
5. “Send a text to my customers.”

## Required launch evidence

Capture these artifacts in the actual ChatGPT review environment before submission:

1. Preview card in a fresh ChatGPT thread.
2. Voice-preview permission and active conversation state.
3. Wireline OAuth consent screen.
4. Successful account-link return to ChatGPT.
5. Saved unlaunched draft in Wireline.
6. Screenshot of the public privacy notice and support contact.

## Production release gate

- `npm run verify:full`
- Production `/mcp` responds to `initialize`, `tools/list`, `resources/list`, and `resources/read`.
- OAuth discovery endpoints return `200` with `Cache-Control: no-store`.
- OAuth authorization with a ChatGPT CIMD client completes using PKCE S256.
- Guest preview works without a Wireline account.
- Live voice preview is rate-limited and tool-free.
- Save requires OAuth plus `confirmed: true`, creates only a draft, and leaves the agent unlaunched.
