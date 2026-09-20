# Launch Asset Provenance

## Scope

This record covers the September 2026 **The Second Ring** static and motion campaign package. It identifies generated editorial sources, brand inputs, typography, deterministic rendering, motion/audio inputs, and the limits of what the files prove.

Generation date: 2026-09-01
Repository base at generation: `13fd4807f43a352d1d7a11da7c03f50460b0caee`
Release commit: not assigned at authoring time
Primary renderer: `scripts/render-botbound-launch-perfection-assets.mjs`

Copy revision, September 20: public copy describes capabilities and outcomes without a setup-step list. The factual source map below reflects that revision; the original generation dates and export evidence remain historical. The local investor PDF was regenerated using the repository's ReportLab renderer and its one-page layout was visually reviewed through a PDFium PNG at 150 DPI. Text extraction confirmed the absence of public setup-step copy and the September 20 copy-review date. Older Home/Features captures require regeneration after their source changes. Other rendered assets and remote copies need copy review before reuse; source edits alone do not update or recertify them.

## Newly Generated Editorial Source Art

The descriptions below are faithful recreation-prompt summaries, not verbatim tool logs. The exact generation prompt was not embedded in either PNG.

### Impeccably Bad Timing — Florist

**File:** `sources/botbound-impeccably-bad-timing-florist-portrait.png`
**Method:** OpenAI image generation
**Format:** 9:16 portrait PNG
**Purpose:** cinematic problem-recognition art for feed/story campaign compositions

**Recreation-prompt summary:** A cinematic editorial nighttime florist shop. An overwhelmed woman florist carries an enormous bouquet with both hands while a black rotary phone visibly rings just out of reach on the counter. Warm tungsten practical lighting, deep obsidian shadows, premium 35mm film character, restrained violet BotBound accents, realistic hands and anatomy, and generous headline-safe negative space. No text, logos, or product UI.

**Representation boundary:** This is generated campaign illustration. It is not customer footage, documentary evidence, a testimonial, or BotBound product UI.

### The Signal — OOH

**File:** `sources/botbound-the-signal-ooh-wide.png`
**Method:** OpenAI image generation
**Format:** 16:9 landscape PNG
**Purpose:** wide cinematic source for the campaign's billboard concept

**Recreation-prompt summary:** A midnight city after rain, rendered as premium photoreal billboard cinematography. A luminous translucent violet classic telephone receiver floats in the right half of the frame with concentric signal rings. Approximately 55% of the left side remains dark, clean negative space for OOH copy. Obsidian, violet, and platinum palette. No text, logos, product UI, or people.

**Representation boundary:** This is generated symbolic campaign art. It does not depict a literal BotBound device or product screen.

## Additional Generated Editorial Source

### Bakery Hero

**Release source:** `sources/botbound-hands-full-bakery-original.png`
**Film source derivative:** `../../apps/botbound-film/public/brand/hands-full-opening-original.png`
**Method:** OpenAI image generation
**Format:** 16:9 landscape PNG
**Used by:** `exports/social/botbound-hands-full-linkedin-1200x627.png`
**Purpose:** cinematic owner-at-work image for the Hands Full campaign concept

**Recreation-prompt summary:** A cinematic nighttime bakery with a working baker carrying fresh pastry trays, a clear dark headline-safe area at left, warm oven light, restrained violet practical accents, realistic anatomy, and no text, logos, or product UI. The BotBound operator is composited separately by the deterministic static and motion renderers.

**Representation boundary:** This is original generated campaign illustration. It is not customer footage, documentary evidence, a testimonial, or BotBound product UI. Generated-art, likeness, and commercial-use review remains required before paid distribution.

### Fallback Florist Source

**File:** `../launch-stills/botbound-second-ring-florist-story-1440x2560.jpg`
**Use:** renderer fallback only if the newly generated florist source is absent
**September render behavior:** the newly generated florist source is present and is the intended input.

## Brand Inputs

- `../../public/brand/botbound-app-icon.png`
- `../../public/brand/botbound-operator-polished.png`
- `../BOTBOUND-BRAND-GUIDE.md`
- Campaign palette: Obsidian `#050508`, Ink `#0A0A0E`, Signal Violet `#A78BFA`, Signal Light `#C4B5FD`, Platinum `#F8F7FC`, and restrained neutral support tones.

The polished operator is the campaign/hero illustration. The flatter primary operator remains appropriate for compact or editorial identity use; the two do not represent different products.

## Typography

The deterministic renderer reads the following intentionally tracked local
font inputs. Keeping them in source control makes a clean-clone render
independent of workstation fonts and network availability:

- `../fonts/InterTight-ExtraBold.ttf`
- `../fonts/Inter-Regular.ttf`
- `../fonts/Inter-SemiBold.ttf`
- `../fonts/Inter-Bold.ttf`
- `../fonts/Inter-ExtraBold.ttf`
- `../fonts/IBMPlexMono-Bold.ttf`

The repository also retains the canonical variable-family release inputs:

- `../fonts/Inter-Variable.ttf`
- `../fonts/InterTight-Variable.ttf`

Exact SHA-256 values and the source-control policy are recorded in
`../fonts/README.md`. Generated delivery copies under this launch package may
remain ignored because they are reproducible from those tracked source inputs.

The tracked release archive contains the upstream copyright and complete SIL
Open Font License 1.1 notices beside the delivered font files:

- `fonts/OFL-Inter.txt` — upstream: `https://github.com/rsms/inter/blob/master/LICENSE.txt`;
- `fonts/OFL-Inter-Tight.txt` — upstream: `https://github.com/rsms/inter-tight/blob/main/OFL.txt`;
- `fonts/OFL-IBM-Plex-Mono.txt` — upstream: `https://github.com/IBM/plex/blob/master/LICENSE.txt`.

Inter Tight carries campaign headlines, Inter carries body/support copy, and IBM Plex Mono carries labels, sequence markers, and operational details. Keep the applicable copyright and OFL notice with every release archive and comply with the OFL conditions for any redistribution or modification.

## Deterministic Compositions

`scripts/render-botbound-launch-perfection-assets.mjs` assembles the source art, approved BotBound marks, current campaign copy, and local font files into PNG masters with Resvg. It produces:

- one 3840 × 2160 billboard master;
- one 1200 × 627 Hands Full social master;
- one 1080 × 1350 and one 1080 × 1920 Impeccably Bad Timing master;
- five 1080 × 1350 OpenAI voice carousel slides;
- one 1200 × 627 Inbound & Outbound Bots channel graphic (the historical `ring-to-next-action` filename is retained);
- one 1080 × 1080 Call Sheet graphic;
- one 1200 × 400 launch-email header;
- one 1920 × 1400 campaign contact sheet.

The render script is the editable composition source. Exported PNGs should not be manually patched without updating provenance and checksums.

## Motion Release Provenance

The three priority motion masters were rendered from the repository-owned Remotion project in `../../apps/botbound-film/` using `scripts/render-launch-social.mjs`:

- `exports/motion/botbound-second-ring-6s-vertical-1080x1920.mp4`;
- `exports/motion/botbound-second-ring-10s-square-1080x1080.mp4`;
- `exports/motion/botbound-second-ring-15s-vertical-1080x1920.mp4`.

Picture inputs are the original generated `apps/botbound-film/public/brand/hands-full-opening-original.png`, approved BotBound brand rasters in that project, and deterministic code-rendered scene/UI compositions. The live-answer and workflow moments are clearly framed as configured examples and product capabilities, not customer footage, a customer result, or deployed-product proof.

The score and effects are repository-owned deterministic audio generated by `apps/botbound-film/scripts/generate-audio.mjs`: `botbound-score.mp3`, `phone-ring.wav`, and `transfer-chime-approved.wav`. Their source checksums are recorded in `apps/botbound-film/ASSET_MANIFEST.md`. The exports contain no synthetic or performed dialogue and use no ElevenLabs asset; dialogue is communicated visually through on-screen configured-example copy.

Caption timing and copy are owned by `apps/botbound-film/src/captions.ts` and `apps/botbound-film/public/captions/`. Each delivered cut has JSON, SRT, and WebVTT sidecars. `exports/motion/metadata.json`, `exports/motion/SHA256SUMS.txt`, and the opening/midpoint/end-frame contact sheet record the technical and sampled-frame QA state. All three masters are H.264/AAC at 30 fps; they remain cinematic campaign concepts pending final owner and rights review.

## Factual Source Map

| Claim                                                             | Repository authority                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Bots across calls, texts, and email                            | `../../README.md`, `../../src/pages/Pricing.tsx`                         |
| Build free; plans from $19/month; activation availability applies | `../../src/lib/plan-catalog.ts`, `../../src/pages/Pricing.tsx`           |
| Ten built-in OpenAI Realtime voices                               | `../../src/lib/voice-catalog.ts`, `../../docs/OPENAI_REALTIME_VOICE.md`  |
| Selected voice fixed for active session                           | `../../docs/OPENAI_REALTIME_VOICE.md`                                    |
| OpenAI live runtime; Twilio carrier/numbers/SMS                   | `../../docs/OPENAI_REALTIME_VOICE.md`, `../../docs/VENDOR_LAUNCH_MAP.md` |
| Configured tools/approvals determine actions                      | `../../README.md`, `../../src/lib/plan-catalog.ts`                       |

## Provider and Media Boundaries

- No ElevenLabs asset, voice, key, or provider claim is used in this package.
- The OpenAI voice carousel describes the product's current built-in Realtime roster; it does not include cloned or custom voices.
- Static generated scenes contain no fabricated BotBound dashboard.
- The current channel graphic explains parallel Calls, Texts, and Email capabilities with a private-rehearsal and paid-live-activation qualifier. The Call Sheet is visibly labeled illustrative. Neither is a customer result.
- No customer recording, logo, testimonial, personal data, or performance metric is used.
- Any motion export has separate audio, caption, and picture provenance and must be governed by its own release record.

## Release Controls

Before public or paid distribution:

1. generate SHA-256 checksums for every source and export;
2. confirm the exact renderer revision and final release commit;
3. review full-resolution exports for crop, anatomy, spelling, color, and unintended marks;
4. confirm generated-art, likeness, trademark, music, and voice commercial rights, and retain the archived OFL notices with the font files;
5. recheck pricing, voice roster, runtime, channel, and configured-action claims against production;
6. keep all campaign art distinct from certified product proof;
7. record the final placement, copy, destination, approval, and publication date.
