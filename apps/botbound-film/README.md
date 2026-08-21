# BotBound — The Second Ring

A deterministic Remotion launch-film package built around the approved BotBound phone-operator robot and the “Hands Full” opening image.

## Compositions

| Composition | Runtime | Canvas | Purpose |
| --- | ---: | ---: | --- |
| `BotBound-SecondRing-30s-4K` | 30s | 3840×2160 | Broadcast / hero master |
| `BotBound-SecondRing-15s-4K` | 15s | 3840×2160 | Paid social / CTV cutdown |
| `BotBound-SecondRing-6s-4K` | 6s | 3840×2160 | Bumper / pre-roll |
| `BotBound-SecondRing-15s-Vertical-4K` | 15s | 2160×3840 | Reels / Shorts / TikTok |
| `BotBound-SecondRing-6s-Vertical-4K` | 6s | 2160×3840 | Vertical bumper / story placement |
| `BotBound-SecondRing-10s-Square-4K` | 10s | 2160×2160 | Square feed / launch social |

All compositions run at 30 fps and use frame-driven Remotion animation only. The editorial source photograph, robot mark, repository-optimized app icon, self-hosted fonts, original deterministic score, phone-ring effect, and approved transfer chime are local to this package. Full-resolution delivery media remains in the certified Drive launch tree.

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

## H.264 review exports

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

## Accessibility caption sidecars

The `public/captions/` directory includes caption data for the 30s, 15s, and 6s cuts in three deterministic formats:

- Remotion `Caption[]` JSON, type-checked through `src/captions.ts`.
- SRT for conventional video platforms and media handoff.
- WebVTT for web players.

The sidecars contain only exact on-screen copy and audible ring/chime cues. They do not add voiceover or dialogue that is not visible in the film. The 15s asset applies to both 15s canvases; the 6s asset applies to both 6s canvases. Regenerate the SRT and WebVTT derivatives with `npm run captions:export` after editing JSON timing or copy.

## ProRes broadcast master

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

The `out/` directory is intentionally ignored except for its placeholder. Delivery renders should be accompanied by a SHA-256 manifest generated after approval.
