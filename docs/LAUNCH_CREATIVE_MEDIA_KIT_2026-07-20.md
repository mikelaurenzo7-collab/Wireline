# BotBound Launch Creative Media Kit

> **October 28, 2026:** Historical creative kit. Current positioning lives in `docs/design/master-plan.md`. Retained for asset provenance.

Domain copy updated September 25, 2026 for `botbound.app`. Previously recorded audio and film must be regenerated and reviewed before publishing; this copy update does not certify old media.

Updated: 2026-08-14  
Status: **Historical delivery and capture kit**  
Authority: `docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md`  
Copy owner: `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md`

This kit owns asset delivery, capture/certification, tool briefs, and placement. The campaign document owns shippable campaign copy and cut scripts; **the campaign document wins** when detailed copy differs. The launch source of truth wins over both when positioning, proof posture, or publishability differs.

## Current Creative Doctrine

One story across public creative:

**Bots for calls, texts, and email.**

Use:

- **Bot** or **Phone Bot**
- **Build Your Bot**
- **Build free. Go live from $19/mo.**
- **One BotBound product across every role**
- calls, texts, email, follow-up, handoff, and logged outcomes
- real product proof from the production commit being promoted

Avoid:

- employee language as a launch product noun;
- pairing `AI` with `agent` in customer-facing copy;
- competing workflow spines;
- fake dashboards, customer logos, testimonials, adoption counts, or ROI;
- stale screenshots or footage simply because they are already edited;
- presenting a static identity badge, generated avatar concept, or provider mock as a real Live Video session;
- publishing retired Live Video narration, presenter sessions, session-mint footage, or paid-add-on claims.

Legacy filenames containing older provider or positioning language may remain for file compatibility. Filenames are not current launch copy and must not override this doctrine.

## Brand System

| Element         | Direction                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| Canvas          | Cool near-white or cool obsidian                                                                              |
| Accent          | Electric violet with restrained platinum wire detail                                                          |
| Mood            | Premium, operational, clear, outcome-driven                                                                   |
| Product imagery | Phone Bot, call, follow-up, booking/handoff, transcript, and outcome                                          |
| Avoid           | Generic call-center stock, humanoid robots, abstract AI blobs, vendor marks, unlabeled synthetic avatar proof |

## Required Audio Deliverables

| Asset                             | Purpose                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `wireline-missed-call-15s.mp3`    | 15-second missed-call narration from the campaign pack             |
| `wireline-ai-voice-agent-30s.mp3` | **Second Ring** late-entry narration; not a generic walkthrough VO |
| `wireline-founder-60s.mp3`        | Founder/product-proof narration                                    |

Generate the three listed outputs with `npm run campaign:vo`. If a compatibility
path also emits `wireline-live-video-25s.mp3`, quarantine it under Rejected
Historical and exclude it from every package. Campaign audio is
marketing/reference material only and never the production phone-call speech
path.

The default OpenAI TTS narration voice (`marin`) is the approved
campaign/reference voice, not a substitute for captured production-call proof.
A contract pins the generator configuration; every cut must still use real
captured Bot audio when selling live-call quality.

## Required Launch Cuts

| Cut                     | Format                  | Purpose                                       | Current posture                                      |
| ----------------------- | ----------------------- | --------------------------------------------- | ---------------------------------------------------- |
| Missed Call             | 9:16, 15s               | Fast problem -> Bot -> outcome -> CTA         | Recapture against exact production before publishing |
| Second Ring             | 9:16 / 1:1 / 16:9, ~30s | Primary paid-social voice-quality proof       | Needs certified captured call/product picture        |
| Founder / Product Proof | 16:9, 45-60s            | Founder-led explanation and product proof     | Recapture against exact production before publishing |
| Two Rings               | 6s bumper               | Minimal missed-call scroll-stop               | Derive from certified captured-call proof            |
| sound-off variants      | matching paid formats   | Muted-viewer accessibility without UI clutter | Produce from each certified paid cut                 |

## Creative Status — 2026-08-14

### Certified rich-state captures exist

A full `npm run marketing:kit` capture was certified against production commit `40c4d02` on 2026-08-14 with a **seeded, working workspace** (live overview KPIs, populated call history, six-thread inbox, clean knowledge facts) instead of the earlier empty-state picture. The historical masters and release record are mirrored in the `launch-assets` storage bucket under `certified-2026-08-14-40c4d02/` and indexed from the legacy-named Drive folder "Wireline Launch Assets — Certified 2026-08-14 (40c4d02)". Certification against that old commit does not make a file release-current; recapture against the production commit being promoted.

Two beats still show setup states in that capture and must be recaptured after the next deploy: the outbound dial dialog and phone setup (number activation was blocked by a carrier purchase bug — Twilio rejects a purchase that sets `voiceFallbackUrl` with an empty `VoiceUrl` — fixed in the same release).

### Historical Live Video provider evidence — retired

A real authenticated production session was exercised on 2026-08-14. That
evidence is retained only to explain the retired implementation. It does not
authorize a product claim, checkout path, session mint, audio deliverable, or
creative cut. Live talking-head video is now fully retired and non-publishable.

### Campaign audio — OpenAI TTS, duration-verified

`npm run campaign:vo` renders the canonical scripts with OpenAI
`gpt-4o-mini-tts` and the built-in `marin` voice. It measures every rendered MP3
by walking its frames and retries the 15-second track at stepped speeds until it
fits the 15.0s hard ceiling. Alternate engines are rejected so campaign
provenance cannot silently drift from the OpenAI-only speech policy.

### Rejected historical masters

The old 46-second walkthrough and old 15-second missed-call source contain a visible authenticated 404 and are **not publishable**. Do not recirculate them because they were once called final or published.

A clean edit of stale product footage is still stale product footage. Raw output is not release-certified.

### Historical Live Video extension and 25-second brief — non-publishable

The former Live Video extension, `wireline-live-video-25s.mp3` narration, session
proof requirements, shot list, and paid-add-on positioning are superseded. Keep
old files only as provenance under **Rejected Historical**. Do not regenerate,
capture, edit, place, or publish them. Static identity badges remain ordinary
Bot identity UI; they are never Live Video proof.

## Publish Gate

A finished reel is publishable only when all of the following are true:

- source picture was captured from the exact production commit being promoted;
- `marketing-kit/release-record.json` records the exact `sourceCommit`;
- every origin represented in the publishable manifest reports that same commit through `X-Wireline-Source-Commit` **before and after** capture;
- the verified remote commit is the deployed production SHA being represented in the release record;
- no auth wall, 404, loading hold, dead route, error surface, or stale UI appears;
- active UI remains legible after 9:16 or 1:1 reframing;
- product-proof frames are authentic BotBound UI, not generated or fabricated dashboards;
- no unsupported customer, ROI, revenue, adoption, or compliance claim appears;
- pricing and channel claims match the current plan catalog and launch posture;
- the real Bot voice is heard at **full level** for a meaningful stretch when voice quality is the selling point;
- no retired Live Video, presenter-session, session-mint, or paid-add-on claim appears;
- the end frame is deliberate, readable, and current;
- platform captions are provided for accessibility without persistent subtitle clutter over legible UI.

## Capture and Certification

Publishable capture requires a clean checkout of the exact deployed source commit and a real demo/founder production session.

```bash
git checkout <exact-production-sha>
DEMO_EMAIL=<demo-account-email> \
DEMO_PASSWORD=<demo-account-password> \
E2E_BASE_URL=https://botbound.app \
npm run marketing:kit
```

Publishable capture is restricted to the canonical BotBound production host, `botbound.app`. Embedded URL credentials, preview aliases, the legacy domain, and arbitrary third-party HTTPS hosts are rejected before capture.

`E2E_BASE_URL` must be the canonical BotBound production URL. The generator includes canonical public screenshots in the same manifest, and certification fails closed unless every represented origin serves the exact checkout commit.

Before opening a browser, the wrapper requests `HEAD /api/health/public` from every represented origin and requires each `X-Wireline-Source-Commit` header to equal the clean checkout SHA. It repeats the same verification after capture so a deployment promotion during recording cannot produce mixed-source media.

The wrapper also invalidates the entire prior `marketing-kit/` output before preflight and removes partial output on any failure. A failed recertification therefore cannot leave an older release record or stale video set available for accidental packaging.

The wrapper proves:

- exact 40-character checkout/source commit;
- clean checkout provenance;
- every represented deployed origin equals the checkout source commit before and after capture;
- `production-session` capture mode;
- exactly three intended video captures;
- complete desktop/mobile/reel authenticated screenshot sets;
- distinct authenticated frames rather than a shared auth wall/error page;
- present, nontrivial video files with hashes in the release record.

`MARKETING_USE_MOCKS=1` and localhost captures are layout/test fixtures. They must never produce a publishable release record. Use `npm run marketing:kit:raw` for that work, and do not supply real demo credentials to third-party or local layout targets.

### Current capture map

Use this internal capture map to gather product evidence. Do not display it as setup steps in public creative:

| Evidence area     | Product evidence                                                              |
| ----------------- | ----------------------------------------------------------------------------- |
| Bot configuration | Create/Studio intake, role, job, knowledge, voice, rules, and private testing |
| Enabled channels  | Ready Phone/Connections setup and enabled channels                            |

Implementation surface names do not create a second brand narrative. Call history, transcripts, outcomes, analytics, and follow-up review demonstrate completed work; they are not another setup step.

## Raw-Source Visual Acceptance

Certification proves provenance and route distinctness; it does not replace frame review.

Before editing:

- inspect the first, middle, and last frames of every held scene;
- trim route-loading transitions rather than presenting them as product beats;
- verify dropdowns, dialogs, sheets, and portalled controls remain centered and visible;
- reject sign-in redirects, 404s, empty states that imply a defect, or transient error notices;
- reframe vertical video around the active UI rather than shrinking the entire desktop shell;
- reject any retired Live Video or presenter-session frame from publishable cuts;
- verify the final edit meets its named duration and end-card contract.

## Cut Delivery Rules

### Missed Call — 15s

Follow the campaign pack's exact timing. The contrast may use **You cannot pick up.** then **Your Bot can.** Keep the real product and outcome legible. End on **Build free. Go live from $19/mo.** and `botbound.app`.

### Second Ring — ~30s

The captured call and Bot response are the proof center. Do not fill the whole cut with narration. Preserve silence where the missed-call problem needs it, then let the real Bot voice play at full level.

### Founder / Product Proof — 45-60s

Show a useful conversation and its completed follow-up or logged outcome. Keep the product readable; do not add setup-step labels.

### Historical Live Video Proof — do not deliver

The former 20–30 second presenter cut is retired and non-publishable. It has no
required beats, placement, CTA, or deliverable status in the BotBound launch.

### Two Rings — 6s

Derive from the same certified missed-call/captured-call proof. No competing story, no generic AI montage.

### sound-off

For muted placements, extend readable product moments and use sparse on-screen cues. Do not permanently subtitle over dense UI when selectable platform captions can carry accessibility.

## Tool-Ready Briefs

### Static ad

Create a premium BotBound launch ad using authentic product imagery or approved product screenshots. Headline: **Put Your Bot on the Line.** Support: **Your Bot for calls, texts, and email.** CTA: **Build free. Go live from $19/mo.** Keep the composition clean and operational; no fake customer proof or generic robot imagery.

### Founder video

Use the canonical founder narration from the campaign pack with exact-production product footage. Show a useful call and its follow-up or logged outcome. Keep the product readable and let captured Bot audio take over where voice quality is being proved.

### Short-form edit

Cut the certified 15-second source to the campaign pack. Real product proof only after any cinematic problem hook. Preserve the Bot at full level during its proof beat. End with the current price line and domain.

### Historical Live Video proof edit — do not execute

The former presenter edit brief is retained as rejected historical provenance. Do not create, regenerate, place, or publish this cut.

### Launch deck

Six slides maximum: BotBound; the missed-call/follow-up problem; product capabilities; role and use-case proof; exact product proof; Build free / Go live from $19/mo. Do not include Live Video.

## Asset Organization

Use clear status folders or metadata:

- `Certified` — exact-production source commit recorded and frame-reviewed;
- `QA Drafts` — useful edits that are not release-current;
- `Rejected Historical` — known broken/stale masters retained only for provenance;
- `Audio` — current canonical VO renders;
- `Copy` — current launch copy pack;
- `Rejected Historical/Live Video` — retired session proof, narration, and provider references; never a source for current launch output.

Never label a historical edit `final` without also recording whether it is release-current.

## Placement Plan

| Channel                  | Preferred asset                      | Gate                                |
| ------------------------ | ------------------------------------ | ----------------------------------- |
| Homepage / sales support | 16:9 product-proof cut               | Exact-production capture certified  |
| LinkedIn organic         | Founder post + founder/product proof | Current claims and UI               |
| X / short social         | Missed-call still or short cut       | Current price/domain                |
| Meta / LinkedIn paid     | Missed Call / Second Ring            | Phone + checkout dogfood complete   |
| Reels / TikTok           | 9:16 Missed Call / Second Ring       | Legible vertical reframe + captions |

Paid acquisition starts only after the workflow being advertised has passed founder dogfood. Creative polish is not a substitute for product evidence.
