# BotBound Brand System

Production identity locked 2026-09-23 as a hybrid. Do not publish this pack until CoS unlocks it and deploy is healthy.

## The Idea

BotBound gives businesses Bots for calls, texts, and email while their people stay with the work. Marketing uses **A Presenting** (character + cell phone). In-product chrome, favicon, PWA, and Stripe use **B letterpress**, a flat violet phone glyph that still reads at 16×16.

The brand line is:

> Put Your Bot on the Line.

The product promise is:

> Bots for calls, texts, and email.

The general product category is **Inbound & Outbound Bots**. The current refresh leads with **Stay in the Work.** and **Small Team. Bigger Reach.** The September Drive **Your Next Sales Hire** and **Give Sales a Hand** campaigns remain sales variants; “sales hire” describes software, not an employment service. See [the current copy kit](gtm/BOTBOUND-LAUNCH-COPY-KIT.md).

## Primary Identity

- Product name is `BotBound` only. Never use Wireline in filenames, art, or alt text.
- **A Presenting** is the marketing lockup, app tile, and OG image. Cell phone only. No landline, handset, or coiled cord.
- **B letterpress** is the in-product mark (`BotBoundMark`), favicon, PWA icons, Apple touch, Stripe icon/logo, and Studio chrome.
- Keep both B letters in `BotBound` complete. Never notch, stencil, split, crop, or replace either B with a robot head.
- Use title case `BotBound` in product and brand lockups. `BOTBOUND` is reserved for short campaign labels, URLs, and small mono utility copy.
- Set the wordmark in Inter Tight ExtraBold, weight 800, with optical tracking near `-0.047em`. Product UI uses the CSS wordmark in `BotBoundBrand`, not a raster that swaps letters for a pictogram.
- Set `Bot` in platinum or obsidian and `Bound` in Aurora violet. Do not gradient-fill the wordmark.

### Master Files

- `../public/brand/botbound-mark.png` / `.svg`: B letterpress violet phone glyph. Canonical `BotBoundMark` source.
- `../public/brand/botbound-operator-primary.png`: same B glyph; campaign scripts that still say "operator" consume this file.
- `../public/brand/botbound-operator-polished.png`: alias of the B glyph so older launch renderers do not 404. Do not treat it as photoreal receiver art.
- `../public/brand/botbound-app-icon.png` / `botbound-app-icon-1024.png`: A Presenting marketing tile, no wordmark.
- `../public/brand/presenting-lockup-dark.png`, `presenting-lockup-light.png`, `presenting-transparent.png`: A Presenting lockups.
- `../public/brand/og-image.png`: 1200×630 Presenting OG master. `npm run assets` copies it to the gitignored `/og-image.png`.
- `../public/brand/botbound-wordmark-dark.svg` / `botbound-wordmark-light.svg`: typographic wordmark with both B letters intact.
- `selected/botbound-operator-primary.png`: B glyph copy for campaign selected/.
- `exports/identity/botbound-lockup-obsidian-1600x480.png`: historical campaign lockup; regenerate from current masters before reuse.
- `exports/identity/botbound-lockup-platinum-1600x480.png`: historical campaign lockup; regenerate from current masters before reuse.
- `exports/identity/botbound-lockup-transparent-1600x480.png`: historical campaign lockup; regenerate from current masters before reuse.

## Clear Space and Minimum Size

- Clear space around the Presenting app tile: keep the character inside the maskable safe zone (~80% center) for PWA.
- Clear space around the letterpress glyph: do not crop the phone body or earpiece bar.
- Clear space around the horizontal lockup: at least the height of the lowercase `o` on every side.
- Minimum in-product mark: 16 px (favicon), 24 px in UI, 32 px preferred.
- Minimum horizontal lockup: 144 px wide on screen.
- At tiny sizes, use the B letterpress glyph, not Presenting photoreal art.
- Do not place Presenting photography on an uncontrolled light field without an obsidian tile.

## Color

| Role | Name | Hex | Use |
| --- | --- | --- | --- |
| Canvas | Obsidian | `#0A0A0E` | Primary field and dark UI |
| Deep canvas | Black Violet | `#050508` | Vignettes and film transitions |
| Signal | Aurora Violet | `#A78BFA` | `Bound`, primary actions, signal rings |
| Signal strong | Receiver Violet | `#8B5CF6` | Presenting screen glow, pressed states, high-energy accents |
| Signal light | Lilac | `#C4B5FD` | Eyebrows, highlights, secondary signal |
| Primary type | Platinum White | `#F5F4F8` | Headlines and `Bot` on dark |
| Hardware | Platinum | `#C7CCD6` | Secondary accents and robot material |
| Secondary type | Smoke | `#B6B1C6` | Supporting copy |

Violet is a signal, not decoration. Use it to show an answer, connection, active state, or conversion. Keep most surfaces obsidian and platinum so the signal stays meaningful.

## Typography

- Display and wordmark: Inter Tight, 800.
- Product body: Inter, 400 to 700.
- Operational labels and campaign eyebrows: IBM Plex Mono, 700, uppercase, wide tracking.
- Hero headlines are compact, direct, and left aligned. Favor 0.82 to 0.95 line-height.
- Author all titles, headlines, and brand lines in Title Case. Body copy uses sentence case. Uppercase is reserved for compact operational labels and status signals; do not use CSS to recase names or customer text.

## Photography and Image Direction

Show competent people in the middle of real work: hands occupied, attention committed, environment specific. Light scenes like prestige craft advertising, not generic software stock.

- Use deep practical shadows, warm work light, and restrained violet signal light.
- Preserve intentional negative space for campaign copy.
- The robot may enter the world as a believable premium character, but must retain the approved white/platinum shell, black visor, friendly violet eyes, antenna, visible gripping hand, and classic violet receiver. Use the dimensional polished operator for hero placements and the flat operator only when the layout needs graphic simplicity.
- Avoid humanoid faces, metallic menace, headset silhouettes, floating chat bubbles, neon overload, fake interface screens, and text generated inside source photography.

## Motion and Sound

The signature motion is the second ring: the first ring belongs to the missed call, and the second ring becomes the violet BotBound signal. Signal rings should expand from the receiver with soft decay, never pulse continuously like an alarm.

- Use confident 10 to 18 frame eases and restrained spring response.
- Let practical sound lead before music.
- Use the two-note transfer chime as the sonic seed: D5 to A5, clean and warm.
- The phone answer moment should reduce the score and let human voice carry the proof.

## Product Application

- Public navigation uses the standard lockup with a 42 px mark and 18.9 px wordmark.
- Hero lockups use the display size with an 84 px mark and 38.7 px wordmark.
- Compact product chrome uses a 32 px app icon and a complete 800-weight wordmark.
- All web, Stripe, browser extension, iOS, and Android outputs derive from the one app-icon master.
- Use raster masters in production. SVG files in legacy paths are compatibility wrappers only, not alternate drawings.

## Do Not

- Do not break either B, and do not replace a B with a robot head.
- Do not put photoreal Presenting art in `BotBoundMark`, favicon, PWA, or Stripe icon slots.
- Do not put the letterpress glyph on marketing OG or the store app tile.
- Do not revive landline, handset, or coiled-cord art in FINAL surfaces.
- Do not gradient-fill `BotBound`.
- Do not emit `wireline-*` brand twins under `public/`.
- Do not pair the mark with the retired Wireline W.

## Governance

The canonical web implementation is `src/components/brand/BotBoundMark.tsx` plus `src/components/brand/BotBoundBrand.tsx`. Production raster generation is owned by `scripts/render-image-assets.mjs`. Launch placements are generated by `scripts/render-botbound-launch-assets.mjs`. Any new surface should consume those sources instead of creating local geometry.
