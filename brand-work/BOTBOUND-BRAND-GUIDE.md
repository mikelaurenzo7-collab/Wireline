# BotBound Brand System

Production identity approved 2026-08-20.

## The Idea

BotBound gives businesses Bots for calls, texts, and email while their people stay with the work. The identity makes that promise literal: a calm, friendly robot visibly grips a classic phone receiver to its ear. The hand is essential. It turns a generic support-bot silhouette into a specific, ownable operator.

The brand line is:

> Put Your Bot on the Line.

The product promise is:

> Bots for calls, texts, and email.

The general product category is **Inbound & Outbound Bots**. The current refresh leads with **Stay in the Work.** and **Small Team. Bigger Reach.** The September Drive **Your Next Sales Hire** and **Give Sales a Hand** campaigns remain sales variants; “sales hire” describes software, not an employment service. See [the current copy kit](gtm/BOTBOUND-LAUNCH-COPY-KIT.md).

## Primary Identity

- Use the approved white and platinum robot with the violet receiver.
- Keep the receiver on the robot's left side, pressed to the ear, with the white hand visibly wrapped around it.
- Keep both B glyphs in `BotBound` complete. Never notch, stencil, split, crop, or turn either B into a pictogram.
- Use title case `BotBound` in product and brand lockups. `BOTBOUND` is reserved for short campaign labels, URLs, and small mono utility copy.
- Set the wordmark in Inter Tight ExtraBold, weight 800, with optical tracking near `-0.047em`.
- Set `Bot` in platinum or obsidian and `Bound` in Aurora violet. Do not gradient-fill the wordmark.

### Master Files

- `../public/brand/botbound-app-icon.png`: full-bleed app, avatar, favicon, native, billing, and browser master.
- `../public/brand/botbound-operator-polished.png`: dimensional hero operator for web, film end cards, campaign composition, and oversized display use.
- `selected/botbound-operator-primary.png`: flat campaign operator for diagrams, compact editorial layouts, and compatibility placements.
- `exports/identity/botbound-lockup-obsidian-1600x480.png`: approved dark-surface horizontal lockup.
- `exports/identity/botbound-lockup-platinum-1600x480.png`: approved light-surface horizontal lockup.
- `exports/identity/botbound-lockup-transparent-1600x480.png`: transparent presentation lockup.

## Clear Space and Minimum Size

- Clear space around the app icon: at least one antenna-ball diameter on every side.
- Clear space around the horizontal lockup: at least the height of the lowercase `o` on every side.
- Minimum app icon: 24 px in UI, 32 px preferred, 48 px for marketing navigation.
- Minimum horizontal lockup: 144 px wide on screen.
- At tiny sizes, use the app icon, not the transparent operator.
- Do not place the white operator directly on white or uncontrolled photography. Use the full app icon or an obsidian field.

## Color

| Role | Name | Hex | Use |
| --- | --- | --- | --- |
| Canvas | Obsidian | `#0A0A0E` | Primary field and dark UI |
| Deep canvas | Black Violet | `#050508` | Vignettes and film transitions |
| Signal | Aurora Violet | `#A78BFA` | `Bound`, primary actions, signal rings |
| Signal strong | Receiver Violet | `#8B5CF6` | Receiver, pressed states, high-energy accents |
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

- Do not break either B.
- Do not redraw the robot.
- Do not remove the hand.
- Do not add a second ear pad or make the receiver read as a headset.
- Do not gradient-fill `BotBound`.
- Do not put the transparent operator on a light field without contrast support.
- Do not recolor the receiver away from the violet family.
- Do not pair the mark with the retired Wireline W.

## Governance

The canonical web implementation is `src/components/brand/BotBoundMark.tsx` plus `src/components/brand/BotBoundBrand.tsx`. Production raster generation is owned by `scripts/render-image-assets.mjs`. Launch placements are generated by `scripts/render-botbound-launch-assets.mjs`. Any new surface should consume those sources instead of creating local geometry.
