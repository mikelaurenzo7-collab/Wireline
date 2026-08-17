# Wireline Campaign Studio

Status: **Post-proof creative system**

Authority: `docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md` and `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md`

Campaign Studio turns approved Wireline proof into editor-ready sound packages. It is not an in-product advertising generator and never sits on the phone-call path.

## The big idea: The Second Ring

A missed call is not a notification. It is a person deciding whether to try the next name.

The film grammar is deliberate:

1. **Silence:** a call rings while the owner is occupied.
2. **The second ring:** Wireline answers in the business's approved voice.
3. **Proof:** show the actual completed follow-up or logged outcome from the same exact-production workflow.
4. **Release:** the sonic mark resolves into the end card: **Build your Voice Agent. Build free. Go live from $19/mo.**

No invented customer result, testimonial, booking, or revenue claim may replace product proof.

## Deliverables

| Asset | Format | Purpose |
| --- | --- | --- |
| Two Rings | 6s, 9:16 / 16:9 | Bumper: ring, answer, outcome, mark. |
| The Second Ring | 15s / 30s | Primary commercial; real agent audio is the centerpiece. |
| Founder Proof | 60s | Documentary-style product proof, not a feature montage. |
| Sound-off OOH | Static / digital OOH | One line, a precise CTA, QR, and no dependency on audio. |
| Sonic mark | 2s | End cards and event/DOOH transitions only. |

## OOH system

Use one thought per placement. Preferred lines:

- **Every missed call has a next call.**
- **Your phone can answer itself.**
- **The call gets handled.**

Pair with `trywireline.com` or an attributable short URL. Use a QR code only when the placement has enough dwell time. Do not show product UI unless captured from the exact promoted production commit.

## ElevenLabs production lane

1. Lock final legal-reviewed copy in the launch campaign document.
2. Render narration with `npm run campaign:vo`; the output is marketing-only and gitignored.
3. Generate candidate music offline through the existing jingle workflow; retain prompts, model/version, render date, and reviewer decision with the production package.
4. Build `npm run campaign:package` to produce `official-assets/campaign-studio/delivery-manifest.json` for the editor.
5. Approve voice pronunciation, audio quality, music rights, claims, and exact-production product capture before export.

Use a controlled brand voice or an authorized clone only. Never imitate a public figure, customer, or employee without documented authorization.

## Sound direction

The sound should feel like the relief after a near miss: one human ring, a clean response, a small resolving mark. Avoid stock call-center music, hype-announcer reads, or music beneath real agent audio. Let the product voice carry the proof.
