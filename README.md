# Wireline

Wireline is the agent operating layer for AI employees — profit-moving calls, texts, follow-up, browser context, email, and integrations. One trained fleet of AI employees can book appointments, revive leads, promote offers, recover opportunities, answer demand, text outcomes, draft follow-up, and surface the right work across web, mobile, browser, and ChatGPT.

The current product doctrine is simple. The customer-facing product loop is **Create -> Train -> Run**; operationally, Wire sits between Train and Run:

1. **Create** a focused AI employee quickly.
2. **Train** it deeply with facts, sources, policies, voice, tone, tools, and workflows.
3. **Wire** it to an included number, integrations, routing, approvals, and billing controls.
4. **Run** it in Studio, where calls, texts, follow-up, approvals, handoffs, and review happen.

## Key capabilities

- **AI employees**: Customizable voice, SMS, email, and follow-up agents for appointments, lead revival, promotions, recovery, inbound conversion, and support overflow.
- **Included numbers**: Every included agent gets an included number so the role can call out, receive callbacks, and become a reachable operating asset.
- **Create -> Train -> Wire -> Run**: Short intake, first-class Training, deliberate wiring, and a chat-first Studio workroom.
- **Voice**: Production calls through approved telephony and voice providers, with authenticated realtime test paths for low-latency validation.
- **Video presenters**: Optional live visual presenter layer for business agents; customer surfaces keep vendor names hidden and preserve a Wireline face fallback.
- **Wireline Command**: Manifest V3 side-panel/sidebar command surface for Chrome, Edge, Opera, and Firefox. It brings active-page context into Studio only by explicit user action.
- **Native mobile**: iOS and Android as thin, high-quality control surfaces for calls, approvals, notifications, widgets, and daily review.
- **ChatGPT App**: OAuth-connected, account-bound MCP tools for private drafting, refinement, simulation, and account-aware workflows.
- **Infrastructure**: Postgres + Drizzle, server-owned data access, RLS tenant isolation, Stripe billing, authz checks, CSP checks, rate limiting, and verification gates.

## Tech

- **Web / API**: React 19, Vite, Express, TypeScript, Tailwind, Drizzle ORM, Supabase Postgres, Vercel-capable server bundle.
- **Design**: The Wireline Letterpress design system — Letterpress tokens, brand colors, generated platform tokens, and `src/styles/design-system.css` as the visual source of truth.
- **Browser**: Manifest V3 command surface with Chromium and Firefox manifest overlays.
- **Managed runtime**: direct OpenAI Responses API primary (GPT-5.6 Terra default), Gemini as the first automatic fallback, and the Vercel AI Gateway as the governed multi-model continuity route; direct xAI structured use stays an explicit opt-in experiment (`src/lib/ai-client.ts`, `src/lib/ai-models.ts`).
- **Voice / realtime**: Twilio + Vapi own production PSTN calls (OpenAI GPT-4o managed call model with Gemini fallback); the xAI Grok realtime voice contract powers authenticated live-voice test and simulation sessions, OpenAI Realtime powers the guest voice demo, and neither realtime test surface ever takes over customer PSTN calls (`src/lib/voice/`, `docs/GROK_LIVE_VOICE.md`).
- **Video**: HeyGen/LiveAvatar SDK-backed presenter infrastructure wrapped behind Wireline-owned copy and consent states.
- **Mobile**: Native Kotlin/Compose and SwiftUI.

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

## Verification before changes land

```bash
npm run check-prod-env
npm run verify       # design + source-control + routes + docs + openapi + token parity + Stripe + build + smoke
npm run verify:full  # type check + audit-modules type check + server lint + eslint + everything in verify + authz + CSP + runtime-policy + api-error + security audit + tests + browser-extension
npm run verify:contracts
node apps/browser-extension/scripts/build.mjs --check
node scripts/check-chatgpt-app-release.mjs --url https://trywireline.com
```

Use `npm run verify` for focused implementation branches and `npm run verify:full` before merge, release, or anything touching auth, billing, CSP, routes, data access, provider integrations, shared runtime contracts, or production environment shape.

## Repository map

| Area | Source of truth |
| --- | --- |
| Repo health | `CODEBASE_HEALTH.md`, `docs/REPO_HEALTH_AUDIT_2026-07-04.md`, `docs/EXCLUDED_SURFACES_AUDIT_2026-07-06.md` |
| Architecture | `ARCHITECTURE.md`, `src/server/register-api-routes.ts`, `src/routes/AppRoutes.tsx` |
| Product docs | `docs/README.md`, `docs/CLIENT_SURFACES.md`, `docs/CHATGPT_APP.md`, `docs/PRODUCT_SHOWCASE_MATRIX.md`, `docs/WIRELINE_LEVEL_UP_MASTER_PLAN.md` |
| Release boundaries | `docs/CLIENT_SURFACES.md` for tier ownership/checks/non-goals/security/rollback; `docs/PRODUCT_SHOWCASE_MATRIX.md` for commercial status; `docs/WIRELINE_LEVEL_UP_MASTER_PLAN.md` for execution sequencing |
| Pricing and billing | `docs/business-usage-pricing-decision.md`, `docs/P0_BILLING_OPS_NOTE.md`, `src/lib/plan-catalog.ts`, `src/lib/conversation-balance.ts` |
| Design system | `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css`, `src/lib/wireline-design-vision.ts` |
| Voice and models | `src/lib/ai-models.ts`, `src/lib/voice/`, `src/routes/grok-voice-routes.ts`, `docs/GROK_LIVE_VOICE.md` |
| Video presenters | `src/lib/video-presenter/`, `src/components/LiveVideoPresenter.tsx`, `src/routes/video-presenter-routes.ts`; release as a consent-gated planned/beta add-on only |
| Browser extension | `apps/browser-extension/`; beta release tier; explicit-user-action browser context only |
| Native apps | `ios/`, `android/`; beta release tiers for urgent owner control |
| ChatGPT App | `src/routes/chatgpt-mcp-*`, `src/lib/chatgpt-mcp-*`, `api/mcp.ts`, `docs/CHATGPT_APP.md`; beta release tier that cannot provision numbers, dial, or launch agents |
| Tests and checks | `tests/`, `scripts/check-*.mjs`, `scripts/generate-authz-matrix.ts` |

## Repository hygiene contract

- Do not commit generated visual QA output, screenshots, local agent artifacts, `.grok/artifacts`, temporary patches, coverage, Playwright output, or build output.
- Do not add new canonical docs without linking them from `docs/README.md` or explicitly marking them historical. The standard verification gate now checks this.
- Do not create parallel design systems, duplicate source-of-truth files, or temporary `*-v2` migration wrappers.
- Keep provider credentials, user data, billing, webhook validation, and tenant-scoped reads server-owned.
- Keep browser extension behavior explicit-user-action only: no broad host permissions, no silent browsing, no token storage, no page harvesting.

## License

Proprietary. Copyright Wireline.
