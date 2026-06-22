# Wireline Ametrine Precision Design QA

## Source of truth

- Canonical source: `stitch_wireline_ai_communications_operating_system`
- Supporting specifications:
  - `web_design_spec_ametrine_precision.md`
  - `ios_design_spec_ametrine_precision.md`
  - `android_design_spec_ametrine_precision.md`
  - `deep_dive_migration_manifest.md`
- Product authority: `docs/design/AMETRINE_PRECISION_SOURCE_OF_TRUTH.md`

The retired Professional Heritage / forest / warm-paper direction is not an active implementation target.

## Non-negotiable system contract

- Root canvas: `#F8F9FF`
- Primary text: `#0B1C30`
- Action accent: `#5D3FD3`
- Secondary surface: `#EFF4FF`
- Precision divider: `#C9C4D7`
- Typography: Hanken Grotesk display, Inter body, JetBrains Mono metadata
- Base geometry: 4px
- Larger card geometry: 8px
- Desktop workspace rail: 256px
- Desktop global bar: 64px
- Interactive press state: scale to `0.98`

## Current migration status

### Completed foundations

- Shared web, iOS, Android, widget, and install-surface token systems use the Ametrine palette.
- The active contract check now validates browser and install-surface colors as well as web/native tokens.
- The authenticated web shell has the Ametrine workspace composition: 256px rail, New Agent entry point, global brand bar, workspace controls, and source navigation order.
- Browser, PWA, social, and structured-data metadata use the Ametrine brand language and no longer expose the retired cream/forest identity.

### Remaining visual verification

- Compare the ready Wireline preview at 1280px and 1440px against the canonical desktop reference screens.
- Validate the Studio configuration and Test & Simulation workflow at full desktop width.
- Validate Knowledge Base ingestion/freshness, Connections, Overview, and Business Profile state against source hierarchy.
- Capture native iOS and Android references on actual simulator/device tooling before store submission.

## Release discipline

- Do not merge a visual pass solely because it compiles.
- Review shared-shell work in a ready Wireline preview at desktop width.
- Preserve live API-backed content; do not replace operational UI with inert mock data to gain screenshot parity.
- Run `npm run active-surface:check`, lint, build, and smoke checks before merging.

## Explicit exclusions

- Do not reintroduce forest/cream palette tokens, Signal Blue, mesh backgrounds, generic glass dashboards, or a competing “Professional Heritage” design contract.
- Do not state a compliance certification, quantified time-saving outcome, or customer metric in public copy without substantiation and approval.
