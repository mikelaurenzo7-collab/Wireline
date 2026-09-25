# Asset manifest

SHA-256 values below identify the exact local inputs used by every composition.

| File | SHA-256 |
| --- | --- |
| `public/brand/botbound-operator-primary.png` | `fa704d8d6f05a985e4cef3950160de147bee4785c1ba44c359dc8ce2cdf0abe3` |
| `public/brand/botbound-app-icon.png` | `35ccce8c4509faa70348b5de3be581dc594a66e258fdf6425f7c0461ec806ad1` |
| `public/brand/hands-full-opening-original.png` | `17b4c007b3ee8f624cdc673c65f895a1eee77bea752255207c68b319bbdc7aaf` |
| `public/audio/transfer-chime-approved.wav` | `2b976ec7225dfd259b5fadf3907b13afddf2c3a58afc090921601f9952589282` |
| `public/audio/botbound-score.mp3` | `554d0877dffbe7b6dbbb008c40ff9f66fa35061c07c7c1c17242622f1e8cd290` |
| `public/audio/phone-ring.wav` | `3a6c2b8771bc56f0e4533420a6e3ea740ffae6a1eee56d6875ad130519917802` |
| `public/fonts/Inter-Variable.woff2` | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` |
| `public/fonts/InterTight-Variable.woff2` | `77fefe8ca19b9f69b5284832c519e0493127c1f091f0a8936884be7721c4e618` |
| `public/fonts/IBMPlexMono-Bold.woff2` | `4f84d86cfd060f4ded334358ff8a4c81d4db2ed5addd568359d693f44a87765a` |

## Accessibility sidecars

The caption sources and sidecars include the September 25, 2026 domain cutover to **botbound.app**. These hashes identify current caption inputs, not an approved delivery render. Publication remains on hold until the revised film is rendered and reviewed as described in `PRODUCTION_NOTES.md`.

| File | SHA-256 |
| --- | --- |
| `public/captions/botbound-second-ring-30s.json` | `72278d634c17c194313e932457ec08ad366c87834f6244bbb810fa86adf90196` |
| `public/captions/botbound-second-ring-30s.srt` | `a3a9a4a270a4f5dc6cf451882ca5d67cc8a6782952a31e2fb9258ad2b93702ce` |
| `public/captions/botbound-second-ring-30s.vtt` | `c5b3a2bf68dccc4cdde50c03a56e128a56c62618d29cf19087f372f8a6ff9d57` |
| `public/captions/botbound-second-ring-15s.json` | `453712a19cd0b89dc14972ccc91c4052e23f91dcaf91b94ebc67f9be29bafcbc` |
| `public/captions/botbound-second-ring-15s.srt` | `f7905a96609a71094fcc25a79d7af46b99d10ea34b3bb37ea71ec7cc6fe4ad3d` |
| `public/captions/botbound-second-ring-15s.vtt` | `ad094a4615ca375a51536c10e83689636945ecc6332f4e8fea95cf9dba1bce89` |
| `public/captions/botbound-second-ring-10s.json` | `7058f54a2a476d074e412ef089d512346092f30512dedccee356fb4a5a17051f` |
| `public/captions/botbound-second-ring-10s.srt` | `3e0387dcf08ca737aaf26404cd4bcc398f2028265a7c2da2b9df58bf414e2bd8` |
| `public/captions/botbound-second-ring-10s.vtt` | `7b85b1a97dc276ed08346183a045bebc138b4612d8a49664a5da707b0068f044` |
| `public/captions/botbound-second-ring-6s.json` | `305bd12f6ffeada1c598bf5f5933a3270cd0329bea4277885f12a5fbe217e4e5` |
| `public/captions/botbound-second-ring-6s.srt` | `82dcb4353949a1eab16176fa1f5789862a4ef092ac2c9c9ea08726e450cee354` |
| `public/captions/botbound-second-ring-6s.vtt` | `c9d505897d1ba12ca5c31137538e0dd4d97222e07449aa45249f3bdf4e8f5c1b` |

The robot and app icon are approved BotBound launch assets prepared from the certified full-resolution sources. The opening image is original OpenAI-generated campaign illustration and remains subject to the generated-art, likeness, and commercial-use gate before paid distribution. The transfer chime is copied unchanged from the approved product sound. The score and ring are original deterministic outputs of `scripts/generate-audio.mjs`; the composition uses the repository-safe MP3 derivative of the PCM score.

Before paid broadcast delivery, confirm the final media-rights record for the approved image-generation sources and attach the delivery-render SHA-256 values to this manifest.
