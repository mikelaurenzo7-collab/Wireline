# Wireline Marketing Kit

**Last updated:** May 2026

Assets, copy, and brand guidelines for trywireline.com marketing, social,
paid ads, sales decks, and partner materials.

---

## Brand Identity

| Element | Value |
|---------|-------|
| **Name** | Wireline |
| **Tagline** | AI voice + email agents for every customer conversation. |
| **Positioning** | The horizontal AI agent platform for businesses that pick up the phone. |
| **Brand voice** | Confident, direct, warm. Never corporate-speak. |
| **Primary color** | `#4F1E7B` (brand purple) |
| **Secondary** | `#1A1A2E` (deep navy) |
| **Accent** | `#22C55E` (success green) |
| **Typeface** | Geist (UI), Instrument Serif (display), JetBrains Mono (code) |

## Key Differentiators (use in all copy)

1. **Never fabricates actions** — hard rule: the agent never claims it did
   something it doesn't have a tool for. Competitors hallucinate actions.
2. **One platform, every channel** — voice inbound + outbound, SMS, email
   from a single console. Competitors are voice-only.
3. **Personality that holds** — three vibes (warm, playful, authoritative),
   one voice per agent, consistent for the entire call. No tone-lurching.
4. **Sub-second response** — 700–900 ms perceived dead air. Under the
   "did they hang up?" threshold.
5. **Supervisor cockpit** — listen live, see transcripts in real-time,
   pause and inject corrections mid-call.

## Live Demo Lines (always current)

| Agent | Vibe | Number | Vertical |
|-------|------|--------|----------|
| Sarah | warm | (630) 642-5661 | General support |
| Liam | playful | (630) 581-1834 | Sales & plans |
| Tyler | warm | (564) 238-9455 | Technical support |
| Maya | playful | (630) 642-5927 | Onboarding & demos |
| Devon | warm | (207) 593-5155 | Billing |
| Priya | warm | (572) 726-9365 | Customer success |
| Marcus | authoritative | (617) 313-4469 | Medical intake (demo) |
| Aisha | playful | (973) 363-8874 | Real estate (demo) |
| Elena | authoritative | (904) 460-1596 | Insurance claims (demo) |
| Jake | playful | (469) 257-1581 | Outbound SDR (demo) |

**CTA:** "Call any number right now — no signup, no card, just talk."

## Pricing (mirrors plan-catalog.ts — CI enforces sync)

| Tier | Price | Agents | Minutes | Overage |
|------|-------|--------|---------|---------|
| Personal | $49/mo | 1 | 400 | $0.20/min |
| Starter | $149/mo | 3 | 1,200 | $0.18/min |
| Pro | $499/mo | 10 | 5,000 | $0.15/min |
| Business | $1,499/mo | 25 | 12,000 | $0.14/min |
| Enterprise | Custom | 100+ | 50,000+ | $0.11/min |

## Social Copy Templates

### LinkedIn (founder-led)

> We built Wireline because every voice AI in 2026 still sounds like a
> corporate bot afraid to be wrong.
>
> Our agents hold one personality for the entire call. They never
> fabricate an action they don't have a tool for. And response time
> lands at 700ms — not 2 seconds of dead air.
>
> Call (630) 642-5661 right now and hear for yourself. No signup.
>
> #VoiceAI #CustomerExperience #StartupLife

### Twitter/X (hook → proof → CTA)

> Most AI phone agents sound like a corporate IVR trained on ChatGPT.
>
> Wireline agents hold one personality, respond in <1 second, and never
> pretend they booked something they can't.
>
> Call (630) 642-5661. No signup. Just talk.

### Instagram/TikTok Reel Script (15s)

```
[0–3s] "Call this number. Right now."
[3–7s] Show dialing (630) 642-5661, agent picks up instantly
[7–12s] Agent responds naturally, handles a question
[12–15s] "AI agents that actually sound human. trywireline.com"
```

## Objection Handling (for sales deck / landing page)

| Objection | Response |
|-----------|----------|
| "Will it sound robotic?" | Call our demo line. Sub-second response, natural cadence, consistent personality. |
| "What if it hallucinates?" | Hard rule: never claims an action without a tool. Takes a message or escalates instead. |
| "We already have a phone system" | Wireline layers on top. Keep your existing number — we port or forward. |
| "Is it secure?" | SOC 2-ready architecture. TLS 1.3, encrypted secrets, full audit log, data retention controls. |
| "Can we try before we buy?" | 14-day free trial, no card. Or call any demo agent right now. |

## Screenshot Generation

```bash
# Regenerate all marketing screenshots
npm run marketing:kit

# With production data (requires demo credentials)
E2E_BASE_URL="https://trywireline.com" \
  DEMO_EMAIL="composer.demo@trywireline.com" \
  DEMO_PASSWORD="$DEMO_PASSWORD" \
  npm run marketing:kit
```

## Verticals (landing page wedges)

Each has a dedicated `/for/<slug>` page with vertical-specific hero, pain
points, sample script, and CTA:

- `/for/home-services` — HVAC, plumbing, electrical
- `/for/medical` — patient intake, appointment scheduling
- `/for/legal` — client intake, consultation booking
- `/for/real-estate` — showing scheduling, lead qualification
- `/for/insurance` — claims intake, policy questions
- `/for/restaurants` — reservations, takeout orders
- `/for/sales` — outbound SDR, lead qualification
- `/for/personal` — personal assistant, concierge

## File Structure

```
marketing-kit/
├── README.md          ← this file
├── brand/             ← logos, color swatches, font specimens
├── copy/              ← long-form copy blocks, email sequences
└── screenshots/       ← regenerated via `npm run marketing:kit`
```

## Brand Assets (in /public)

- `wireline-lockup.svg` / `wireline-lockup-white.svg`
- `wireline-wordmark.svg` / `wireline-wordmark-white.svg`
- `wireline-icon.svg` / `wireline-icon-1024.png` / `wireline-icon-512.png`
- `og-image.svg`

## Usage Rules

1. Never modify the logomark proportions
2. Minimum clear space = 1× the height of the "W" mark
3. On dark backgrounds, use `-white` variants
4. Brand purple `#4F1E7B` is the primary accent — don't replace with blue
5. All social posts should include a live phone number as CTA
