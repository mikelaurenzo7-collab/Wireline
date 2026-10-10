# Give Your Bot a Goal — October 2026 Creative

This prepared static family carries the current BotBound story into social, link-preview, and email placements. It pairs the approved phone operator with the **Stay in the Work** photography. The art is illustrative; it is not a customer result or product screenshot.

## The Idea

**Give Your Bot a Goal.** Answer calls. Make calls. Work online.

The campaign headline is intentionally broader than a single channel. BotBound offers inbound and outbound voice work and separately started cloud-browser tasks. The selected paid plan determines whether a Bot has a phone number, managed inbox, or both. This family does not claim shared call, email, and browser history, independent sign-in, automatic completion of every task, or results that have not been observed.

## Assets

| Placement               | File                                                 | Size        |
| ----------------------- | ---------------------------------------------------- | ----------- |
| Link preview / LinkedIn | [Wide](exports/botbound-goal-wide-1200x630.png)      | 1200 × 630  |
| Portrait feed           | [Feed](exports/botbound-goal-feed-1080x1350.png)     | 1080 × 1350 |
| Story / vertical cover  | [Story](exports/botbound-goal-story-1080x1920.png)   | 1080 × 1920 |
| Square feed             | [Square](exports/botbound-goal-square-1080x1080.png) | 1080 × 1080 |
| Email header            | [Email](exports/botbound-goal-email-1200x400.png)    | 1200 × 400  |

Use the matching text and alt text in [the copy kit](COPY-KIT.md). The [manifest](exports/manifest.json) records dimensions, hashes, and source inputs. The destination is `https://botbound.app/signup?plan=free`.

The web asset build copies the wide image to `/og-image.png`; deploying that build makes it the public link preview. The other formats remain prepared placement assets until separately selected.

## Rebuild and Release

Run `npm run brand:goal` from the repository root. The script uses the approved operator, the existing Stay in the Work photograph, and the brand fonts. Inspect all five PNGs after any copy or input change.

Rendering creates review candidates, not permission to publish or spend. Before placement, check the exact destination and offer, review the selected image and caption together, confirm launch operations for the advertised channel, and record the asset hash and publication decision. Keep the September campaigns and their original release records unchanged.
