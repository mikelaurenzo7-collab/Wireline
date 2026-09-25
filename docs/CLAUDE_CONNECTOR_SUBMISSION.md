# BotBound Claude Connector - Submission Packet

## Listing identity

- **Name:** BotBound (max 100)
- **Tagline:** Build your first Bot (20 / 55)
- **Slug:** `wireline` (permanent once published)
- **Categories:** business, productivity
- **Icon:** `https://botbound.app/botbound-icon-512.png`
- **Docs:** `https://botbound.app/claude-connector.html`
- **Privacy:** `https://botbound.app/mcp-privacy.html`
- **Support:** `support@botbound.app`
- **Company:** BotBound / `https://botbound.app`

Machine-readable copy lives in `claude-connector-submission.json`.

## Server

- **URL:** `https://botbound.app/mcp`
- **Transport:** streamable HTTP
- **URL mode:** same URL for every user
- **Auth:** OAuth DCR and CIMD (`oauth_dcr` and `oauth_cimd`)
- **Lazy auth:** yes. List and initialize are public; tool calls challenge with HTTP 401
- **Allowed link URIs:** `https://botbound.app` only (owned origin)

## Portal access

Remote MCP submissions happen only inside Claude.ai:

`https://claude.ai/admin-settings/directory/submissions/new`

Required:

- A **Team or Enterprise** organization. Individual plans cannot open admin settings.
- **Owner**, **Primary owner**, or a custom Enterprise role with the **Directory** permission.

Desktop-extension (MCPB) and plugin forms are the wrong path for this server.

## Reviewer test account

Anthropic requires a fully populated account. Do not invent credentials in git. The founder supplies:

- Sign-in URL `https://botbound.app/signin`
- Email and password for a workspace that already has at least one agent draft, an assigned number if available, and connected or disconnected text/email state that makes the workspace summary meaningful
- No MFA on the reviewer account
- Confirmation that the account may be used only for directory review

## MCP App screenshots

Required for MCP Apps: **3-5 PNG images, width at least 1000px**, cropped to the **app response only** (no prompt). Pair each image with the prompt text. Video/GIF is rejected. Do not commit screenshots to the repository; capture them from a Claude conversation after connecting `https://botbound.app/mcp` as a custom connector.

Suggested captures, matching `claude-connector-submission.json`:

1. Confirmed after-hours receptionist draft card
2. Updated draft boundaries card
3. Workspace summary aggregates
4. Private voice controls on the draft card
5. Private text rehearsal that states it is not a live call

Use the [MCP Apps Figma community file](https://www.figma.com/community/file/1597641111449594397/mcp-apps-for-claude) if a carousel template is needed.

## Policy acknowledgments

The portal requires seven acknowledgments: directory guidelines, first-party API usage, no financial-asset transfer, no AI image/video/audio generation as the product, no prompt injection, no extra conversation-data collection, and public documentation. BotBound tools call first-party BotBound APIs. Private voice simulation uses OpenAI Realtime as an implementation detail of a tool-free draft rehearsal, not an image/video generator.

## Escalation

`mcp-review@anthropic.com`

After submit, track status at `https://claude.ai/admin-settings/directory/submissions`.

## Canonical Anthropic docs used

Connector Directory:

- https://claude.com/docs/connectors/building/submission
- https://claude.com/docs/connectors/building/authentication
- https://claude.com/docs/connectors/building/mcp
- https://claude.com/docs/connectors/building/lazy-authentication
- https://claude.com/docs/connectors/building/enterprise-managed-auth
- https://claude.com/docs/connectors/building/review-criteria
- https://claude.com/docs/connectors/building/after-publishing
- https://claude.com/docs/connectors/building/managing-your-listing
- https://claude.com/docs/connectors/building/testing
- https://claude.com/docs/connectors/building/troubleshooting
- https://claude.com/docs/connectors/building/what-to-build
- https://claude.com/docs/connectors/building/directory-vs-custom
- https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy
- https://support.claude.com/en/articles/13145338-anthropic-software-directory-terms

MCP Apps:

- https://claude.com/docs/connectors/building/mcp-apps/getting-started
- https://claude.com/docs/connectors/building/mcp-apps/design-guidelines
- https://claude.com/docs/connectors/building/mcp-apps/transparent-theming
- https://claude.com/docs/connectors/building/mcp-apps/cross-compatibility
- https://claude.com/docs/connectors/building/mcp-apps/external-links
- https://claude.com/docs/connectors/building/mcp-apps/instance-supersession
- https://claude.com/docs/connectors/building/mcp-apps/troubleshooting
- https://modelcontextprotocol.github.io/ext-apps/api/documents/Migrate_OpenAI_App.html
- https://modelcontextprotocol.github.io/ext-apps/api/documents/Quickstart.html

Claude Code CIMD: https://claude.ai/oauth/claude-code-client-metadata
