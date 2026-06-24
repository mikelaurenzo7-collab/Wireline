# Wireline ChatGPT App

## Product promise

**Describe a phone agent in ChatGPT, speak with it privately, then save the finished draft to Wireline when it is worth keeping.**

This is not a passive dashboard integration. It is an acquisition and activation loop:

1. A guest describes a receptionist, scheduler, sales, or customer-service agent in natural language.
2. `start_agent_demo` returns an inline Wireline Agent Preview card.
3. The user can start a short, tool-free Realtime voice preview from the card when the ChatGPT widget surface grants microphone access.
4. The card's **Save to Wireline** action requests OAuth account connection.
5. A confirmed save creates a durable **unlaunched** Wireline agent draft. Phone numbers, call routing, external actions, and launch are not implicit.

## Public endpoints

| Endpoint | Purpose |
| --- | --- |
| `https://trywireline.com/mcp` | Streamable HTTP MCP endpoint |
| `https://trywireline.com/.well-known/oauth-protected-resource` | OAuth protected-resource metadata |
| `https://trywireline.com/.well-known/oauth-authorization-server` | Wireline authorization-server metadata |
| `https://trywireline.com/mcp/oauth/authorize` | OAuth authorization + consent screen |
| `https://trywireline.com/mcp/oauth/token` | OAuth authorization-code and refresh-token exchange |

## Tool contract

| Tool | Audience | Effect |
| --- | --- | --- |
| `start_agent_demo` | Guest | Creates a signed, one-hour demo state. No durable data. |
| `create_demo_voice_session` | Preview widget only | Mints a short-lived, tool-free Realtime credential. No business-system access. |
| `save_demo_to_wireline` | Connected Wireline user | Creates an unlaunched agent draft after `confirmed: true`. |
| `list_wireline_agents` | Connected Wireline user | Reads only that user's agent roster. |

### Explicit non-goals for V1

- No phone-number purchase or attachment.
- No outbound calling from the ChatGPT App.
- No messaging, payments, calendar mutations, or CRM writes.
- No access to call recordings or raw customer data in the guest experience.
- No live launch without a separate confirmation inside Wireline.

This is intentional. The guest experience establishes value safely; Wireline remains the system of record for deployment and operations.

## Required Vercel environment variables

Do not place values in Git or Google Drive.

```bash
# Separate, random server secrets. Generate each with: openssl rand -base64 48
MCP_DEMO_STATE_SECRET=
MCP_OAUTH_TOKEN_PEPPER=

# Exact values supplied by the ChatGPT Developer Mode / app registration flow.
# Comma-separated only when multiple environments are intentionally registered.
MCP_OAUTH_ALLOWED_CLIENT_IDS=
MCP_OAUTH_ALLOWED_REDIRECT_URIS=

# Existing values
APP_URL=https://trywireline.com
OPENAI_API_KEY=

# Used for guest ChatGPT-App Realtime preview when present. Falls back to OPENAI_API_KEY.
OPENAI_API_KEY_CHATKIT=
```

### Secret ownership

- `OPENAI_API_KEY`: existing Wireline production runtime key.
- `OPENAI_API_KEY_CHATKIT`: guest ChatGPT-App voice-preview and future in-product ChatKit budget boundary.
- `MCP_DEMO_STATE_SECRET`: signs temporary demo specifications; rotation invalidates outstanding previews.
- `MCP_OAUTH_TOKEN_PEPPER`: hashes OAuth codes and tokens; rotation invalidates existing ChatGPT connections.

## Private Developer Mode rollout

1. Deploy this branch to a Vercel Preview environment.
2. Open ChatGPT on the web and create a developer-mode app using the preview URL plus `/mcp`.
3. Copy the exact `client_id` and redirect URI required by the ChatGPT registration into the preview environment's `MCP_OAUTH_ALLOWED_CLIENT_IDS` and `MCP_OAUTH_ALLOWED_REDIRECT_URIS` values.
4. Add the same values to Production only after the preview flow passes.
5. In ChatGPT, exercise the golden prompts below.
6. Verify that guest save attempts trigger OAuth, and that a successful consent creates only an unlaunched draft.
7. Capture screenshots of the card, OAuth consent screen, account-link success, and saved draft for the eventual app submission.

## Golden prompts

### Direct prompts

1. "Use Wireline to build a missed-call receptionist for my HVAC company."
2. "Create a Wireline agent that qualifies new dental patients and collects their preferred appointment time."
3. "Make me a Wireline sales assistant for a property-management company."
4. "I want to hear how an AI receptionist for my law firm would answer a new caller."
5. "Save this Wireline agent so I can test it on my phone later."

### Indirect prompts

1. "I miss calls while I am with customers. I need something that can answer professionally."
2. "Help me create a system that books estimate requests after hours."
3. "I need a better way to qualify inbound leads without hiring another receptionist."
4. "Can I talk to an AI agent before I put it on my business number?"
5. "I need a scheduler that knows when to take a message instead of making promises."

### Negative prompts

The app should not be selected for generic questions that lack a phone-agent task, such as:

- "Write a cold email for my plumbing company."
- "What is a good business name?"
- "Explain how VoIP works."
- "Book a restaurant reservation."
- "Send a text to my customers."

## Acceptance criteria

- A guest can create a preview without an account.
- The preview card is concise, mobile-safe, and has no nested scrolling.
- The voice button never exposes an OpenAI credential to the model transcript; the ephemeral session is returned only in widget metadata.
- Guest voice agents have no tools and cannot imply they completed an external action.
- Saving requires OAuth plus an explicit `confirmed: true` tool call.
- Saving creates an agent with draft semantics only.
- All OAuth authorization-code exchanges use PKCE `S256` and all persisted bearer credentials are hashed.
- OAuth client ID and redirect URI are exact allowlist matches.

## ChatKit relationship

ChatKit is for Wireline's own authenticated Director/assistant composer. MCP Apps are for the app that runs inside ChatGPT. They may share Wireline agent configuration, policy primitives, and tool services, but they must remain separate transports and separate user experiences.
