# Wireline

Wireline is a horizontal AI voice + messaging agent platform. One fleet of agents handles inbound calls, outbound dialing, SMS, email, browser context, and follow-up for businesses and operators. It includes native iOS and Android apps, Wireline Command for browsers, and a ChatGPT app — all backed by the same protected assistant system.

## Key capabilities

- **Agents**: Customizable voice, SMS, and email agents with knowledge, instructions, tone, tools, and integrations.
- **Create → Train → Run**: Simple agent intake, first-class Training for sources and behavior, and a chat-first workroom for execution.
- **Voice**: Production calls through approved telephony and voice providers, with authenticated realtime voice sessions available for low-latency tests.
- **Wireline Command**: A Manifest V3 side-panel/sidebar command surface for Chrome, Edge, Opera, and Firefox. It deliberately brings the active page, selected text, or a linked phone number into Studio; it has no broad host permission, background harvesting, or copied credentials.
- **Native mobile**: iOS (SwiftUI + CallKit + widgets + App Intents + CarPlay plans) and Android (Jetpack Compose + Telecom + FCM + widgets) as thin, high-quality daily control surfaces.
- **ChatGPT App**: OAuth-connected, account-bound MCP tools for private drafting, refinement, and account-aware simulations.
- **Studio workspace**: Web workspace for building, training, reviewing, and operating agents at scale.
- **Infrastructure**: Postgres + Drizzle, RLS tenant isolation, Stripe billing, strong auth, rate limiting, and verification gates.

## Tech

- Web: React 19 + Vite, Express, TypeScript, Tailwind, and the Wireline Mono design system.
- API: Serverless-capable (Vercel), Drizzle ORM on Supabase Postgres.
- Browser: Manifest V3 command surface with Chromium and Firefox manifest overlays.
- Voice: Production voice provider integrations plus dedicated realtime test paths.
- Models: Managed model providers with fallback and override paths.
- Mobile: Native Kotlin/Compose and SwiftUI.

## Getting started

```bash
npm install
npm run dev          # Starts Vite + Express on http://localhost:3000
```

### Wireline Command

```bash
node apps/browser-extension/scripts/build.mjs --check
node apps/browser-extension/scripts/build.mjs
```

Load the generated target package from `apps/browser-extension/dist/chromium` or `apps/browser-extension/dist/firefox` for local browser testing. See `apps/browser-extension/README.md`.

## Verification (required before changes land)

```bash
npm run verify       # design check + build + server smoke
npm run verify:full  # lint + design + authz + csp + tests + build + smoke
node apps/browser-extension/scripts/build.mjs --check
node scripts/check-chatgpt-app-release.mjs --url https://trywireline.com
```

## Product and repository contracts

See:

- `CODEBASE_HEALTH.md` — guardrails, cleanup policy, deletion rules, and health standards
- `ARCHITECTURE.md` — system design and runtime flows
- `docs/CLIENT_SURFACES.md` — client ownership, repository boundaries, and staged extraction plan
- `docs/CHATGPT_APP.md` — ChatGPT App contract and release verification
- `docs/` — launch plans, SOC 2, SLAs, and operational references
- `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, and `src/styles/design-system.css` — visual truth

## Project status

Active development covers Create → Train → Run, Wireline Mono standardization, native mobile control surfaces, Wireline Command, ChatGPT App readiness, usage/balance foundations, and ongoing codebase health / legacy removal.

All changes must pass `npm run verify` (and full where applicable). Follow default-deny authz, Zod validation, structured logging, and source-of-truth discipline (`ai-models.ts`, schema, brand-colors, plan-catalog, etc.).

## License

Proprietary. © Wireline.
