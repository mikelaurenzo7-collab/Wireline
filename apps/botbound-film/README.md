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

All compositions run at 30 fps and use frame-driven Remotion animation only. The editorial source photograph, robot mark, repository-optimized app icon, self-hosted fonts, original deterministic score, phone-ring effect, and approved transfer chime are local to this package. Drive deliveries are release copies, not proof that the current working tree or future commit has passed its release gate; use `VERIFICATION.md` for revision-scoped evidence.

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

To render and QA the approved outbound suite:

```bash
npm run render:outbound-social
npm run qa:outbound-social
```

The outbound masters use score and confirmation chime only. They contain no
spoken dialogue, so no caption sidecar is required; the exact on-screen
sequence and accessibility notes live in
`brand-work/launch-2026-09-outbound/ALT_TEXT_AND_ACCESSIBILITY.md`.

## Accessibility caption sidecars

The `public/captions/` directory includes caption data for the 30s, 15s, 10s,
and 6s cuts in three deterministic formats:

- Remotion `Caption[]` JSON, type-checked through `src/captions.ts`.
- SRT for conventional video platforms and media handoff.
- WebVTT for web players.

The sidecars contain only exact on-screen copy and audible ring/chime cues. They do not add voiceover or dialogue that is not visible in the film. The 15s asset applies to both 15s canvases; the 10s asset applies to the square cut; the 6s asset applies to both 6s canvases. Regenerate the SRT and WebVTT derivatives with `npm run captions:export` after editing JSON timing or copy.

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
source commit before approval.
