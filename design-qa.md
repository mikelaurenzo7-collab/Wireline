# BotBound Launch Identity Design QA — Archived 2026-08-20 Snapshot

## Result summary

At capture time, the revision 3 BotBound launch identity and coded public experience passed the recorded design QA gate. The complete BotBound wordmark, white phone Bot, gripping hand, violet receiver, and obsidian/platinum/violet palette were coherent from the approved lockup through responsive product surfaces, icons, campaign stills, the founder deck, and the Remotion film system.

This record and its linked captures are an archived 2026-08-20 snapshot. They predate the current launch copy, identity, and UI changes and are not approved evidence for the current release. Current browser proof remains pending until a production build is recaptured, visually reviewed, and checksummed.

## Browser evidence

- Runtime: production bundle in headless Chromium through the authorized Playwright CLI.
- Desktop viewport: 1440 x 900 CSS pixels, device pixel ratio 1.
- Mobile viewport: 390 x 844 CSS pixels, device pixel ratio 1.
- Media state: dark color scheme and reduced motion.
- Home desktop: `brand-work/exports/product-proof/botbound-home-desktop-1440x900.png`
- Home mobile: `brand-work/exports/product-proof/botbound-home-mobile-390x844.png`
- Features desktop: `brand-work/exports/product-proof/botbound-features-desktop-1440x900.png`
- Pricing desktop: `brand-work/exports/product-proof/botbound-pricing-desktop-1440x900.png`
- Approved-identity and implementation comparison: `brand-work/exports/product-proof/botbound-brand-ui-comparison.jpg`
- Machine-readable runtime proof: `brand-work/exports/product-proof/botbound-launch-proof.json`

At capture time, every captured route returned HTTP 200 with zero root or body horizontal overflow, zero page errors, and zero console errors.

## Automated verification

- `npm run lint`: passed.
- `npm run design:check`: passed across 10 Clear System modules, the command-palette contract, 12 public marketing surfaces, and 984 scanned source files.
- `npm run csp:check`: passed; `vercel.json` matches the executable CSP source.
- `npm run build`: passed, including canonical image generation, Vite production build, 42 prerendered BotBound route shells, and the server bundle.
- Focused Playwright suite: 13 of 13 tests passed in Chromium.
  - Home, features, pricing, demos, and sign-in remain in document flow without horizontal escape.
  - Desktop, short-laptop, short-wide, and phone states remain usable.
  - The primary demo path exposes a focus outline and navigates to `/showcase`.
  - The account mode changes state correctly on phone.
  - No serious Axe violations were found on the mobile access path.
- Remotion: TypeScript, bundle, caption export, and discovery of all six compositions passed.
- Founder deck: slide overflow test and OOXML archive integrity passed.

## Findings and corrections

1. The earlier selected identity had a visually broken B. The approved identity uses complete B glyphs and preserves the selected phone Bot.
2. The first browser capture exposed stale CSP hashes for executable inline scripts. The CSP source and Vercel policy were synchronized, then recaptured cleanly.
3. The first phone proof showed a nested native input outline splitting the field focus ring through the leading icon. Focus ownership moved to the complete field shell, preserving a high-contrast halo while removing the visual fracture.
4. The mobile access lockup was enlarged so the phone Bot and complete wordmark read clearly at the conversion point.

No actionable P0, P1, or P2 visual differences remained in the revision 3 surfaces inspected at capture time. This historical result does not certify the current release.

## Product Design rubric

- Typography: complete Inter Tight wordmark, deliberate display hierarchy, and consistent mono labels; no broken glyphs or unintended wrapping in the evidence set.
- Spacing: clear lockup spacing, composed hero/auth balance, mobile touch spacing, and stable document flow across tested breakpoints.
- Color: obsidian, platinum, violet, and lavender render consistently with clear foreground separation.
- Asset fidelity: the real approved phone-Bot artwork is used throughout; no substitute CSS drawing, placeholder, or approximate mark appears.
- Accessibility and interaction: focus, tab state, CTA navigation, reduced motion, serious Axe checks, and responsive overflow all pass.
- Runtime health: captured routes are clean of CSP, console, page, and horizontal-overflow errors.

historical revision 3 snapshot: pass

current release: not certified pending fresh browser capture, visual review, and checksum
