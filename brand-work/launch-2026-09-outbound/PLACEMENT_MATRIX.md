# Placement Matrix — The First Move

## Release rule

A placement becomes publishable only when its exact asset-and-copy pair is approved in the current Drive launch registry, the production SHA passes the full release ladder, and `outbound_campaign_ready` is true. Visual approval alone does not authorize scheduling or spend.

## Launch set

| Placement | Master | Objective | CTA | Current release status |
|---|---|---|---|---|
| LinkedIn single image | `social/botbound-first-move-linkedin-1200x627.png` | Launch reach and Sales Bot acquisition | Get Your Sales Bot | Design approved; publishing held |
| LinkedIn or Meta square | `social/botbound-list-wont-call-itself-1080x1080.png` | List-led retargeting | Get Your Sales Bot | Design approved; publishing held |
| Instagram Story or Reel cover | `social/botbound-find-call-book-story-1080x1920.png` | High-attention campaign recognition | Get Your Sales Bot | Design approved; publishing held |
| Founder/operator post | `social/botbound-get-your-sales-bot-1080x1350.png` | Brand recognition and product desire | Get Your Sales Bot | Design approved; publishing held |
| Paid social launch master | `social/botbound-point-it-at-a-market-1080x1350.png` | Lead-finder positioning and Sales Bot acquisition | Get Your Sales Bot | Hold for **APPROVED OUTBOUND** regeneration |
| Role rotation | `roles/*.png` | Job-specific acquisition | Matching role CTA | Design approved; publishing held |
| Lead Hunt carousel | `carousel/*.png` in numeric order | Explain discovery, review, queue, and call path | Get Your Sales Bot | Design approved; publishing held |
| Workflow retargeting | `workflow/botbound-outbound-workflow-1200x627.png` | Product-truth retargeting | Build Your Bot | Design approved; publishing held |
| Outcome retargeting | `social/botbound-outbound-call-sheet-1080x1080.png` | Demonstrate the outcome record | Build Your Bot | Design approved; publishing held |
| Launch email | `email/botbound-first-move-email-header-1200x400.png` | Existing audience activation | Get Your Sales Bot | Design approved; copy pair held |
| Outbound campaign/social share | `website/botbound-find-call-book-og-1200x630.png` | Outbound launch link previews and campaign landing pages | Get Your Sales Bot | Design approved; publishing held |
| Investor/design partner | PDF in `investor/` | Explain the outbound wedge and job expansion | Contact BotBound | Hold for corrected-copy regeneration |
| Motion vertical | 15s and 6s vertical MP4s | Story/Reels/TikTok launch and retargeting | Get Your Sales Bot | QA approved; publishing held |
| Motion square | 10s square MP4 | LinkedIn/Meta feed | Get Your Sales Bot | QA approved; publishing held |
| OOH or presentation screen | `hero/botbound-first-move-ooh-3840x2160.png` | Campaign recognition | BotBound.me | Design approved; media delivery held |

## Recommended sequence after release authorization

1. Corrected “Point It at a Market” paid-social master plus founder post.
2. Lead Hunt carousel.
3. Sales Bot and Appointment Bot role ads.
4. Recruiting, Reactivation, and Intake rotations.
5. Workflow and call-sheet retargeting.
6. Motion cutdowns against the winning static hook.

## Tracking pattern

Use the destination `https://botbound.me/signup?template=sales-rep` with:

`utm_source={platform}&utm_medium={paid_social|organic_social|email}&utm_campaign=first_move_launch&utm_content={asset_slug}`

Keep one `asset_slug` per master so the creative, placement, and signup intent can be joined without guessing.

## Mechanical notes

- Story CTA and URL sit inside the central platform-safe zone. Place interactive link stickers below the headline and above the lower UI controls.
- Use the 4:5 role masters as supplied; do not auto-crop them to square.
- Use the corrected PDF, not the PNG preview, for investor distribution after regeneration.
- Convert OOH artwork to the vendor's requested color profile, bleed, trim, and mechanical dimensions before media delivery.
- Do not upload source art, QA frames, manifests, or contact sheets as paid placements.
