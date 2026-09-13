# BotBound

BotBound is the operating layer for **your Bot across calls, texts, and email**. Start with one trained Bot or build a coordinated roster that can book appointments, revive leads, promote offers, recover opportunities, answer demand, text outcomes, draft follow-up, and surface the right work across web, mobile, browser, and ChatGPT.

The public operating loop is **Build -> Train -> Launch -> Improve**. After create, the setup guide is **Train -> Test -> Launch**. Product architecture expresses that loop through Create, Training, Wire, and Studio:

1. **Create / Build** a focused Bot quickly.
2. **Train** it with facts, sources, policies, voice, tone, tools, and workflows.
3. **Wire / Launch** it to an included number slot, integrations, routing, approvals, and billing controls.
4. **Studio / Improve** operates calls, texts, follow-up, approvals, handoffs, review, and iteration from real outcomes.

## Product surface

- **Web/API - live:** canonical Create, Training, Wire, Studio, billing, provider, and account runtime.
- **BotBound Command - early access:** explicit-action Manifest V3 browser handoff for page context, calls, texts, follow-up, and tasks. Technical package paths retain the `wireline` namespace for compatibility.
- **ChatGPT / Claude / Cursor - early access:** OAuth-connected, account-bound MCP tools. Cursor Directory packaging is `.mcp.json` at the repo root. Create an account, draft the first Bot, privately rehearse, then continue in BotBound.
- **iOS - planned:** native calls, Siri, widgets, CallKit, push, and urgent owner controls; TestFlight and App Store release remain gated.
- **Android - internal beta:** native calls, notifications, widgets, Telecom, FCM, and urgent owner controls; Play release remains gated.
- **Identity - retired live talking-head:** identity badges stay on every Bot. Video files and clip-script substitutes are not offered. LiveAvatar / HeyGen sessions are not minted.

Every **active paid Bot gets a dedicated production number and BotBound-managed email identity**, up to plan capacity. Draft Bots stay private until activation; unused Bot capacity does not pre-provision carrier numbers. See `src/lib/plan-catalog.ts` for the commercial contract.

## Technology and ownership

- **Web/API:** React 19, Vite, Express, TypeScript, Tailwind, Drizzle ORM, Supabase Postgres, and a Vercel-capable server bundle.
- **Design:** the **BotBound Letterpress design system**, generated from shared Aurora tokens for web, browser, iOS, and Android. Technical token filenames retain the `wireline` namespace.
- **Managed reasoning:** OpenAI GPT-5.6 Terra primary with Vercel AI Gateway and Gemini continuity in `src/lib/ai-models.ts`; provider names and model versions are not duplicated across repository overview docs.
- **Voice/PSTN:** OpenAI Realtime owns authenticated Studio/ChatGPT rehearsals, founder-owned internal Bot profiles, and every customer phone conversation. Public voice previews are retired. Twilio owns carrier transport, numbers, SIP, and SMS. There is no alternate call runtime.
- **Browser:** explicit-user-action context handoff only. No broad host permissions, silent browsing, token storage, or background page harvesting.
- **Native:** SwiftUI/XcodeGen for iOS and Kotlin/Compose for Android. Clients remain thin adapters over server-owned policy.
- **Security:** server-owned authorization, provider credentials, billing, webhooks, tenant-scoped data access, CSP checks, rate limits, and verification gates.

## Getting started

```bash
npm install
npm run dev          # Vite + Express on http://localhost:3000
```

### BotBound Command

```bash
node apps/browser-extension/scripts/build.mjs --check
node apps/browser-extension/scripts/build.mjs
```

Load `apps/browser-extension/dist/chromium` or `apps/browser-extension/dist/firefox` for local testing. See `apps/browser-extension/README.md`.

## Verification

```bash
npm run check-prod-env
npm run source-control:check
npm run docs:check
npm run verify
npm run verify:full
npm run verify:contracts
node apps/browser-extension/scripts/build.mjs --check
node scripts/check-chatgpt-app-release.mjs --url https://botbound.me
```

Use `npm run verify` for focused implementation branches. Use `npm run verify:full` before merge/release or any change touching auth, billing, CSP, routes, data access, provider integrations, shared runtime contracts, migrations, or production environment shape.

## Repository map

| Concern                               | Source of truth                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contribution workflow                 | [CONTRIBUTING.md](./CONTRIBUTING.md)                                                                                                                 |
| Repository health                     | [CODEBASE_HEALTH.md](./CODEBASE_HEALTH.md)                                                                                                           |
| Architecture                          | [ARCHITECTURE.md](./ARCHITECTURE.md)                                                                                                                 |
| Public positioning and creative proof | [docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md](./docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md)                                                             |
| Documentation map                     | [docs/README.md](./docs/README.md)                                                                                                                   |
| Audit evidence                        | [docs/AUDIT_INDEX.md](./docs/AUDIT_INDEX.md)                                                                                                         |
| Client/release boundaries             | [docs/CLIENT_SURFACES.md](./docs/CLIENT_SURFACES.md)                                                                                                 |
| Pricing and billing                   | `src/lib/plan-catalog.ts`, `src/lib/conversation-balance.ts`, [docs/business-usage-pricing-decision.md](./docs/business-usage-pricing-decision.md)   |
| Design system                         | `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css`                                                |
| Voice and model policy                | `src/lib/ai-models.ts`, `src/lib/voice/`, [docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md](./docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md) |
| Browser extension                     | `apps/browser-extension/`                                                                                                                            |
| Native clients                        | `ios/`, `android/`                                                                                                                                   |
| ChatGPT App                           | `src/routes/chatgpt-mcp-*`, `src/lib/chatgpt-mcp-*`, `api/mcp.ts`, [docs/CHATGPT_APP.md](./docs/CHATGPT_APP.md)                                      |
| Cursor Directory                      | `.mcp.json`, `plugin.json`, `mcp.json`, [docs/CURSOR_PLUGIN.md](./docs/CURSOR_PLUGIN.md)                                                             |
| Tests and checks                      | `tests/`, `scripts/check-*.mjs`, `scripts/generate-authz-matrix.ts`                                                                                  |

## Repository hygiene

- Do not commit generated screenshots, visual-QA output, local agent artifacts, exported environments, provider payloads, temporary patches, coverage, Playwright output, build output, or asset bundles.
- Link every durable `docs/**/*.md` file from exactly one documentation index.
- Do not create parallel design systems, duplicate source-of-truth files, or temporary `*-v2` migration wrappers.
- Keep credentials, user data, billing, webhook validation, authorization, and tenant-scoped reads server-owned.

## License

Proprietary. Copyright BotBound.
