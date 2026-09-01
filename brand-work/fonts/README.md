# Deterministic render fonts

These font binaries are intentional source inputs for BotBound's deterministic
static-asset and investor-document renderers. They must remain tracked so a
clean clone can reproduce launch artwork without relying on workstation fonts
or a network download.

The files are preserved as licensed upstream assets; do not silently replace,
rename, subset, or regenerate them. If an input changes, update this manifest,
the applicable SIL Open Font License notice, and the launch-asset provenance in
the same change.

## Source manifest

| File | SHA-256 | Role |
| --- | --- | --- |
| `IBMPlexMono-Bold.ttf` | `25ebfbf2d79ab5a9b76d768f297757b76776199d0a36e153fa525acdcd674631` | Labels and operational details |
| `Inter-Bold.ttf` | `b48cb3ac74925f86a6a699b2310eb1936177412e3fa48d00c103f9f71fd214a2` | Bold support copy |
| `Inter-ExtraBold.ttf` | `ec48c869d9db8316d9c64fbb3b6c187c489c41061748af89796f8d0b55fb6d61` | Display support copy |
| `Inter-Regular.ttf` | `feb19efe03a59d77edf106d0d9e459a29237b690bd6b82da8a4e796a8b0a64f5` | Body copy |
| `Inter-SemiBold.ttf` | `770c12639f653dc234dd1a5eecedb114baa8636885e9807da66a7c23a62c46a7` | Emphasized body copy |
| `Inter-Variable.ttf` | `8bd65b153e4e92e3fc7c64d7326c109fc9a4ad9ed3c67088952181c14a61deaa` | Variable-family release input |
| `InterTight-ExtraBold.ttf` | `aa62a1b66de0ab03e671fa88ccfb61e9e3e0b0085136cf173938d0e3f58e70ca` | Campaign headlines |
| `InterTight-Variable.ttf` | `8f720114bdba44e3fe0a6ff01016ce7acda09327498014fa976c347384290761` | Variable-family release input |

The six static faces are read directly by the render scripts under `scripts/`.
The two variable files are retained as the canonical release inputs used for
font delivery and derivative format parity.

## Licenses

All three families are distributed under the SIL Open Font License 1.1. The
copyright and complete license notices tracked with the launch package are:

- `../launch-2026-09/fonts/OFL-Inter.txt`
- `../launch-2026-09/fonts/OFL-Inter-Tight.txt`
- `../launch-2026-09/fonts/OFL-IBM-Plex-Mono.txt`

Keep the applicable notice with every redistributed font copy. The fonts may
be embedded in rendered artwork; they may not be sold by themselves. IBM's
reserved font name `Plex` must not be used for a modified font without the
permission required by its license.
