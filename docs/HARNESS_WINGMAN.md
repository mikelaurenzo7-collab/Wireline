# Wireline Wingman (Harness)

Principal Harness Worker Agent for the Wireline monorepo.

## Harness scope

| Setting | Value |
|---------|--------|
| Account ID | `FHa6zrtNTJ6nAIiEys5E1A` |
| Org | `default` |
| Project | `default_project` |
| Agent UID | `wireline_wingman` |

## MCP auth fix (Cursor)

The Harness Cursor plugin uses **OAuth** at `https://mcp.harness.io/mcp`, not your PAT directly.

For REST/scripts, set:

```bash
HARNESS_API_KEY=pat.<your-token>
HARNESS_ACCOUNT_ID=FHa6zrtNTJ6nAIiEys5E1A
HARNESS_ORG=default
HARNESS_PROJECT=default_project
```

**Common mistake:** using the base64 delegate token (`ZjM1Yjkx...`) as account ID. That value is the **delegate token**, not the account. Your account ID is `FHa6zrtNTJ6nAIiEys5E1A` (also `defaultAccountId` from `/ng/api/user/currentUser`).

## Docker delegate (from harness-docker-runner)

```bash
sh script.sh FHa6zrtNTJ6nAIiEys5E1A ZjM1YjkxMmJlMGQ1NTJiYTJjMGY5YzdmZTU3YmRjZDI= 26.06.89303
```

- Arg 1: **Account ID**
- Arg 2: **Delegate token** (base64)
- Arg 3: Delegate image version

On Windows, the delegate container must run on Linux/macOS; the script installs `harness-docker-runner` locally and prints a `docker run` command for a remote host.

## Prerequisites (one-time in Harness UI)

1. **GitHub connector** — already present: `mikelaurenzo7collab` → `mikelaurenzo7-collab/Wireline`
2. **LLM connector (required)** — AI → Connectors → add Anthropic/Bedrock/OpenAI connector; assign at agent run time
3. **Harness MCP** — use built-in `harness_hosted_mcp` or create MCP connector pointing to `https://unifiedpipeline.harness.io/mcp-server-external/mcp` with `X-Api-Key` secret
4. **Secrets** (project scope):
   - `VERCEL_TOKEN` — Vercel deploy/preview
   - `GITHUB_ACCESS_TOKEN` — already referenced by GitHub connector
   - `HARNESS_PAT` — optional, for MCP connector header

## Bootstrap script

```bash
HARNESS_API_KEY=pat.... node scripts/harness-wireline-wingman-bootstrap.mjs
```

Creates:

- Environments: `wireline_dev`, `wireline_preview`, `wireline_prod`
- Agent: `wireline_wingman`

## Run the agent

Harness UI → **AI** → **Worker Agents** → **Wireline Wingman** → run in a pipeline, or reference in a CI pipeline Agent step.

## Verify

```bash
curl -s -H "x-api-key: $HARNESS_API_KEY" \
  "https://app.harness.io/gateway/agents/api/v1/agents?accountIdentifier=FHa6zrtNTJ6nAIiEys5E1A&orgIdentifier=default&projectIdentifier=default_project"
```
