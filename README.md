# Wireline

Wireline is a horizontal AI voice + messaging agent platform. One fleet of assistants handles inbound calls, outbound dialing, SMS, and email for businesses, with a live supervisor experience and self-improvement capabilities. It includes native iOS and Android apps focused on personal daily assistance, a privacy-minimal browser companion, and a ChatGPT app—all backed by the same protected assistant system.

## Key capabilities

- **Assistants**: Highly customizable voice, SMS, and email assistants with knowledge, instructions, tone, tools, and integrations (calendars, CRM, email).
- **Voice**: Production calls via Vapi/Twilio. Authenticated realtime voice sessions powered by xAI Grok for low-latency interactive tests.
- **Browser Companion**: A Manifest V3 side-panel/sidebar companion for Chrome, Edge, Opera, and Firefox. It deliberately brings the active page, selected text, or a linked phone number into Studio; it has no broad host permission, background harvesting, or copied credentials.
- **Native mobile**: iOS (SwiftUI + CallKit + widgets + App Intents + CarPlay plans) and Android (Jetpack Compose + Telecom + FCM + widgets) as thin, high-quality personal control surfaces.
- **ChatGPT App**: OAuth-connected, account-bound MCP tools for private draft creation, refinement, and tool-free voice simulations—never phone provisioning, launch, or external actions.
- **Studio & Director**: Web workspace for building, training, reviewing, and operating assistants at scale.
- **Infrastructure**: Postgres + Drizzle, RLS tenant isolation, Stripe billing, strong auth, rate limiting, and verification gates.

## Tech

- Web: React 19 + Vite, Express, TypeScript, Tailwind + Ametrine Precision design system.
- API: Serverless-capable (Vercel), Drizzle ORM on Supabase Postgres.
- Browser: Manifest V3 companion with Chromium and Firefox manifest overlays.
- Voice: Vapi + ElevenLabs + xAI Grok realtime.
- Models: Managed OpenAI (primary for many paths) + Gemini fallback + OpenRouter overrides + dedicated Grok realtime.
- Mobile: Native Kotlin/Compose and SwiftUI.

## Getting started

```bash
npm install
npm run dev          # Starts Vite + Express on http://localhost:3000
```

### Browser Companion

```bash
node apps/browser-extension/scripts/build.mjs --check
node apps/browser-extension/scripts/build.mjs
```

Load the generated target package from `apps/browser-extension/dist/chromium` or `apps/browser-extension/dist/firefox` for local browser testing. See `apps/browser-extension/README.md`.

## Verification (required before changes land)

```bash
npm run verify       # build + server smoke (fast)
npm run verify:full  # lint + authz + csp + tests + build + smoke
node apps/browser-extension/scripts/build.mjs --check
node scripts/check-chatgpt-app-release.mjs --url https://trywireline.com
```

## Product and repository contracts

See:

- `AGENTS.md` — design system rules (Ametrine Precision), implementation guidance, and contributor rules
- `CODEBASE_HEALTH.md` — guardrails, cleanup policy, deletion rules, and health standards
- `ARCHITECTURE.md` — system design and runtime flows
- `docs/CLIENT_SURFACES.md` — client ownership, repository boundaries, and staged extraction plan
- `docs/CHATGPT_APP.md` — ChatGPT App contract and release verification
- `docs/` — launch plans, SOC 2, SLAs, and operational references
- `src/constants/brand-colors.ts` and `src/styles/design-system.css` — single source of visual truth

## Project status

Active development covers Grok realtime voice, agent customizability, Ametrine Precision design standardization, native mobile foundations, the browser companion, ChatGPT App submission readiness, and ongoing codebase health / legacy removal.

All changes must pass `npm run verify` (and full where applicable). Follow default-deny authz, Zod validation, structured logging, and source-of-truth discipline (`ai-models.ts`, schema, brand-colors, plan-catalog, etc.).

## License

Proprietary. © Wireline.
