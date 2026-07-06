# Wireline running cost audit — 2026-07-06

Scope: recurring operating vendors, infrastructure, APIs, and app-store/platform costs needed to run Wireline. This excludes sunk build spend, one-off design/dev purchases, and customer revenue. Amounts marked `User-reported` came from Mike's current billing memory and should be reconciled against card statements or vendor billing pages.

## Current monthly run-rate snapshot

| Bucket | Vendor | Monthly estimate | Billing model | Current status | Notes / action |
| --- | --- | ---: | --- | --- | --- |
| Hosting | Vercel | $20 | Fixed base + usage overages | Active | User-reported. Connected Vercel team has `wireline` and `v0-project`; likely one Pro seat/base account. Monitor bandwidth/functions/build minutes. |
| Database / backend | Supabase | $20 | Fixed base + usage/add-ons | Active | User-reported. One active healthy project in `us-east-2`, Postgres 17.6.1.141, one active Edge Function. Supabase Auth leaked-password warning is accepted as non-applicable while Supabase Auth email/password is not used. |
| Database legacy / duplicate | Neon | ~$20 | Fixed base + usage | Unknown / likely duplicate | User-reported. Current repo points production database to Supabase pooler, not Neon. If Neon is not backing a staging database or backup path, snapshot/export and cancel/pause. |
| Domain | Domain registrar for `trywireline.com` | Unknown, likely annual | Annual amortized monthly | Active | Domain is attached to Vercel. Locate registrar and renewal date. |
| Source control | GitHub | Unknown | Free/seat/add-ons | Active | Repo and Actions are active. Monthly cost depends on plan, Copilot, Actions minutes, storage, Codespaces. |
| Payments | Stripe | As used | Processing fees / billing fees | Active | No fixed app fee assumed. Active product catalog exists for Wireline Personal, Team, Business, Enterprise, Live Video, and Conversation Balance. |
| Rate limiting/cache | Upstash Redis | As used / possibly free tier | Usage / plan | Required for production safety | Required env vars in prod checker. Without it rate limits fall back to per-instance memory. Confirm active account and quota. |
| Email delivery | Resend | As used / plan | Email volume / plan | Configured path exists | Env and sync script exist. Confirm whether production email is on Resend and whether domain is verified. |
| Error monitoring | Sentry | Free/unknown/as used | Seat/event volume | Optional | Optional envs only. If no DSN in prod, no monthly cost; if active, check event volume and seats. |

Estimated known fixed base today: **about $60/month** from user-reported Vercel + Supabase + Neon. If Neon is canceled, known fixed base drops to **about $40/month**, before domains, GitHub add-ons, and API usage.

## Usage-metered runtime APIs

| Vendor | What Wireline uses it for | Cost posture | Current status | Guardrail |
| --- | --- | --- | --- | --- |
| OpenAI | Primary managed AI runtime for training, QA, insights, post-call intelligence; optional realtime voice; ChatGPT app widget sessions | As used by tokens/audio/sessions | Required by runtime registry | Keep spend caps and per-tenant usage accounting tied to Conversation Balance. |
| Google Gemini / Google AI | AI fallback and grounded/search/extraction paths | As used | Optional fallback | Keep as fallback, not silent primary unless chosen. |
| OpenRouter / xAI / Grok | Explicit custom per-agent model path / advanced model picker | As used | Optional | Make this customer-funded or gated; do not absorb heavy custom-model usage silently. |
| Anthropic | Older/optional Claude recipe/director paths still appear in env docs/prod checker | As used | Legacy/optional unless env is live | Reconcile: either keep Claude as an explicit paid premium path or remove from required launch docs. |
| Vapi | PSTN inbound/outbound call handling and voice agent orchestration | As used + possible platform plan | Required for phone runtime | Primary voice bill-risk vendor. Track per-call minutes, provider pass-through, and webhook success. |
| Twilio | Phone numbers, SMS, inbound/outbound telephony support, verification | Monthly numbers + call/SMS as used | Required for SMS/number provisioning | Number inventory can create fixed monthly drag. Audit unused numbers monthly. |
| Deepgram Flux | Production transcription / end-of-turn behavior through Vapi | Usually pass-through/as used | Indirect through Vapi | Confirm whether billed directly or inside Vapi invoice. |
| ElevenLabs | Optional TTS, voices, pronunciations | As used / subscription | Optional | Do not offer as default if OpenAI/Vapi voices cover launch. |
| HeyGen / LiveAvatar | Live video presenter / photoreal face add-on | As used / subscription | Optional add-on | Keep behind paid live-video add-on or enterprise pilots only. |
| LiveKit | Dependency exists, but no active env was found in repo audit | Unknown / likely inactive | Not confirmed active | Remove from cost list unless billing exists elsewhere. |

## Integrations that should usually be zero monthly from Wireline unless you buy seats or paid API plans

| Vendor / surface | Why it appears | Cost posture | Action |
| --- | --- | --- | --- |
| Google Workspace APIs | Gmail, Calendar, Contacts, Drive, Sheets OAuth | Usually no direct API cost at launch; Workspace seats are separate | Track only if Wireline owns a paid Workspace account. |
| Microsoft 365 APIs | Outlook, Calendar, Teams, Excel, OneDrive, PowerPoint OAuth | Usually customer-owned tenant; Wireline app registration should not create usage fees | Track Azure app/tenant only if paid resources are enabled. |
| Yahoo / iCloud mail | Mailbox connection support | No platform cost expected | Treat as customer-owned OAuth/app-password use. |
| HubSpot | CRM actions | Often customer-owned; Wireline may need developer app only | Track only if Wireline buys a HubSpot seat/plan. |
| Salesforce | CRM actions | Customer-owned; Wireline connected app | No Wireline cost unless buying a dev/org/seat. |
| Slack | Alerts and app/slash commands | Free unless paid workspace/app infra | Confirm if Wireline owns paid Slack. |
| Zoom | Meeting link creation | Customer-owned OAuth | No fixed Wireline cost expected. |
| Apollo | Lead enrichment/prospecting | Often paid subscription/API credits | If enabled, this is likely a real monthly cost; keep off until monetized. |
| Shopify / Square | Commerce actions | Customer-owned partner integrations | No fixed Wireline cost expected unless paid app listing/tooling. |
| Meta / WhatsApp / Instagram | Messaging, attribution, CAPI | Can be free to integrate; messaging/ads can become usage/ads spend | Keep ads/messaging spend separate from app run-rate. |
| X / X Ads | Social posting/ads reporting | API access may require paid tier; ads spend separate | Keep disabled unless needed for a paying customer. |
| DocuSign | E-signature integration | Usually paid plan/API | Treat as optional customer-driven integration. |
| Figma / Canva | Design export integrations | Developer/OAuth may be free; seats may cost | Keep as optional, not core run-rate. |

## Mobile / browser platform costs

| Platform | Monthly estimate | Billing model | Status / action |
| --- | ---: | --- | --- |
| Apple Developer Program | About $8.25 amortized if active | $99/year | Needed for iOS/TestFlight/App Store, APNs/PushKit production. Confirm account renewal. |
| Google Play Console | $0 monthly after setup | One-time registration | Needed for Android distribution. Confirm whether one-time fee already paid. |
| Firebase Cloud Messaging | $0 base expected | Usage/free tier depending services | Env placeholders exist for FCM. Track only if paid Firebase products are enabled. |
| Chrome Web Store | $0 monthly after setup | One-time developer fee | Browser extension publishing; not a recurring run-rate item. |
| Opera add-ons | Usually $0 monthly | Developer/publishing | Browser sidebar surface; no expected recurring cost. |
| ChatGPT app / MCP | Unknown / likely no fixed API hosting cost beyond OpenAI usage | App registration + OpenAI usage where applicable | Cost driver is hosted Wireline API + any OpenAI widget/session usage. |

## Priority cleanup recommendations

1. **Confirm and cancel/pause Neon if unused.** The current production database path is Supabase, and no Neon reference was found in the repo audit. This is the most obvious potential $20/month duplicate.
2. **Create one owner spreadsheet/ledger:** vendor, login email, plan, monthly base, variable unit, billing card, renewal date, cancel link, production dependency, owner.
3. **Add hard monthly caps where possible:** OpenAI, Vapi, Twilio, OpenRouter/xAI, HeyGen/LiveAvatar, Apollo, Sentry, Resend, Upstash.
4. **Move optional expensive vendors behind paid gates:** live video presenter, custom model routing, premium TTS, lead enrichment, WhatsApp/social messaging.
5. **Keep customer-owned integrations customer-owned:** Google, Microsoft, Salesforce, HubSpot, Slack, Zoom, Shopify, Square should not become Wireline's monthly operating burden unless you intentionally buy internal seats.
6. **Review Twilio number inventory monthly.** Unused numbers quietly turn usage vendors into fixed-cost vendors.

## Conservative monthly planning bands

| Stage | Expected base run-rate | What it includes |
| --- | ---: | --- |
| Current lean build, Neon retained | ~$60–$100/month | Vercel, Supabase, Neon, domain/GitHub small unknowns; excludes AI/voice usage. |
| Current lean build, Neon canceled | ~$40–$80/month | Vercel + Supabase + domain/GitHub small unknowns; excludes AI/voice usage. |
| Dogfood with real calls | ~$100–$300+/month | Base infra plus Twilio/Vapi/OpenAI/Gemini/Resend/Upstash usage. |
| Paid beta with live voice/video | Usage-led | Voice/video/model costs should be funded by Conversation Balance, plan price, or explicit add-ons. |

## Source notes

- Vercel connected team currently contains two projects: `wireline` and `v0-project`.
- Supabase connected account currently shows one active healthy project in `us-east-2`.
- Repo runtime registry marks OpenAI and Vapi as required runtime integrations and lists Gemini, OpenRouter, ElevenLabs, LiveAvatar, Google Workspace, Microsoft 365, Stripe, HubSpot, Salesforce, Slack, Zoom, Apollo, Meta, Shopify, Square, X, and Upstash as supported/configurable integrations.
- `.env.example` is broader than production truth. It intentionally includes future/optional vendors. Treat this document as the operating-cost shortlist, not a claim that every placeholder is currently billed.
