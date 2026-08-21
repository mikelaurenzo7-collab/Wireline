# Verification record

- TypeScript: `npm run check` — passed.
- Bundle: `npm run build` — passed.
- Composition discovery: `npm run compositions` — passed.
- Registered durations: 30.00s horizontal, 15.00s horizontal, 6.00s horizontal, 15.00s vertical, 6.00s vertical, and 10.00s square at 30 fps — verified by Remotion.
- Representative stills: opening, second-ring reveal, live call, conversation, outcome, learning loop, horizontal end card, and vertical end card — rendered and visually inspected.
- Motion rule: no CSS `animation`, CSS `transition`, or `@keyframes` declarations in `src/`.
- Audio: original score and ring are 48 kHz stereo PCM; approved transfer chime is included unchanged and is resampled by the final encoder.
- Review proof: `out/botbound-second-ring-6s-review.mp4` rendered at 1920×1080, H.264/AAC, 30 fps, 6.016s container duration.
- Vertical bumper proof: `out/botbound-second-ring-6s-vertical-review.mp4` rendered at 1080×1920, H.264/AAC, 30 fps, 6.016s container duration.
- Square social proof: `out/botbound-second-ring-10s-square-review.mp4` rendered at 1080×1080, H.264/AAC, 30 fps, 10.027s container duration.
- New-format contact sheets: `out/qa-6s-vertical-contact-sheet.jpg` and `out/qa-10s-square-contact-sheet.jpg` — rendered and visually inspected for hierarchy, crop, safe area, and complete wordmark.
- Captions: Remotion `Caption[]` JSON for 30s/15s/6s type-checks cleanly; `npm run captions:export` validates non-overlapping timing and regenerates matching SRT/WebVTT sidecars.

The network shim only supplies a loopback interface when Node’s `os.networkInterfaces()` is blocked by a sandbox. It does not affect frames, audio, timing, or production renders on normal workstations.
