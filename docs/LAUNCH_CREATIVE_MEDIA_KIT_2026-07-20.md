# Wireline Launch Creative Media Kit

Updated: 2026-08-14  
Status: **Active delivery and capture kit**  
Authority: `docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md`  
Copy owner: `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md`

This kit owns asset delivery, capture/certification, tool briefs, and placement. The campaign document owns shippable campaign copy and cut scripts; **the campaign document wins** when detailed copy differs. The launch source of truth wins over both when positioning, proof posture, or publishability differs.

## Current Creative Doctrine

One story across public creative:

**Build -> Train -> Launch -> Improve**

Use:

- **Voice Agents**
- **Build your Voice Agent**
- **Build free. Go live from $19/mo.**
- **Personal + Business**
- calls, texts, email, follow-up, handoff, and logged outcomes
- real product proof from the production commit being promoted
- Live Video as a paid business proof layer only when the picture comes from an exact-production authenticated session

Avoid:

- employee language as a launch product noun;
- pairing `AI` with `agent` in customer-facing copy;
- competing workflow spines;
- fake dashboards, customer logos, testimonials, adoption counts, or ROI;
- stale screenshots or footage simply because they are already edited;
- presenting a static identity badge, generated avatar concept, or provider mock as a real Live Video session.

Legacy filenames containing older provider or positioning language may remain for file compatibility. Filenames are not current launch copy and must not override this doctrine.

## Brand System

| Element | Direction |
| --- | --- |
| Canvas | Cool near-white or cool obsidian |
| Accent | Electric violet with restrained platinum wire detail |
| Mood | Premium, operational, clear, outcome-driven |
| Product imagery | Call, agent, follow-up, booking/handoff, transcript, outcome, Live Video presenter state when exact-source and truthful |
| Avoid | Generic call-center stock, humanoid robots, abstract AI blobs, vendor marks, unlabeled synthetic avatar proof |

## Required Audio Deliverables

| Asset | Purpose |
| --- | --- |
| `wireline-missed-call-15s.mp3` | 15-second missed-call narration from the campaign pack |
| `wireline-ai-voice-agent-30s.mp3` | **Second Ring** late-entry narration; not a generic walkthrough VO |
| `wireline-founder-60s.mp3` | Founder/product-proof narration |

Generate with `npm run campaign:vo`. Campaign audio is marketing/reference material only and never the production phone-call speech path.

## Required Launch Cuts

| Cut | Format | Purpose | Current posture |
| --- | --- | --- | --- |
| Missed Call | 9:16, 15s | Fast problem -> agent -> outcome -> CTA | Recapture against exact production before publishing |
| Second Ring | 9:16 / 1:1 / 16:9, ~30s | Primary paid-social voice-quality proof | Needs certified captured call/product picture |
| Founder / Product Proof | 16:9, 45-60s | Founder-led explanation and product proof | Recapture against exact production before publishing |
| Live Video Proof | 16:9 / 9:16 / 1:1, 20-30s | Paid business add-on proof: voice agent extends to an on-screen presenter | Needs certified authenticated session proof: session mint, voice sync, explicit stop, and truthful allowance state |
| Two Rings | 6s bumper | Minimal missed-call scroll-stop | Derive from certified captured-call proof |
| sound-off variants | matching paid formats | Muted-viewer accessibility without UI clutter | Produce from each certified paid cut |

## Creative Status — 2026-08-14

### Rejected historical masters

The old 46-second walkthrough and old 15-second missed-call source contain a visible authenticated 404 and are **not publishable**. Do not recirculate them because they were once called final or published.

### Repaired historical derivatives

The repaired 15s, 22s product-loop, and founder walkthrough derivatives remove the old 404, but their picture is historical. They are **QA/editing drafts only** until recaptured and certified against the exact production commit being promoted.

A clean edit of stale product footage is still stale product footage. Raw output is not release-certified.

### Live Video extension

Live Video creative may be prepared as a launch-adjacent business proof asset, but it must not outrank the main voice-agent wedge or make unsupported real-time presenter claims.

A publishable Live Video cut requires exact-production authenticated capture that proves:

- a business agent enters the Live Video product surface;
- the presenter session is real, not an identity badge, placeholder, mock, or generated concept frame;
- voice synchronization is visible or audibly contextualized by real product state;
- the session is explicitly stopped or exits cleanly;
- usage, allowance, or entitlement copy remains truthful for the plan being represented;
- no provider mark, vendor console, secret, token, or unsupported availability claim appears.

Static avatar badges are allowed as product identity UI. They are **not** Live Video proof frames unless the surrounding copy clearly labels them as fallback or setup state.

## Publish Gate

A finished reel is publishable only when all of the following are true:

- source picture was captured from the exact production commit being promoted;
- `marketing-kit/release-record.json` records the exact `sourceCommit`;
- every origin represented in the publishable manifest reports that same commit through `X-Wireline-Source-Commit` **before and after** capture;
- the verified remote commit is the deployed production SHA being represented in the release record;
- no auth wall, 404, loading hold, dead route, error surface, or stale UI appears;
- active UI remains legible after 9:16 or 1:1 reframing;
- product-proof frames are authentic Wireline UI, not generated or fabricated dashboards;
- no unsupported customer, ROI, revenue, adoption, or compliance claim appears;
- pricing and channel claims match the current plan catalog and launch posture;
- the real agent voice is heard at **full level** for a meaningful stretch when voice quality is the selling point;
- Live Video proof uses either a real provider session or a clearly labeled setup/fallback state, never a static badge presented as a live presenter;
- the end frame is deliberate, readable, and current;
- platform captions are provided for accessibility without persistent subtitle clutter over legible UI.

## Capture and Certification

Publishable capture requires a clean checkout of the exact deployed source commit and a real demo/founder production session.

```bash
git checkout <exact-production-sha>
DEMO_EMAIL=<demo-account-email> \
DEMO_PASSWORD=<demo-account-password> \
E2E_BASE_URL=https://trywireline.com \
npm run marketing:kit
```

Publishable capture is restricted to Wireline-owned hosts: `trywireline.com` / its subdomains, the `wireline-chi.vercel.app` project alias, or Wireline deployments in the `revaluate` Vercel namespace. Embedded URL credentials and arbitrary third-party HTTPS hosts are rejected before capture.

An exact Wireline deployment URL may be used as `E2E_BASE_URL`, but the current generator also includes a canonical `trywireline.com` public-screenshot set in the same manifest. Therefore **both origins must already serve the exact source commit** or certification fails closed. Do not use an immutable deployment URL to claim pre-alias certification while the canonical public screenshots still point at an older release.

Before opening a browser, the wrapper requests `HEAD /api/health/public` from every represented origin and requires each `X-Wireline-Source-Commit` header to equal the clean checkout SHA. It repeats the same verification after capture so an alias promotion during recording cannot produce mixed-source media.

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

The technical scene map can use current product surfaces while still expressing the public loop:

| Public beat | Product evidence |
| --- | --- |
| Build | Create/Studio intake and focused agent setup |
| Train | Knowledge/training facts, rules, voice, and behavior |
| Launch | Phone/Connections setup and enabled channels |
| Improve | Call history, transcript, outcome, analytics, or follow-up review |
| Live Video | Paid business Live Video settings, presenter/session status, real presenter frame or explicitly labeled fallback, and usage evidence after clean stop |

Implementation surface names do not create a second brand narrative.

## Raw-Source Visual Acceptance

Certification proves provenance and route distinctness; it does not replace frame review.

Before editing:

- inspect the first, middle, and last frames of every held scene;
- trim route-loading transitions rather than presenting them as product beats;
- verify dropdowns, dialogs, sheets, and portalled controls remain centered and visible;
- reject sign-in redirects, 404s, empty states that imply a defect, or transient error notices;
- reframe vertical video around the active UI rather than shrinking the entire desktop shell;
- verify Live Video frames do not show setup placeholders as if they were active provider sessions;
- verify the final edit meets its named duration and end-card contract.

## Cut Delivery Rules

### Missed Call — 15s

Follow the campaign pack's exact timing. The contrast may use **You cannot pick up.** then **Your agent can.** Keep the real product and outcome legible. End on **Build free. Go live from $19/mo.** and `trywireline.com`.

### Second Ring — ~30s

The captured call and agent response are the proof center. Do not fill the whole cut with narration. Preserve silence where the missed-call problem needs it, then let the real agent voice play at full level.

### Founder / Product Proof — 45-60s

Show **Build -> Train -> Launch -> Improve** with enough time for viewers to understand each useful transition. Do not turn the cut into a speed-run of every tab.

### Live Video Proof — 20-30s

Use Live Video as an extension of the voice-agent story, not a separate product narrative. Start from a useful business context, show the agent's on-screen presenter only after the real product state is established, and keep the session lifecycle visible enough to prove control.

Required beats:

- business agent is already built and trained;
- Live Video is enabled or opened from the authenticated product surface;
- a real presenter session is shown or the frame is explicitly labeled setup/fallback;
- the agent's voice and presenter state are synchronized enough to be understandable;
- session stop, entitlement, or usage state is clean and truthful;
- end card returns to **Build your Voice Agent** and **Build free. Go live from $19/mo.**

Do not use a generated avatar, static badge, or external vendor preview as the proof frame.

### Two Rings — 6s

Derive from the same certified missed-call/captured-call proof. No competing story, no generic AI montage.

### sound-off

For muted placements, extend readable product moments and use sparse on-screen cues. Do not permanently subtitle over dense UI when selectable platform captions can carry accessibility.

## Tool-Ready Briefs

### Static ad

Create a premium Wireline launch ad using authentic product imagery or approved product screenshots. Headline: **Voice Agents**. Support: **Personal + Business. Calls + follow-up + outcomes.** CTA: **Build free. Go live from $19/mo.** Keep the composition clean and operational; no fake customer proof or generic robot imagery.

### Founder video

Use the canonical founder narration from the campaign pack with exact-production product footage. Show Build, Train, Launch, Improve in that order. Keep the product readable and let captured agent audio take over where voice quality is being proved.

### Short-form edit

Cut the certified 15-second source to the campaign pack. Real product proof only after any cinematic problem hook. Preserve the agent at full level during its proof beat. End with the current price line and domain.

### Live Video proof edit

Create a restrained business add-on proof cut from exact-production authenticated footage. Show the trained voice agent moving into an on-screen presenter session, the presenter responding in context, and the clean stopped/usage state. Keep vendor UI and generated avatar concepts out of the publishable frame.

### Launch deck

Six slides maximum: Voice Agents; the missed-call/follow-up problem; Build -> Train -> Launch -> Improve; personal + business workflows; product proof; Build free / Go live from $19/mo. Live Video may appear as a one-frame business add-on proof point only after exact-production capture is certified.

## Asset Organization

Use clear status folders or metadata:

- `Certified` — exact-production source commit recorded and frame-reviewed;
- `QA Drafts` — useful edits that are not release-current;
- `Rejected Historical` — known broken/stale masters retained only for provenance;
- `Audio` — current canonical VO renders;
- `Copy` — current launch copy pack;
- `Live Video` — exact-source session proof, setup/fallback frames, and rejected provider/mock references kept visibly separated.

Never label a historical edit `final` without also recording whether it is release-current.

## Placement Plan

| Channel | Preferred asset | Gate |
| --- | --- | --- |
| Homepage / sales support | 16:9 product-proof cut | Exact-production capture certified |
| LinkedIn organic | Founder post + founder/product proof | Current claims and UI |
| X / short social | Missed-call still or short cut | Current price/domain |
| Meta / LinkedIn paid | Missed Call / Second Ring | Phone + checkout dogfood complete |
| Reels / TikTok | 9:16 Missed Call / Second Ring | Legible vertical reframe + captions |
| Sales follow-up / business add-on | Live Video Proof | Authenticated provider session, clean stop, and entitlement truth certified |

Paid acquisition starts only after the workflow being advertised has passed founder dogfood. Creative polish is not a substitute for product evidence.
