---
name: wireline-voice-agent
description: Help a new user create a Wireline account and build their first voice agent through the remote MCP server at https://trywireline.com/mcp. Use when the user wants a receptionist, scheduler, sales, or support voice agent from Cursor, ChatGPT, or Claude.
---

# Wireline first voice agent

Wireline is an account-bound remote MCP server. There is no anonymous demo and no API key in this plugin. The host client performs OAuth. New users create a Wireline account during that consent flow, then return to authorize the client.

This plugin is not a software development kit for embedding Wireline voice agents in another repository. People who want that can write their own integration against public docs. The job here is to obtain a real Wireline account and help the user build their first agent in the chat they already have open.

## Connect

1. Enable the Wireline MCP server from this plugin (`https://trywireline.com/mcp`).
2. Complete OAuth. If the user has no account, they sign up at Wireline first. The `redirect` query on `/signup` returns them to the authorization screen.
3. After Connect succeeds, call tools. Unauthenticated `tools/call` returns HTTP 401 so the host can show Connect.

## First-agent workflow

1. Discover the job in conversation: receptionist, scheduler, sales, or support.
2. Call `list_wireline_agents` once. If the workspace is empty, this is a first-agent session.
3. Summarize identity, goal, rules, prohibited topics, and escalation. Call `create_agent_draft` only after explicit confirmation.
4. Privately rehearse with `run_private_agent_turn` or `start_private_voice_simulation`.
5. Point the user at `open_in_wireline_url` to attach a number and launch in Wireline.

## Tools

| Tool | When to use |
| --- | --- |
| `create_agent_draft` | User confirmed their first (or next) private, unlaunched draft. |
| `get_agent_draft` | Read one private draft. Fails if the agent is already on the phone network. |
| `update_agent_draft` | User confirmed a private draft change. |
| `list_wireline_agents` | See whether the workspace already has an agent. |
| `get_wireline_agent_status` | Next step, whether a number is attached, and Wireline deep links. Never returns the number itself. |
| `get_wireline_workspace_summary` | Aggregate counts only. No customer identities or message bodies. |
| `get_agent_coaching_brief` | Read owner-authored Training facts and rules to gameplan. |
| `train_wireline_agent` | Persist a confirmed fact or rule into Wireline Training. Requires the Apps toggle. |
| `start_private_voice_simulation` | Short tool-free voice rehearsal of a saved draft. |
| `run_private_agent_turn` | Private text rehearsal. No live call or customer message. |

Create, update, rehearsal, and Training writes require `confirmed: true` only after you summarize the change and the user explicitly agrees.

## Training that lands in Wireline

`train_wireline_agent` fails closed until the account holder enables **Allow connected apps to save Training** in Wireline Apps. If the tool says the toggle is off, send the user to `/settings/apps#chatgpt-mcp`. Do not invent a workaround.

## Triggering an agent

From Cursor, ChatGPT, or Claude, "trigger" means a **private rehearsal** of an agent the user owns:

- Voice: `start_private_voice_simulation`
- Text: `run_private_agent_turn` with the customer's hypothetical line

Do not claim a live call, SMS, email, booking, payment, number purchase, or launch happened. Those stay in Wireline Studio, Training, and Wire.

## Never

- Invent prices, availability, or customer records.
- Ask for provider API keys. Wireline owns credentials.
- Place or describe a live outbound call from this plugin.
- Treat this plugin as a repo-embedded voice SDK.
- Skip confirmation on create, update, rehearsal, or Training writes.
