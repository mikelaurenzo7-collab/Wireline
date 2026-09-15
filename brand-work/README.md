# BotBound Brand and Launch Asset Index

Approved production direction: the friendly white/platinum robot visibly gripping a violet receiver, paired with a complete Inter Tight ExtraBold `BotBound` wordmark.

Current Drive links, launch revision, and complete delivery inventory: `CURRENT-ASSET-INDEX.md`.

The current campaign is **Your Next Sales Hire**, under the **AI sales bots**
category. The Second Ring stills, placements, and motion package below are
historical reproduction inputs. They do not define the current launch campaign.
Use the current index for approved creative, editable source, and release status.

## Identity

- `selected/botbound-app-icon.png`
- `selected/botbound-operator-primary.png`
- `exports/identity/botbound-lockup-obsidian-1600x480.png`
- `exports/identity/botbound-lockup-platinum-1600x480.png`
- `exports/identity/botbound-lockup-transparent-1600x480.png`

## Campaign source stills

- `commercial/hands-full-opening-2560x1440.jpg`
- `launch-stills/botbound-second-ring-bakery-hero-2560x1440.jpg`
- `launch-stills/botbound-hands-full-auto-social-1600-square.jpg`
- `launch-stills/botbound-second-ring-florist-story-1440x2560.jpg`

Full-resolution PNG originals and finished delivery plates live in the certified Google Drive launch tree linked from `CURRENT-ASSET-INDEX.md`.

## Finished placements

- `exports/social/botbound-launch-linkedin-1200x627.png`
- `exports/social/botbound-launch-instagram-1080-square.png`
- `exports/social/botbound-launch-story-1080x1920.png`
- `exports/ooh/botbound-second-ring-billboard-4k.png`
- `exports/email/botbound-launch-email-header-1200x400.png`
- `exports/commercial/botbound-commercial-endframe-4k.png`

## Guides

- `BOTBOUND-BRAND-GUIDE.md`
- `SECOND-RING-CAMPAIGN.md`

## Product proof and GTM

- Archived 2026-08-20 browser captures and comparison; not current release evidence: `exports/product-proof/`
- Founder launch deck, contact sheet, and copy system: `gtm/`
- Historical revision 3 browser and accessibility record: `../design-qa.md`

Current browser proof remains pending until the production build is recaptured, visually reviewed, and checksummed. Do not publish or cite the archived captures as proof of the current release.

## Motion package and review outputs

- Remotion source, production notes, render commands, and composition registry: `../apps/botbound-film/`
- 30-second 4K H.264/AAC master: `../apps/botbound-film/out/botbound-second-ring-30s-4k.mp4`
- 30-second H.264/AAC review master: `../apps/botbound-film/out/botbound-second-ring-30s-review.mp4`
- 30-second editorial contact sheet: `../apps/botbound-film/out/qa-30s-contact-sheet.jpg`
- 15-second horizontal H.264/AAC review: `../apps/botbound-film/out/botbound-second-ring-15s-review.mp4`
- 15-second horizontal contact sheet: `../apps/botbound-film/out/qa-15s-contact-sheet.jpg`
- 15-second vertical H.264/AAC review: `../apps/botbound-film/out/botbound-second-ring-15s-vertical-review.mp4`
- 15-second vertical contact sheet: `../apps/botbound-film/out/qa-15s-vertical-contact-sheet.jpg`
- 6-second H.264/AAC review proof: `../apps/botbound-film/out/botbound-second-ring-6s-review.mp4`
- 6-second vertical H.264/AAC review: `../apps/botbound-film/out/botbound-second-ring-6s-vertical-review.mp4`
- 10-second square H.264/AAC review: `../apps/botbound-film/out/botbound-second-ring-10s-square-review.mp4`
- JSON, SRT, and WebVTT captions: `../apps/botbound-film/public/captions/`
- Editorial review frames: `../apps/botbound-film/out/frame-*.jpg`
- Horizontal and vertical composition QA frames: `../apps/botbound-film/out/qa-*.jpg`

The files in `apps/botbound-film/out/` are intentionally ignored by Git and delivered through the certified Google Drive launch tree. The checked-in Remotion package recreates them. Broadcast or platform-specific transcodes should be rendered from the registered 4K compositions, then checksummed before release.

## Integrity

- `DELIVERY-SHA256SUMS-R3.txt` is the immutable 62-file manifest for the certified Drive delivery snapshot. Video and full-resolution entries verify after that package is restored from Drive.
- `SOURCE-SHA256SUMS.txt` covers the compact, reproducible repository inputs and preserves the archived revision 3 browser proof included with this branch.
- Paths in both manifests are repository-relative.

## Regeneration

- Product, native, billing, OG, and browser icons: `npm run assets`
- Current launch placements and editable source: follow `CURRENT-ASSET-INDEX.md`.
- Historical Second Ring placements only: `npm run brand:launch:archive`. Output is isolated to `brand-work/archives/second-ring/exports`; the retired renderer rejects unqualified invocation before reading inputs or writing files.
- Historical Second Ring film compositions and render commands: `apps/botbound-film`
