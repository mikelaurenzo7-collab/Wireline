# Verification record

Final launch verification was completed on 2026-08-21.

- TypeScript: `npm run check` passed.
- Composition discovery: `npm run compositions` passed with all six launch cuts registered at 30 fps.
- Captions: `npm run captions:export` passed for the 30s, 15s, and 6s cuts and regenerated matching SRT/WebVTT sidecars.
- Full render: `npm run render:all` completed successfully for every registered composition.
- Motion rule: no CSS `animation`, CSS `transition`, or `@keyframes` declarations exist in `src/`.
- Audio: every final file contains 48 kHz stereo AAC audio; source score and ring remain 48 kHz stereo PCM, and the approved transfer chime is included unchanged before final encoding.

## Final masters

| File | Frame | Video | Audio | Container duration |
| --- | --- | --- | --- | --- |
| `out/botbound-second-ring-30s-4k.mp4` | 3840×2160 | H.264, 30 fps | AAC, 48 kHz stereo | 30.016s |
| `out/botbound-second-ring-15s-4k.mp4` | 3840×2160 | H.264, 30 fps | AAC, 48 kHz stereo | 15.019s |
| `out/botbound-second-ring-6s-4k.mp4` | 3840×2160 | H.264, 30 fps | AAC, 48 kHz stereo | 6.016s |
| `out/botbound-second-ring-15s-vertical-4k.mp4` | 2160×3840 | H.264, 30 fps | AAC, 48 kHz stereo | 15.019s |
| `out/botbound-second-ring-6s-vertical-4k.mp4` | 2160×3840 | H.264, 30 fps | AAC, 48 kHz stereo | 6.016s |
| `out/botbound-second-ring-10s-square-4k.mp4` | 2160×2160 | H.264, 30 fps | AAC, 48 kHz stereo | 10.027s |

## Visual review

- Final encoded frames were extracted from the horizontal, vertical, and square masters and inspected at the second-ring reveal, live-answer state, completed learning loop, and end cards.
- `out/qa-final-contact-sheet.jpg` is the current-run inspection sheet assembled from those encoded masters.
- The review confirmed complete wordmarks, safe-area fit, readable hierarchy, clean crops, and the approved `Your Bot` language across aspect ratios.

The network shim only supplies a loopback interface when Node’s `os.networkInterfaces()` is blocked by a sandbox. It does not affect frames, audio, timing, or production renders on normal workstations.
