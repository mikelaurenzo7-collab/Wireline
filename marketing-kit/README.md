# Wireline Marketing Kit

**Last updated:** June 2026

Approved marketing, social, sales, and partner copy for Wireline's consumer-first call concierge launch.

---

## Brand Identity

| Element | Value |
| --- | --- |
| **Name** | Wireline |
| **Tagline** | Your personal AI call concierge. |
| **Positioning** | A consumer-first AI assistant that handles everyday phone calls, then scales into side-project and business workflows. |
| **Brand voice** | Direct, calm, useful, warm. No enterprise fog, no fake magic. |
| **Primary color** | `#5D3FD3` (Ametrine primary) |
| **Canvas** | `#F8F9FF` (Ametrine canvas) |
| **Panel** | `#FFFFFF` (Elevated card) / `#F4F4F2` (Secondary surface) |
| **Accent / secondary** | `#4A5F59` (Secondary text) / `#E1E9E6` (Active container) |
| **Typeface** | Inter (UI/display, -0.02em tracking for headings), JetBrains Mono (labels/metadata) |

## Core Consumer Promise

> Ask Wireline to call the pharmacy, doctor, school, airline, landlord,
> restaurant, or support line. It calls, waits, asks, summarizes, and tells you
> what happened.

This is the launch spine. Every ad, landing page, reel, App Store screenshot,
and demo line should make this promise obvious in under five seconds.

## Key Differentiators

1. **Everyday call delegation** — pharmacy, doctor, school, airline, landlord, restaurant, support line.
2. **Works from the phone** — Siri, widgets, native call surfaces, and mobile app controls.
3. **One configurable console** — same Assistant Studio for personal errands, side projects, and business workflows.
4. **Never fabricates actions** — if the assistant lacks a tool, it takes a message, asks for confirmation, or escalates.
5. **Fast callback-ready voice** — short, steady responses that do not feel like an IVR.
6. **Starts inexpensive** — begin with one assistant, upgrade for more assistants, minutes, review tools, or business controls.

## Live Demo Lines

| Assistant | Vibe | Number | Plays |
| --- | --- | --- | --- |
| Sarah | warm | (630) 642-5661 | Everyday support |
| Liam | playful | (630) 581-1834 | Plans and setup |
| Tyler | warm | (564) 238-9455 | Technical support |
| Maya | playful | (630) 642-5927 | Onboarding and demos |

**CTA:** "Call a demo assistant now — no signup, no card."

## Pricing

| Tier | Price | Assistants | Minutes | Overage |
| --- | --- | --- | --- | --- |
| Everyday | $7/mo | 1 | 60 | $0.20/min |
| Plus | $15/mo | 2 | 180 | $0.18/min |
| Studio | $29/mo | 4 | 500 | $0.16/min |
| Concierge | $59/mo | 8 | 1,200 | $0.14/min |
| Custom | Talk to sales | 25+ | 5,000+ | Custom |

## Launch Hooks

| Audience | Hook |
| --- | --- |
| Busy parents | "Stop waiting on hold. Ask Wireline to call and report back." |
| Professionals | "Delegate routine phone work without hiring an assistant." |
| Seniors / caregivers | "Let Wireline call the pharmacy, doctor, or insurance line." |
| Students | "Call offices, support lines, landlords, and schools without losing your day." |
| Small business | "A phone assistant for calls, recaps, routing, and callback." |

## Social Copy Templates

### LinkedIn / founder-led

> Wireline started with a simple question: why am I still making routine calls myself?
>
> Ask Wireline to call the pharmacy, doctor, restaurant, school, airline, landlord, or support line. It calls, waits, asks, summarizes, and tells you what happened.
>
> If you run a business, use the same Assistant Studio to configure hours, scripts, routing, and callbacks.
>
> Start with one assistant for $7/month.

### X / short hook

> "Hey Siri, have Wireline call the pharmacy."
>
> That's the product. Your AI call concierge handles routine phone work and reports back.
>
> Starts at $7/month.

### TikTok / Reel script

```text
[0–2s] Show the problem: "I've been on hold for 38 minutes."
[2–5s] Say: "Hey Siri, have Wireline call the pharmacy."
[5–9s] Show Wireline placing the call and waiting.
[9–13s] Show recap: "Prescription ready after 3pm. Bring ID."
[13–15s] "Routine calls, handled. trywireline.com"
```

## Objection Handling

| Objection | Response |
| --- | --- |
| "Is this only for businesses?" | No. Wireline is consumer-first. Business setup is just a configuration layer. |
| "Will it sound robotic?" | Call a demo line. The assistant speaks briefly, steadily, and offers a callback when needed. |
| "What if it makes something up?" | It cannot claim an action without a tool. It asks, summarizes, or escalates. |
| "Can I use it for my business?" | Yes. Studio and Concierge add more assistants, minutes, routing, recaps, and actions. |
| "Can I try before I commit?" | Call a demo assistant now. Start paid only when you want your own assistant. |

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
├── launch-consumer-playbook.md
├── brand/
├── copy/
└── screenshots/
```
