# BotBound Brand and Launch Assets

Start with [CURRENT-ASSET-INDEX.md](CURRENT-ASSET-INDEX.md) for campaign sources, recorded Drive deliveries, and evidence boundaries. The product identity is the white/platinum operator holding a violet receiver, with the complete `BotBound` wordmark.

## First customer kit

Use [the launch copy kit](gtm/BOTBOUND-LAUNCH-COPY-KIT.md#first-design-partner-kit): one founder post, one campaign still, one exact-source product cut, one one-pager, and a short setup/support note. The first pilot is inbound Front Desk plus a configured, permitted follow-up. A missing production-proof cut stays pending.

- Inbound creative: [The Second Ring](launch-2026-09/README.md)
- Outbound creative and its separate hold: [The First Move](launch-2026-09-outbound/README.md)
- Public UI capture instructions: [Current Product Proof](launch-2026-09/CURRENT_PRODUCT_PROOF.md)
- Current operational status: [Founder Launch Command Center](../docs/FOUNDER_LAUNCH_COMMAND_CENTER.md)

## Source and delivery

Identity sources are in `selected/`, `public/brand/` at the repository root, and the release's `exports/brand/`. Use the dimensional operator for hero art; keep both B glyphs complete. Brand rules: [BOTBOUND-BRAND-GUIDE.md](BOTBOUND-BRAND-GUIDE.md).

`commercial/`, `launch-stills/`, and `exports/` preserve earlier campaign sources and revision 3 placements. The August 20 captures in `exports/product-proof/` and [design-qa.md](../design-qa.md) are historical; do not cite them as current product proof.

The Drive links in the current index identify recorded deliveries. Local source fixes and regenerated files do not update or recertify those remote copies automatically.

## Motion

[The film package](../apps/botbound-film/README.md) owns composition recipes and render instructions. Registered compositions are not an inventory of completed exports. The inbound release currently has 6-second vertical, 10-second square, and 15-second vertical campaign cuts under `launch-2026-09/exports/motion/`, with caption sidecars. Review their metadata, picture, audio, and captions together before use.

Local film, logo, and cinematic explorations remain working creative. Illustrative LIVE, BOOKED, waveform, and call-screen elements do not establish real product or customer activity. Do not link to a planned `apps/botbound-film/out/` master until that file exists and has been reviewed.

## Public UI capture

Keep the main app on port 3000. With heavy checks stopped, run each command in its own terminal from the repository root:

```powershell
node scripts/start-botbound-proof-api-stub.mjs
```

```powershell
npx vite --config scripts/vite-product-proof.config.ts --host 127.0.0.1 --port 3002 --strictPort
```

```powershell
npm run brand:proof
```

The capture targets port 3002 and uses the simulated API on port 3001. Finish source edits before capture and leave them unchanged until it completes. Review all seven full-size frames and the contact sheet before using the internal UI evidence.

## Regeneration and integrity

- `npm run assets`: product identity derivatives.
- `npm run brand:launch`: current inbound static campaign candidates.
- `npm run brand:proof`: current credential-free public UI capture and contact sheet; see the capture instructions above for the two local services.
- `node scripts/build-botbound-launch-release-manifest.mjs`: assemble an inbound candidate receipt only after current proof passes.
- `node scripts/build-botbound-promotional-asset-inventory.mjs`: inventory local roles and file signatures; approval and source currency remain unassessed.
- `node scripts/refresh-botbound-source-checksums.mjs --index`: hash the staged source package after explicitly staging reviewed files; this preserves unrelated working-tree creative.
- `node scripts/refresh-botbound-source-checksums.mjs --index --check`: verify those hashes without changing files.

The checksum command preserves its existing path list; it does not add or stage files. Its default mode hashes working-tree bytes, so use `--index` for a reviewed commit that excludes film WIP. Stage the refreshed checksum file only after review.

`DELIVERY-SHA256SUMS-R3.txt` preserves the historical 62-file Drive delivery receipt. `SOURCE-SHA256SUMS.txt` covers the compact repository inputs; neither asserts current deployment or publication approval.
