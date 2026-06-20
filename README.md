# Wireline

Wireline is an AI communications workspace for personal and business agents.

The product workflow is simple:

1. Build an agent.
2. Train it with instructions, knowledge, workflows, and integrations.
3. Run it across voice, SMS, and email.
4. Review outcomes and improve the next interaction.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Wireline requires Node 22 or newer.

## Verification

```bash
npm run lint
npm run runtime:policy:check
npm run build
npm run smoke:server
```

`npm run verify` runs the production build plus a bundled-server import smoke test.

## Architecture

- **Frontend:** React, Vite, TypeScript, Tailwind utilities, and accessible shared primitives.
- **API:** Express server routes deployed through Vercel.
- **Data:** Postgres with Drizzle migrations.
- **Identity:** server-side session authentication and user-scoped authorization.
- **Runtime:** OpenAI is the managed primary and Gemini is the automatic fallback. OpenRouter is an explicit agent-level option.
- **Communications:** Twilio/Vapi voice execution plus connected email, SMS, calendar, contacts, and CRM workflows.
- **Billing:** Stripe-backed server-side entitlements.

Pricing, model selection, and billing behavior are defined in code-owned catalogs and runtime modules.

## Product rules

- Keep the product focused on Build → Train → Run → Review.
- Preserve authorization, billing, webhook validation, rate limits, CSP, and tenant-scoped data access.
- Keep the interface readable: warm light surfaces, graphite actions, neutral borders, visible focus states, and clear hierarchy.

## License

Proprietary. © 2026 Wireline. All rights reserved.
