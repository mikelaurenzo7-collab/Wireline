# Wireline Marketing Kit

**Last updated:** June 2026

Approved marketing, social, sales, and partner copy for Wireline's consumer-first call concierge positioning.

---

## Brand Identity

| Element | Value |
| --- | --- |
| **Name** | Wireline |
| **Tagline** | Your personal AI call concierge. |
| **Positioning** | A consumer-first agent that handles everyday phone calls and can be configured for business workflows. |
| **Brand voice** | Direct, calm, useful, warm. Never corporate-speak. |
| **Primary color** | `#7C3AED` (violet) |
| **Canvas** | `#F3EFFA` (lavender) |
| **Text/depth** | `#1E1B2E` (charcoal) |
| **Typeface** | Plus Jakarta Sans (UI), Fraunces (display), JetBrains Mono (labels) |

## Key Differentiators

1. **Everyday call delegation** — pharmacy, doctor, school, airline, landlord, restaurant, or support line.
2. **One configurable console** — use the same Agent Studio for personal errands, side projects, and business workflows.
3. **Never fabricates actions** — if the agent lacks a tool, it takes a message, asks for confirmation, or escalates.
4. **Fast handoff-ready voice** — short, steady responses that do not feel like an IVR.
5. **Capacity scales cleanly** — start at $7, upgrade only for more agents, minutes, review tools, or custom business needs.

## Live Demo Lines

| Agent | Vibe | Number | Plays |
| --- | --- | --- | --- |
| Sarah | warm | (630) 642-5661 | Everyday support |
| Liam | playful | (630) 581-1834 | Plans and setup |
| Tyler | warm | (564) 238-9455 | Technical support |
| Maya | playful | (630) 642-5927 | Onboarding and demos |

**CTA:** "Call a demo agent now — no signup, no card."

## Pricing

| Tier | Price | Agents | Minutes | Overage |
| --- | --- | --- | --- | --- |
| Everyday | $7/mo | 1 | 60 | $0.20/min |
| Plus | $15/mo | 2 | 180 | $0.18/min |
| Studio | $29/mo | 4 | 500 | $0.16/min |
| Operator | $59/mo | 8 | 1,200 | $0.14/min |
| Custom | Talk to sales | 25+ | 5,000+ | Custom |

## Social Copy Templates

### LinkedIn / founder-led

> Wireline started with a simple question: why am I still making routine calls myself?
>
> Ask Wireline to call the pharmacy, doctor, restaurant, school, airline, landlord, or support line. It calls, waits, asks, summarizes, and tells you what happened.
>
> If you run a business, use the same Agent Studio to configure hours, scripts, routing, and handoffs.
>
> Start with one agent for $7/month.

### X / short hook

> "Hey Siri, have Wireline call the pharmacy."
>
> That's the product. Your AI call concierge handles routine phone work and reports back.
>
> Starts at $7/month.

### Reel script

```text
[0–3s] "Say: Hey Siri, have Wireline call the pharmacy."
[3–8s] Show Wireline placing the call and waiting.
[8–12s] Show a short result: "Prescription ready after 3pm."
[12–15s] "Routine calls, handled. trywireline.com"
```

## Objection Handling

| Objection | Response |
| --- | --- |
| "Is this only for businesses?" | No. Wireline is consumer-first. Business setup is just a configuration layer. |
| "Will it sound robotic?" | Call a demo line. The agent speaks briefly, steadily, and hands off when needed. |
| "What if it makes something up?" | It cannot claim an action without a tool. It asks, summarizes, or escalates. |
| "Can I use it for my business?" | Yes. Studio and Operator add more agents, minutes, routing, review, and integrations. |
| "Can I try before I commit?" | Start with one agent; upgrade only when your call volume proves it. |

## Screenshot Generation

```bash
npm run marketing:kit

E2E_BASE_URL="https://trywireline.com" \
  DEMO_EMAIL="composer.demo@trywireline.com" \
  DEMO_PASSWORD="$DEMO_PASSWORD" \
  npm run marketing:kit
```

## File Structure

```text
marketing-kit/
├── README.md
├── brand/
├── copy/
└── screenshots/
```
