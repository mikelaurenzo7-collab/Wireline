# BotBound Launch Films

A deterministic Remotion launch-film source package built around the approved
BotBound phone-operator robot. It contains the inbound **The Second Ring**
campaign and the outbound **The First Move** campaign. Render names describe
intended placements; they are candidates until the current source revision is
rendered, inspected, checksummed, and approved.

## Compositions

| Composition | Runtime | Canvas | Purpose |
| --- | ---: | ---: | --- |
| `BotBound-SecondRing-30s-4K` | 30s | 3840×2160 | Broadcast / hero candidate |
| `BotBound-SecondRing-15s-4K` | 15s | 3840×2160 | Paid social / CTV cutdown |
| `BotBound-SecondRing-6s-4K` | 6s | 3840×2160 | Bumper / pre-roll |
| `BotBound-SecondRing-15s-Vertical-4K` | 15s | 2160×3840 | Reels / Shorts / TikTok |
| `BotBound-SecondRing-6s-Vertical-4K` | 6s | 2160×3840 | Vertical bumper / story placement |
| `BotBound-SecondRing-10s-Square-4K` | 10s | 2160×2160 | Square feed / launch social |
| `BotBound-FirstMove-15s-Vertical` | 15s | 1080×1920 | Outbound Reels / Shorts / TikTok |
| `BotBound-FirstMove-10s-Square` | 10s | 1080×1080 | Outbound LinkedIn / Meta feed |
| `BotBound-FirstMove-6s-Vertical` | 6s | 1080×1920 | Outbound story / bumper |
| `BotBound-LogoCall-8s-Square` | 8s | 1080×1080 | Illustrative brand sting |
| `BotBound-LogoCall-8s-Vertical` | 8s | 1080×1920 | Illustrative brand sting |
| `BotBound-Cinematic-Inbound-12s-Horizontal` | 12s | 1920×1080 | Inbound cinematic exploration |
| `BotBound-Cinematic-Inbound-12s-Vertical` | 12s | 1080×1920 | Inbound cinematic exploration |
| `BotBound-Cinematic-Inbound-12s-Square` | 12s | 1080×1080 | Registered cinematic exploration |
| `BotBound-Cinematic-Outbound-12s-Horizontal` | 12s | 1920×1080 | Outbound cinematic exploration |
| `BotBound-Cinematic-Outbound-12s-Vertical` | 12s | 1080×1920 | Outbound cinematic exploration |
| `BotBound-Cinematic-Outbound-12s-Square` | 12s | 1080×1080 | Registered cinematic exploration |
| `BotBound-Cinematic-DoubleFeature-24s-Horizontal` | 24s | 1920×1080 | Registered two-direction exploration |

All 18 compositions run at 30 fps. Animation is frame-driven; the cinematic compositions also embed local video and voice tracks from `public/campaign-call/`. The editorial source art, robot mark, app icon, fonts, score, ring, and transfer chime are local inputs. `ASSET_MANIFEST.md` records the original campaign inputs; it does not yet cover the cinematic video/voice sources or certify all 18 compositions. Drive deliveries do not establish current-source approval; use `VERIFICATION.md` for revision-scoped evidence.

## Local review inventory

Source review, 2026-09-19: the inbound and outbound campaign folders each contain three social MP4s (6s vertical, 10s square, 15s vertical). `brand-work/logo-motion-2026-09/` contains two 8s MP4s and posters; `brand-work/cinematic-call-campaign-2026-09/` contains four 12s MP4s (inbound/outbound, horizontal/vertical). These paths are relative to the repository root. No cinematic square or 24s double-feature MP4, or original horizontal/4K MP4 in `out/`, was present at this review. A composition registration is not a rendered deliverable.

The logo and cinematic call displays are illustrative campaign animation. Their LIVE, ANSWERED, CONNECTED, and BOOKED labels, timers, and waveforms do not establish a real customer call, available public demo, or successful integration. The cinematic source needs a visible example label, reviewed claims, documented voice provenance, and transcript/caption coverage before publication. The logo sting uses score, rings, and tones; it is not a spoken product-voice sample. Preserve these working explorations and their source copies when refreshing the original campaign.

## Setup and preview

```bash
cd apps/botbound-film
npm install
npm run audio:generate
npm run captions:export
npm run check
npm run compositions
npm run studio
```

`npm run audio:generate` writes the deterministic PCM source, then creates the repository-safe 160 kbps MP3 used by the compositions. It requires `ffmpeg` on the workstation.

## H.264 review candidates

```bash
npm run render:30
npm run render:15
npm run render:6
npm run render:vertical
npm run render:6-vertical
npm run render:square
```

To render all cuts sequentially:

```bash
npm run render:all
```

To render and QA the outbound delivery suite:

```bash
npm run render:outbound-social
npm run qa:outbound-social
```

`render:outbound-social` is a fail-closed publishing transaction. It removes
the prior approval markers, renders all three masters into a staging directory,
probes the exact 6s/10s/15s set, byte-verifies the installed files, and publishes
`render-provenance.json` last. The prior masters are restored on any handled
installation failure. A hard interruption can leave only an unapproved partial
set: it cannot leave stale metadata claiming that the set passed.

`qa:outbound-social` independently requires those exact three MP4 files, binds
them back to the render receipt, validates codec/frame/audio/duration details,
extracts 12 review frames, and publishes `metadata.json` only after the QA
evidence and `SHA256SUMS.txt` are installed. Metadata records renderer, source,
runtime, render-configuration, media-tool, QA-script, and output hashes. A dirty
worktree is allowed for review candidates because every relevant source byte is
hashed; the exact-input dirty state and Git context remain visible in the
receipt.

The 1080×1920 First Move cuts reserve 220 px above, 340 px below, 96 px at left,
and 144 px at right for Reels/TikTok interface chrome. The QA contact sheet adds
a dashed mint guide for inspection; the guide is never burned into a master.

The outbound masters use score and confirmation chime only. They contain no
spoken dialogue, so no caption sidecar is required; the exact on-screen
sequence and accessibility notes live in
`brand-work/launch-2026-09-outbound/ALT_TEXT_AND_ACCESSIBILITY.md`.

## Accessibility caption sidecars

The `public/captions/` directory includes **Second Ring** caption data for the 30s, 15s, 10s,
and 6s cuts in three deterministic formats:

- Remotion `Caption[]` JSON, type-checked through `src/captions.ts`.
- SRT for conventional video platforms and media handoff.
- WebVTT for web players.

The sidecars contain only exact on-screen copy and audible ring/chime cues. They do not add voiceover or dialogue that is not visible in the film. The 15s asset applies to both 15s canvases; the 10s asset applies to the square cut; the 6s asset applies to both 6s canvases. Regenerate the SRT and WebVTT derivatives with `npm run captions:export` after editing JSON timing or copy.

These sidecars do not cover the cinematic voice tracks. The four local cinematic MP4s currently have no accompanying transcript or caption sidecars. Caption timing must follow each final mix, including its voice start offset and any double-feature edit.

## ProRes broadcast candidate

```bash
NODE_OPTIONS=--require=./scripts/remotion-network-shim.cjs \
  npx remotion render src/index.ts BotBound-SecondRing-30s-4K out/botbound-second-ring-30s-prores.mov \
  --codec=prores --prores-profile=hq --audio-codec=pcm-s16le --concurrency=2
```

## Fast visual checks

```bash
npm run still:opening
npm run still:product
npm run still:endcard
```

The `out/` directory is intentionally ignored except for its placeholder. Its
contents are disposable local renders, not a release record. Delivery renders
must be inspected and accompanied by a SHA-256 manifest tied to the exact
source bytes and recorded Git context before approval.
