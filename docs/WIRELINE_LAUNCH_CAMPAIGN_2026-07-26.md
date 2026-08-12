# Wireline Launch Campaign — Voice Agents

Updated: 2026-08-11  
Status: **Active campaign pack**  
Authority: `docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md`

This document owns launch copy, voiceover masters, paid/organic campaign language, and cut briefs. The launch source of truth owns positioning and proof posture. If they disagree, the launch source of truth wins and this file must be corrected.

## Campaign Truth

**Voice agents for personal tasks and business conversations.**

Wireline helps people and teams build voice agents around useful work.

The public operating loop is **Build -> Train -> Launch -> Improve**:

1. **Build** one agent around a clear job.
2. **Train** it on facts, rules, voice, and behavior.
3. **Launch** it on the calls and follow-up channels the user enables.
4. **Improve** it from transcripts, outcomes, and review.

Start with one useful workflow. Add agents or workflow breadth only when real use proves the need.

## Launch Offer

- Primary CTA: **Build your Voice Agent**
- Price line: **Build free. Go live from $19/mo.**
- Live plan floor: **Starter — $19/mo**
- Builder posture: Free Builder is for building, training, and private simulation before paid live use.
- Number promise: Every paid voice agent includes a Wireline number.
- Audience: Personal and Business without making either secondary.

## Brand Spine

| Element | Current Copy |
| --- | --- |
| North star | Voice agents for every conversation — personal or business. |
| Compact line | Start with one useful agent. Add more when real work proves the need. |
| Outcome line | Capture the call, send the follow-up, log the outcome. |
| Product loop | Build -> Train -> Launch -> Improve |
| CTA | Build your Voice Agent |
| Price | Build free. Go live from $19/mo. |

## Claim Guardrails

Use:

- `voice agent`, `business voice agent`, and `personal agent` where context requires it;
- calls, texts, email, follow-up, handoff, and logged outcomes;
- private simulation before live launch;
- paid plans include a Wireline number;
- precise demo/test labeling before real customer evidence exists.

Avoid:

- pairing `AI` with `agent` in customer-facing copy;
- employee language as a product noun;
- fully autonomous, guaranteed booking, guaranteed revenue, or compliance-safe promises;
- customer counts, testimonials, ROI claims, or implied adoption before real customer evidence supports them;
- public WhatsApp claims while it remains outside the launch posture;
- any workflow spine other than **Build -> Train -> Launch -> Improve**.

## Primary 30-Second Ad — The Second Ring

**Problem:** a recognizable missed-call moment before the product name appears.

**Hook:**  
“Every missed call is someone trying the next name on the list.”

**Picture:** real Wireline product proof from the exact production commit being promoted. The cut should move from the unanswered-call problem into a trained agent handling the conversation, then show the follow-up or logged outcome.

**Narration:** use the `wireline-ai-voice-agent-30s.mp3` master below only in its briefed tail. Let the real captured agent voice play at **full level** for a meaningful stretch with no narration or music underneath it.

**End card:**

- Build your Voice Agent
- Build free. Go live from $19/mo.
- trywireline.com

## AI Voice Generator Audio

These generated tracks are for **marketing/reference use only**. They are not the production phone-call speech path.

`npm run campaign:vo` renders exactly three canonical tracks into the gitignored `official-assets/audio/` directory.

### Missed call — 15s

File: `wireline-missed-call-15s.mp3`

> Six forty-seven. The phone rings, and you cannot pick up. Your Wireline agent can. It answers, books the next step, texts the confirmation, and logs the outcome. Build free at trywireline.com.

### The Second Ring — 30s tail

File: `wireline-ai-voice-agent-30s.mp3`

> Every call answered the way you trained it, and logged where you can check the work. Build free. Go live from nineteen dollars a month.

This narration is intentionally short. The spot belongs to the missed-call moment, real captured agent audio, the finished work, and the end card—not continuous announcer copy.

### Founder explainer — 60s slot

File: `wireline-founder-60s.mp3`

> I built Wireline because the phone call is still where real business happens, and it is still the easiest thing to miss. Every missed call is a customer deciding to try the next name on the list. So we made it simple to build a voice agent of your own. Train it on your facts and rules in plain language. Let it practice in private simulation. Only then does it touch a real number. From that moment it answers your calls, sends the follow-up text or email, and logs every outcome so you can check its work. Personal line or front desk. One agent, or a team when volume proves the need. Build free. Go live from nineteen dollars a month, with a Wireline number included on every paid plan.

Re-measure provider output after every regeneration; pacing can drift even when copy does not.

## Paid Social Set

### Missed Call Recovery

- Primary text: “Every missed call is someone trying the next name on the list. Wireline lets you build a voice agent that can handle the call, continue the follow-up, and log the outcome while you stay on the job.”
- Headline: **Voice Agents**
- Description: **Build free. Go live from $19/mo.**
- CTA: **Build your Voice Agent**

### One Agent, Connected Work

- Primary text: “Build one Wireline voice agent around a real job. Train the rules once, launch it on the channels you enable, then improve it from the outcomes.”
- Headline: **Calls. Follow-up. Outcomes.**
- Description: **Start with one useful workflow.**
- CTA: **Build your Voice Agent**

### Personal + Business

- Primary text: “Personal call delegation, front-desk coverage, support triage, lead response, and appointment follow-up—trained privately before live use.”
- Headline: **Personal or Business**
- Description: **Build -> Train -> Launch -> Improve**
- CTA: **Start free**

Do not start paid acquisition before the exact workflow being advertised has passed founder dogfood and checkout/phone readiness.

## Organic Launch Posts

### Founder post

I built Wireline because calls are still where real work shows up—and they are still too easy to miss.

Wireline lets you build voice agents for personal tasks and business conversations. Build one around a real job, train it on your facts and rules, test it privately, then launch it when you are ready. The call, follow-up, and outcome stay in one operating loop you can review and improve.

Build free. Go live from $19/mo at trywireline.com.

### Short post

You cannot answer every call. Your agent can.

Build it. Train it. Launch it. Improve it from the work.

Build free. Go live from $19/mo.

### Demo caption

Hear the agent handle the conversation, then see the follow-up and outcome land in Wireline. Real product proof beats abstract automation claims.

## Video / Reel Doctrine

Every publishable cut must follow `docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md` and the release record produced by `npm run marketing:kit`.

- Real product only for product proof. A cinematic problem hook may establish context, but must never masquerade as Wireline UI.
- Capture product picture from the exact production source commit being promoted.
- Reject any frame containing an auth wall, 404, dead route, loading hold, or stale product surface.
- Reframe around active UI for 9:16 and 1:1; never shrink an unreadable desktop into vertical whitespace.
- Keep burned-in copy sparse. Prefer platform captions for accessibility.
- Let the real agent voice play at **full level** with no narration or music underneath it when the cut sells voice quality.
- Show finished work: follow-up, booking, handoff, transcript, or logged outcome—not only pickup.
- Never manufacture logos, testimonials, customer counts, or ROI.
- End deliberately on the current CTA, price line, and domain.

## Three Launch Cuts

### 1. Missed Call — 15s

0–2s: recognizable missed-call moment.  
2–6s: real Wireline call/agent proof.  
6–11s: follow-up or logged outcome.  
11–15s: clean end card.

Required contrast may use sparse overlays: **You cannot pick up.** then **Your agent can.**

### 2. The Second Ring — 30s

Primary paid-social cut. Use real captured agent audio as the proof center. The narration enters late; silence is allowed to carry the problem.

### 3. Founder / Product Proof — 45–60s

Explain the same **Build -> Train -> Launch -> Improve** loop with enough time to show the real product, not a sped-up tour of every feature.

### Two Rings — 6s bumper

A minimal scroll-stop derived from the same captured-call proof. No separate product story. No fake UI.

### Sound-off variants

Every paid cut should have a sound-off treatment that remains understandable without covering legible product UI. Accessibility captions should be selectable where the platform supports them.

## Creative Status

Historical masters that contain the authenticated 404 are rejected. Repaired derivatives created from historical picture are editing/QA drafts only. They become launch masters only after exact-production recapture and release certification.

The current production source of truth, not a Descript share URL or historical filename, determines whether a cut is publishable.

## Delivery Guide

- Voice: direct, founder-like, unhurried; not announcer-style.
- Speak `trywireline.com` as “try wireline dot com.”
- Speak prices as words in narration.
- Preserve room for real agent audio and silence.
- Do not stretch narration to fill a slot.
- Regenerate audio whenever canonical copy changes, then re-measure duration.

## Measurement

Reserved launch measurement key: `wl_launch_ai_voice_agents_v6`.

The identifier is internal analytics plumbing, not customer-facing positioning. Use one launch campaign naming system and measure signup intent, successful private test, paid activation, first useful live outcome, and retained use. Do not optimize ads against demo/test activity as though it were customer conversion evidence.
