# Production Voice Runtime Policy - 2026-07-26

Status: **Active launch policy**. This is the voice-provider boundary for Wireline's live-call,
browser-demo, presenter, and marketing-audio surfaces.

## Operating rule

Wireline can sound distinctive without confusing four different voice surfaces:

| Surface | Production owner | What is allowed | What is not allowed |
| --- | --- | --- | --- |
| PSTN phone calls | Vapi orchestration with Twilio carrier/messaging transport | Curated Vapi voices today; future Vapi-supported streaming custom voices only after consent, rights, latency, fallback, and telephony verification. | Audio-file generators, presenter TTS, browser-only voices, or unverified cloned voices answering live callers. |
| Browser/mobile live demo | OpenAI Realtime WebRTC | Role-tuned OpenAI voice profiles controlled by Wireline. | xAI/Grok client-secret routing or custom browser-demo voice cloning. |
| Video presenter | Live video / presenter catalog | Curated presenter faces and matched public presenter voices with explicit consent and fallback to the Wireline identity badge. | Selling presenter voice or face choices as the phone-call voice. |
| Marketing and ads | AI Voice Generator, HeyGen, Beautiful.ai, Canva, Adobe, Runway, BlitzReels | Voiceovers, narration, ad reads, demo reels, and reference reads. | Treating generated files as a streaming phone-call voice runtime. |

## Answer to "Can we create our own voices with AI Voice Generator?"

Yes for **marketing audio** and reference direction. No as the live phone-call runtime.

AI Voice Generator creates audio assets. Production phone calls require a low-latency streaming voice
inside the Vapi/Twilio call path, plus provider terms that cover commercial use, voice rights,
consent, revocation, disclosure, fallback, monitoring, and latency under interruption.

## Launch promise

Use this promise externally:

> Wireline lets you choose a polished production phone voice today, and we can design a signature
> brand voice direction for campaigns and demos. Custom live-call voices are available only after
> the streaming provider path is verified for rights, latency, fallback, and telephony quality.

Do not say:

- "Upload any voice and it will answer calls."
- "AI Voice Generator powers production phone calls."
- "Presenter voice equals phone voice."
- "Grok/xAI is the default live-voice runtime."
- "Custom cloned voices are generally available."

## Acceptance checklist for future custom live-call voices

Before enabling a custom voice for production PSTN, verify:

1. The voice provider is reachable through Vapi or a Direct SIP/media path that supports streaming,
   interruption, barge-in, and low-latency TTS.
2. The voice owner has explicit commercial consent and revocation terms.
3. The runtime has a deterministic fallback to a curated Vapi voice.
4. Call recording, AI disclosure, consent, opt-out, DNC, and calling-hours policies still apply.
5. Quality is tested with one inbound call, one outbound call, noisy audio, long turns, interruption,
   voicemail, and transfer/handoff.
6. Pricing and margin include any custom voice synthesis surcharge.
7. Customer-facing copy labels the capability as configured/custom, not universal.
