# BotBound Voice Product Strategy

**Status:** Active launch strategy

**Updated:** August 31, 2026

**Supersedes:** the former third-party voice-cloning proposal

## Decision

BotBound speech is OpenAI-only. Customers choose from all 10 built-in OpenAI
Realtime voices: Alloy, Ash, Ballad, Coral, Echo, Sage, Shimmer, Verse, Marin,
and Cedar. The selected speaker is fixed for an active browser or phone session
and may be changed between sessions.

BotBound does not operate an external voice catalog, voice-cloning provider, or
customer voice-upload workflow. OpenAI TTS (`gpt-4o-mini-tts`) is reserved for
approved campaign and reference narration; OpenAI Realtime owns interactive Bot
speech. Twilio remains the carrier for PSTN and SMS and is not a customer voice
catalog.

## What consistency means

Voice consistency is a runtime invariant, not a one-voice product limitation:

- one saved OpenAI voice resolves across Studio preview, browser simulation,
  inbound calls, outbound calls, public demos, and ChatGPT private simulation;
- a session never changes speaker after admission;
- pace, warmth, energy, and formality may adapt purposefully without imitating
  the customer or changing the Bot's character;
- stale, unsupported, or historical voice ids normalize to the documented
  OpenAI catalog before a session starts;
- a provider failure is observable and fail-closed; BotBound never silently
  swaps the customer onto a different speaker or speech vendor.

## The durable product advantage

The defensible value is not the raw voice primitive. It is the operating system
around the voice:

1. Training that combines business facts, directives, role, escalation policy,
   and connected tools.
2. One identity across calls, texts, email, private simulation, and outcomes.
3. Safe activation that separates practice from live carrier work.
4. Durable evidence: transcripts, summaries, outcomes, handoffs, consent, spend,
   and audit records.
5. A carrier boundary that preserves the exact business number for every SMS
   conversation and the assigned Bot for every call.
6. Human review and escalation where the Bot lacks authority.

## Custom voices

Custom voices are not a launch capability and must not be advertised. A future
proposal may evaluate an OpenAI-native custom-voice capability only after the
BotBound project is eligible and the complete product contract exists: speaker
authorization, sensitive-data classification, tenant isolation, preview and
approval, revocation, provider deletion, audit evidence, regional availability,
cost controls, and independent legal review.

Eligibility or an account upgrade alone is not product readiness. No custom
voice route, table, setting, marketing claim, or compatibility shim should be
added until a separately reviewed release authorizes it.

## Launch proof

Before release, verify on the exact commit:

- the voice picker exposes exactly the 10 OpenAI voices;
- each saved choice reaches every browser and phone session path;
- session configuration cannot mutate the speaker mid-call;
- invalid historical values normalize to Marin without reviving a retired
  provider;
- campaign narration provenance records OpenAI, model, voice, script hash,
  audio hash, and measured duration;
- Privacy, Trust, Architecture, vendor, cost, and launch documents state the
  same OpenAI-only boundary.
