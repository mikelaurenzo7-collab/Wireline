# Accessibility E2E Gate

Wireline uses Playwright and axe checks as the first automated accessibility gate for the web app.

## Target standard

- WCAG 2.2 AA where automated checks can verify it.
- Manual keyboard and screen-reader checks for flows that automation cannot prove.

## Critical routes

- `/`
- `/features`
- `/pricing`
- `/showcase`
- `/about`
- `/security`
- `/support`
- `/contact`
- `/signin`

## Manual test matrix

- Keyboard only: Chrome, Safari, Firefox.
- VoiceOver: Safari on macOS and iOS.
- NVDA: Chrome and Firefox on Windows.
- TalkBack: Chrome on Android.

## Release rule

A release should not ship with new critical or serious accessibility regressions on critical routes. If a regression is accepted temporarily, document the affected route, user impact, owner, and removal date.
