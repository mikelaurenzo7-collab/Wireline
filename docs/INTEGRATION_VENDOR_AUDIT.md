# Integration Vendor Audit

**Status: historical.** Vendor/runtime decision superseded by
`VENDOR_LAUNCH_MAP.md`'s more current runtime-decision table.

Date: 2026-07-06

## Decision

Wireline should not replace its core voice stack right now. The strongest path is to deepen the current layered architecture:

- Vapi remains the PSTN call orchestration layer.
- Deepgram Flux remains the preferred voice-agent transcription and turn-taking mode through Vapi.
- OpenAI remains the managed primary reasoning runtime, with Gemini/OpenRouter as controlled fallback and opt-in model breadth.
- ElevenLabs remains the branded/cloned voice library.
- LiveAvatar/HeyGen remains the live presenter and catalog-avatar path, with Wireline SVG faces as the always-on fallback.
- Supabase Postgres remains the tenant data plane.
- Stripe, Resend, Upstash, Twilio, DocuSign, ChatGPT MCP, and Have I Been Pwned remain explicit runtime/platform vendors.

## Product Corrections Made

- Connections now shows a concise vendor operating map with readiness, type, and capabilities only.
- The workspace catalog retains internal purpose, scope, guardrail, and next-refinement metadata without rendering it as authenticated-page explainer copy.
- The workspace catalog now covers every integration-scoped agent tool, including platform-backed Twilio messaging and Microsoft/Google spreadsheet tools.
- Runtime integration status now says Supabase Postgres instead of Vercel Postgres.
- Runtime integration status now includes missing platform dependencies that were already in the codebase: Resend, Twilio, DocuSign, HeyGen, X Ads, ChatGPT MCP, and Pwned Passwords.
- DocuSign and HeyGen/LiveAvatar readiness can express alternative secrets instead of requiring the wrong single env var.
- Voice picker groups remain label-only so authenticated agent setup stays fast and clean.
- Catalog face picks now mark avatars that expose a matched presenter voice.

## Deepen Before Adding More Vendors

1. DocuSign: finish envelope-template selection, approval copy, and status callback visibility before adding another e-sign vendor.
2. Yahoo Mail: finish XOAUTH2 IMAP fetch/send behavior before presenting Yahoo as a full mail carrier.
3. X and X Ads: add approval queues, role checks, and rate-limit transparency before deeper social automation.
4. Meta: add diagnostics for event quality, campaign mapping, and hashed payload review before more paid-media connectors.
5. Teams/Excel/Google Sheets: refine setup targets and audit trails before adding more office-suite actions.
6. Shopify/Square: deepen policy-aware returns, refunds exclusions, invoice review, and location-aware inventory.
7. Voice/avatar: continue the current matched voice + catalog face path; measure LiveAvatar session quality before replacing it.

## Missing Integrations Worth Evaluating Later

- Google Business Profile: high demand for local service businesses, but only after call outcome attribution and review-response guardrails are ready.
- Zendesk or Intercom: useful for support teams, but lower priority than finishing CRM, commerce, and email writeback.
- Calendly: useful for scheduling-only teams, but current Google/Microsoft calendar ownership is stronger for agents that also need real work context.
- ServiceTitan or Housecall Pro: strong vertical fit for home services; evaluate when Wireline has repeatable local-service demand.
- QuickBooks: useful for invoicing/accounting, but only after Square/Stripe invoice flows and finance approval policy are mature.
- Tavus: credible conversational video API option if Wireline needs native video-agent perception; not a replacement until LiveAvatar quality, latency, and cost data shows a real gap.

## Source Check

- OpenAI Realtime and tool docs: https://developers.openai.com/api/docs/guides/realtime
- Vapi tools and assistant hooks: https://docs.vapi.ai/tools
- Deepgram Flux docs: https://developers.deepgram.com/docs/flux/quickstart
- ElevenLabs voice infrastructure docs: https://elevenlabs.io/docs/overview/intro
- LiveAvatar docs: https://docs.liveavatar.com/
- Tavus API overview: https://docs.tavus.io/api-reference/overview
