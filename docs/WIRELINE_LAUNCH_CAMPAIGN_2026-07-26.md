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

### Live Video proof — 25s slot

File: `wireline-live-video-25s.mp3`

> Some conversations deserve a face. Turn on Live Video and your voice agent joins on screen — same training, same rules, same logged outcome as the call it would have taken. One place to review the work. Add it to a live plan for nineteen dollars a month.

The narration deliberately claims the **brain**, not the voice. In the default session the presenter speaks through Wireline's own realtime voice rather than the phone voice, so "same voice" would be a claim the picture cannot support. What is identical across phone and screen is the agent: its Training, its rules, and the outcome it logs.

Picture requirements are stricter than any other cut in the set. A static identity badge, a generated avatar concept, or a provider demo is **not** Live Video proof. The cut needs an authenticated exact-production session showing the mint, the presenter answering in sync, an explicit stop, and a truthful allowance state.

Re-measure provider output after every regeneration; pacing can drift even when copy does not.

## Paid Social Set

### Missed Call Recovery

- Primary text: “Every missed call is someone trying the next name on the list. Wireline lets you build a voice agent that can handle the call, continue the follow-up, and log the outcome while you stay on the job.”
- Headline: **Voice Agents**
- Description: **Build free. Go live from $19/mo.**
- CTA: **Build your Voice Agent**

### One Voice Agent, Connected Work

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

## Out of Home

OOH is the one surface with no sound, no scroll, and no second chance. A driver
gets roughly six seconds and a pedestrian roughly three, so every board is
**seven words or fewer above the logo**, and the product is never shown: a phone
screen at 48 sheets is a grey rectangle. The line does the work.

All boards share one lockup: line, then a hairline wire rule, then the mark,
the offer, and the domain. Violet on near-black, one accent, never a photograph.

### Board set

| # | Line | Placement logic |
| --- | --- | --- |
| 1 | You cannot pick up. Your agent can. | The flagship. The whole product in six words, and the only board that states the problem and the answer together. |
| 2 | Every missed call tries the next name. | Arterials and commuter rail into trade-heavy metros. Loss framing for owner-operators. |
| 3 | Answered at 6:47. Booked by 6:49. | Airport and highway, where dwell time is longest and a two-beat line can land. |
| 4 | It answers. It books. It writes it down. | Transit shelters, read at a stop rather than at speed. |
| 5 | Your best line, on every line. | Brand board. Runs late, after the category is understood. |
| 6 | Train it once. It works every call. | Near business parks and supply houses. |

Every board closes on the same three lines, set small and never crowded:

> **WIRELINE**  
> Build free. Go live from $19/mo.  
> trywireline.com

### Rules

- No board carries a product screenshot, a QR code that requires stopping, a
  phone number, or a headshot.
- The line must be legible at 15% of its final size in greyscale. If it fails
  that print, it is a paid-social line, not a board.
- Never run board 5 first. It is a recall asset and reads as noise before the
  category lands.
- No customer counts, ratings, or testimonials until real customer evidence
  supports them, on OOH exactly as everywhere else.

## Hero Film — "The Second Ring" (:60)

The tentpole cut. Same spine as the 30, given room to breathe. It is built on
one dramatic idea: **we all know the sound of a call we cannot take.**

Sound design carries this film. Ring tone is the only score until 0:38.

| Time | Picture | Audio |
| --- | --- | --- |
| 0:00–0:06 | Black. A phone ringing somewhere off frame. | Ring. Nothing else. |
| 0:06–0:16 | Three working hands that cannot answer: gloves on a pipe fitting, a stylist mid-colour, a contractor on a ladder. No faces. No dialogue. Each shot ends on the phone lighting up unanswered. | Ring continues under room tone. |
| 0:16–0:22 | The ring stops mid-cycle. Hold on the dark screen. | Silence. A full two seconds of it. |
| 0:22–0:26 | Cut to text on black: **You cannot pick up.** Beat. **Your agent can.** | Silence, then the second ring begins. |
| 0:26–0:40 | Real captured Wireline audio at full level. Picture is the real product: the call arriving, the agent handling it, the booking landing. No narration underneath. | Agent voice, alone, unducked. |
| 0:40–0:50 | The follow-up text sends. The outcome writes itself into the log. Back to the same three workers, still working, phone face-down. | Agent audio tails out. Room tone returns. |
| 0:50–0:60 | End card. | Narration tail only: the `ai-voice-agent-30s` master. |

### Direction notes

- **The silence at 0:16 is the ad.** It is the only part a viewer will describe
  to someone else. Do not score it, shorten it, or fill it with a logo sting.
- Never show a face answering the phone. The moment a person picks up, the
  product is unnecessary.
- The agent's voice must be real captured product audio, unducked and
  unprocessed beyond level. If it needs sweetening to be convincing, the cut is
  not ready and neither is the claim.
- The product picture is exact-production capture from the commit being
  promoted, under the same rules as every other cut. A mockup here would make
  the most-seen frame of the campaign the least honest one.
- Cutdowns come out of this master, not the reverse: :30 drops the third
  worker and the follow-up beat; :15 is the silence, the second ring, and the
  end card.

### End card

- Build your Voice Agent
- Build free. Go live from $19/mo.
- trywireline.com

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
