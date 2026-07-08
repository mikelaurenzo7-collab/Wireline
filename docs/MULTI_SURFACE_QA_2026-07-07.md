# Multi-Surface QA — Extension, Native, ChatGPT

**Status:** Active · **Horizon:** 2 prep

Each surface has one job; no auth bypass.

| Surface | Job | QA ritual |
|---------|-----|-----------|
| Browser extension | Explicit page-context handoff → Studio | `node apps/browser-extension/scripts/build.mjs --check`; handoff redeem at `/studio/handoff` |
| iOS | Urgent owner control, CallKit, TCPA consent | `ios-simulator.yml` build; manual CallKit answer → handoff |
| Android | FCM push, outbound TCPA | `android-build.yml`; sign-in → push token registered |
| ChatGPT MCP | Account-bound drafting only | `tests/mcp-oauth-security-contract.test.ts`; live agents immutable via draft tools |

## Extension store

Chrome Web Store republish is manual after manifest bump (`apps/browser-extension/manifest.json`). Build gate: `verify:full` extension `--check`.

## Native API boundary

Clients use `/api/mobile/*` adapters only — never mount platform admin in native shells.
