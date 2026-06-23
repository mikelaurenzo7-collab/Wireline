# Wireline

Wireline is a horizontal AI voice + messaging agent platform. One fleet of agents handles inbound calls, outbound dialing, SMS, and email for businesses, with a live supervisor experience and self-improvement capabilities. It includes native iOS and Android apps focused on personal daily assistance backed by the same agents.

## Key capabilities
- **Agents**: Highly customizable voice, SMS, and email agents with knowledge, instructions, tone, tools, and integrations (calendars, CRM, email).
- **Voice**: Production calls via Vapi/Twilio. Authenticated realtime voice sessions powered by xAI Grok for low-latency interactive tests.
- **Native mobile**: iOS (SwiftUI + CallKit + widgets + App Intents + CarPlay plans) and Android (Jetpack Compose + Telecom + FCM + widgets) as thin, high-quality personal control surfaces.
- **Studio & Director**: Web workspace for building, training, reviewing, and operating agents at scale.
- **Infrastructure**: Postgres + Drizzle, RLS tenant isolation, Stripe billing, strong auth, rate limiting, and verification gates.

## Tech
- Web: React 19 + Vite, Express, TypeScript, Tailwind + Ametrine Precision design system.
- API: Serverless-capable (Vercel), Drizzle ORM on Supabase Postgres.
- Voice: Vapi + ElevenLabs + xAI Grok realtime.
- Models: Managed OpenAI (primary for many paths) + Gemini fallback + OpenRouter overrides + dedicated Grok realtime.
- Mobile: Native Kotlin/Compose and SwiftUI.

## Getting started
```bash
npm install
npm run dev          # Starts Vite + Express on http://localhost:3000
```

## Verification (required before changes land)
```bash
npm run verify       # build + server smoke (fast)
npm run verify:full  # lint + authz + csp + tests + build + smoke
```

See:
- `CLAUDE.md` — contributor guidance and rules
- `ARCHITECTURE.md` — system design
- `CODEBASE_HEALTH.md` — current guardrails and cleanup policy
- `AGENTS.md` — design system rules (Ametrine Precision)
- `docs/` — launch, SOC 2, SLAs, more

## Project status (as of recent commits)
Active development on Grok realtime voice, agent customizability (including voice cloning), Ametrine Precision design standardization, native mobile foundations, and ongoing codebase health / legacy removal.

All changes must pass `npm run verify` (and full where applicable). Follow default-deny authz, Zod validation, structured logging, and source-of-truth discipline (ai-models.ts, schema, brand-colors, plan-catalog, etc.).

## License
Proprietary. © Wireline.