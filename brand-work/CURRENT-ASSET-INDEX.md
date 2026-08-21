# BotBound Brand and Launch Asset Index

Status: approved launch system, revision 3, 2026-08-20.

The production identity is the friendly white/platinum robot visibly gripping a violet phone receiver, paired with a complete Inter Tight ExtraBold `BotBound` wordmark. Both B glyphs are complete and unbroken.

## Source of truth

- Launch library: https://drive.google.com/drive/folders/1IuBVwWQIFQZbBCeSW5DKLxeBOmSygTuF
- Native Google Slides launch deck: https://docs.google.com/presentation/d/1VDwq4RTI86V1DKfKRkcEG7ojve52-JVqMeTYFhy7GIQ/edit?usp=drivesdk
- Decks and GTM folder: https://drive.google.com/drive/folders/12ynmOVkcvJJKHc-PNhv9gSLKh3jHRyIu
- Archived revision 3 product proof (2026-08-20; not current release evidence): https://drive.google.com/drive/folders/1FVW4a87GFOELb3ivNt6UAbR349fB7FZy
- Commercial package: https://drive.google.com/drive/folders/1DzD3AwRJx1EDM61vcvbJPPbdXaQN66M4
- Accessibility captions: https://drive.google.com/drive/folders/1nBwFmpmTN2GUb7ABIOlm83IynMh9chqo
- Revision 3 checksum manifest: https://drive.google.com/file/d/1UWLgskUaEbH1NxXrhzX4kPgej8Cqye0Y/view

## Identity

- `selected/botbound-app-icon.png`
- `selected/botbound-operator-primary.png`
- `exports/identity/botbound-lockup-obsidian-1600x480.png`
- `exports/identity/botbound-lockup-platinum-1600x480.png`
- `exports/identity/botbound-lockup-transparent-1600x480.png`

## Campaign and finished placements

- Repository editorial inputs:
  - `commercial/hands-full-opening-2560x1440.jpg`
  - `launch-stills/botbound-second-ring-bakery-hero-2560x1440.jpg`
  - `launch-stills/botbound-hands-full-auto-social-1600-square.jpg`
  - `launch-stills/botbound-second-ring-florist-story-1440x2560.jpg`
- Full-resolution PNG originals are certified Drive delivery assets.
- `exports/social/botbound-launch-linkedin-1200x627.png`
- `exports/social/botbound-launch-instagram-1080-square.png`
- `exports/social/botbound-launch-story-1080x1920.png`
- `exports/ooh/botbound-second-ring-billboard-4k.png`
- `exports/email/botbound-launch-email-header-1200x400.png`
- `exports/commercial/botbound-commercial-endframe-4k.png`

## Archived revision 3 product proof — not current release evidence

These captures preserve the 2026-08-20 revision 3 snapshot. They predate the current launch copy, identity, and UI changes. Do not publish or cite them as evidence for the current release; current browser proof remains pending a fresh production-build capture, visual review, and checksum.

- `exports/product-proof/botbound-brand-ui-comparison.jpg`
- `exports/product-proof/botbound-home-desktop-1440x900.png`
- `exports/product-proof/botbound-home-mobile-390x844.png`
- `exports/product-proof/botbound-features-desktop-1440x900.png`
- `exports/product-proof/botbound-pricing-desktop-1440x900.png`
- `exports/product-proof/botbound-launch-proof.json`
- `../design-qa.md`

## Decks and GTM

- Editable PPTX source in Drive: https://docs.google.com/presentation/d/1d7XuU2ZvV4tSyouCHJMqjme3CbqyAY4y/edit
- `gtm/BOTBOUND-LAUNCH-DECK-2026-08-20-contact-sheet.png`
- `gtm/BOTBOUND-LAUNCH-COPY-KIT.md`

## Motion package

- Source, production notes, render commands, and composition registry: `../apps/botbound-film/`
- Registered outputs: 30-second, 15-second, and 6-second horizontal; 15-second and 6-second vertical; 10-second square.
- New social reviews:
  - https://drive.google.com/file/d/19UbBYdvB-wHhr32GtM0a_AgwH2F2JZxC/view
  - https://drive.google.com/file/d/1xojnxswqSlhVWlN1Z8OY60LR_OPoq-l1/view
- Deterministic caption sidecars for the 30-second, 15-second, and 6-second cuts are stored as JSON, SRT, and WebVTT.

Files in `apps/botbound-film/out/` are review proofs. Broadcast and paid-delivery masters should be rendered from the registered 4K compositions, reviewed in their delivery context, and checksummed before release.

## Integrity and regeneration

- `DELIVERY-SHA256SUMS-R3.txt` covers the 62-file certified Drive delivery snapshot.
- `SOURCE-SHA256SUMS.txt` covers the compact repository source package and preserves the archived revision 3 browser proof.
- Product, native, billing, OG, and browser icons: `npm run assets`
- Launch placements: `npm run brand:launch`
- Fresh current-release browser proof: `npm run brand:proof`, followed by visual review and checksum refresh
- Film compositions and render commands: `apps/botbound-film`
