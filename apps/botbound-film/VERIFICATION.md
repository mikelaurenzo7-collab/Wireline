# Verification record

This record separates historical render evidence from the current September
2026 release candidate. It does not claim that the current working tree is on
`main`, is an exact-head deployment, or has final launch approval.

## Current First Move outbound candidate evidence

The three outbound social masters below were rebuilt and automated-delivery-QA
verified on 2026-09-02. The QA pass required the exact 6s/10s/15s inventory,
validated H.264/AAC framing and duration, matched every master back to its
render receipt, and published metadata only after 12 frame samples and the
contact sheet were complete. The representative frames and complete contact
sheet were then visually inspected for hierarchy, legibility, sequence, and
vertical safe-zone fit.

| File                                                                                                     | Frame     | Video                          | Audio              | Container duration |     Bytes | SHA-256                                                            |
| -------------------------------------------------------------------------------------------------------- | --------- | ------------------------------ | ------------------ | -----------------: | --------: | ------------------------------------------------------------------ |
| `../../brand-work/launch-2026-09-outbound/exports/motion/botbound-first-move-15s-vertical-1080x1920.mp4` | 1080×1920 | H.264, 30 fps, yuv420p, BT.709 | AAC, 48 kHz stereo |         15.018667s | 3,488,321 | `8d93cbd3a2a328782ecbfbc4394380ae89ec169e59e0fa71c0351ccca3af276d` |
| `../../brand-work/launch-2026-09-outbound/exports/motion/botbound-first-move-10s-square-1080x1080.mp4`   | 1080×1080 | H.264, 30 fps, yuv420p, BT.709 | AAC, 48 kHz stereo |         10.026667s | 2,063,496 | `bba553a90ce560fd857297cbb92d331384925439f9b419dd42853c488acf679b` |
| `../../brand-work/launch-2026-09-outbound/exports/motion/botbound-first-move-6s-vertical-1080x1920.mp4`  | 1080×1920 | H.264, 30 fps, yuv420p, BT.709 | AAC, 48 kHz stereo |             6.016s | 1,826,358 | `6903a51a316b7e33102cf5ae2c728a9f802cadffb9269d81b3119e4c5966ab78` |

Current outbound evidence files:

- `../../brand-work/launch-2026-09-outbound/exports/motion/render-provenance.json`
  binds the renderer, 17 source inputs, pinned runtime files, render flags,
  media-tool versions, Git context, and installed master bytes. Its source
  fingerprint is
  `553d75ce44e14411eb30e6c4742dec3737e8e8af3e84f01ab6f99b3d31360ff2`.
- `../../brand-work/launch-2026-09-outbound/exports/motion/metadata.json`
  records the passing delivery probes, QA script/runtime provenance, 13 QA
  artifact hashes, and the matching render-receipt hash.
- `../../brand-work/launch-2026-09-outbound/exports/motion/SHA256SUMS.txt`
  records exactly the three master checksums above.
- `../../brand-work/launch-2026-09-outbound/exports/motion/qa/botbound-first-move-motion-qa-contact-sheet.png`
  shows Find, Call, Book, and End frames for every cut. Dashed mint guides mark
  the 220 px top, 340 px bottom, 96 px left, and 144 px right vertical safety
  envelope; those guides are not present in the masters.

The render receipt records commit
`6a3c7b31aea2a602a3ff56aaba7583d5a6c1d847` and exact-input dirty state
`true`. The hashes above certify this review candidate's exact bytes; they do
not claim a clean exact-head `main` release. After the intended commit lands,
rerun `qa:outbound-social`: it will require the same source fingerprint and
record the new verification Git context. Re-render only if that fingerprint
changed.

## Current Second Ring inbound candidate evidence

The current repository-local delivery set was generated on 2026-09-01. Only
the three files below are represented in the current motion metadata and
SHA-256 manifest. They are review candidates pending exact-commit release
approval.

| File | Frame | Video | Audio | Container duration | SHA-256 |
| --- | --- | --- | --- | ---: | --- |
| `../../brand-work/launch-2026-09/exports/motion/botbound-second-ring-6s-vertical-1080x1920.mp4` | 1080×1920 | H.264, 30 fps, yuv420p | AAC, 48 kHz stereo | 6.016s | `af42242851252296fe7d8d1187e0bf91b5cc5c6828f4984cecab6898e6ff280b` |
| `../../brand-work/launch-2026-09/exports/motion/botbound-second-ring-10s-square-1080x1080.mp4` | 1080×1080 | H.264, 30 fps, yuv420p | AAC, 48 kHz stereo | 10.027s | `c096464d06b9dcec03428705da8bba149b099c9840b9b4034f720e7b8c6ea390` |
| `../../brand-work/launch-2026-09/exports/motion/botbound-second-ring-15s-vertical-1080x1920.mp4` | 1080×1920 | H.264, 30 fps, yuv420p | AAC, 48 kHz stereo | 15.019s | `4daeab36de88914355998509b1b36f00b943234b7123a71b6ed193c8f5ca6910` |

Current evidence files:

- `../../brand-work/launch-2026-09/exports/motion/metadata.json` records the
  codec, frame, duration, audio, byte-count, and hash values above.
- `../../brand-work/launch-2026-09/exports/motion/SHA256SUMS.txt` records the
  delivery checksums.
- `../../brand-work/launch-2026-09/exports/motion/qa/botbound-second-ring-motion-qa-contact-sheet.png`
  samples the opening, midpoint, and end frame of each current delivery.
- JSON, SRT, and WebVTT sidecars exist for the delivered 6s, 10s, and 15s cuts.
  The source package also contains 30s sidecars for the registered 30s
  composition; there is no current 30s delivery in the table above.

The local `out/` directory contains only its tracked placeholder. Therefore it
does not supply current evidence for any 4K or horizontal render.

## Historical evidence only

On 2026-08-21, an earlier source revision recorded passing TypeScript,
composition-discovery, caption-export, and six-composition render checks. That
run covered 30s, 15s, 6s, 15s vertical, 6s vertical, and 10s square 4K outputs.
Those ignored `out/` files are no longer present, and the film source has since
changed. The August run is historical context only; it cannot approve the
current September source, an exact commit, `main`, or production.

## Approval boundary

Before naming any candidate a final master, run the source checks and renders
from the exact intended commit, inspect encoded frames and audio, regenerate
caption derivatives, and publish a commit-bound checksum record. The network
shim only supplies a loopback interface when Node's `os.networkInterfaces()`
is blocked by a sandbox; it does not affect frames, audio, or timing on normal
workstations.
