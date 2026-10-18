# BotBound Logo Call

An eight-second animated brand sting built from BotBound's approved phone-operator robot. The logo takes the second ring, comes alive, speaks on the line, follows the configured playbook, and closes on a booked next step.

## Final masters

- `botbound-logo-call-8s-square-1080x1080.mp4` — 1:1 social feed, paid social, and presentation use
- `botbound-logo-call-8s-vertical-1080x1920.mp4` — 9:16 Reels, Stories, and Shorts use
- `botbound-logo-call-square-poster-1080x1080.png` — square cover/poster frame
- `botbound-logo-call-vertical-poster-1080x1920.png` — vertical cover/poster frame

Both masters are H.264 with AAC stereo audio, 30 fps, and 8.02 seconds long.

## Motion arc

- Numbered first- and second-ring hook
- Eyes wake through a visor light sweep as the call connects
- Phrase-shaped mouth motion, handset response, antenna movement, a connection halo, and a final wink
- BotBound's traveling silver-to-violet signal wire
- Story beats: `RING.` → `ANSWER.` → `LISTEN.` → `BOOK.`
- Status advances through answering, intent capture, playbook execution, and a booked next step
- Brand close: `PUT YOUR BOT ON THE LINE.` with `CALLS · TEXTS · EMAIL` and `BOTBOUND.ME`
- Layered score, dual ring, approved connection tone, and a distinct booked-result shimmer

## Editable source

The layered Remotion source is in `apps/botbound-film/src/logo-call/BotBoundLogoCall.tsx`.

- Square composition: `BotBound-LogoCall-8s-Square`
- Vertical composition: `BotBound-LogoCall-8s-Vertical`
- Render both from `apps/botbound-film` with `npm run render:logo-call`

Frame checks and render-extracted validation stills are stored in `qa/`.
The superseded first cut is preserved in `archive/first-cut/`.
