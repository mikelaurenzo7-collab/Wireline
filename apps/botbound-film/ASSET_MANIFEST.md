# Asset manifest

SHA-256 values below identify the exact local inputs used by every composition.

| File | SHA-256 |
| --- | --- |
| `public/brand/botbound-operator-primary.png` | `fa704d8d6f05a985e4cef3950160de147bee4785c1ba44c359dc8ce2cdf0abe3` |
| `public/brand/botbound-app-icon.png` | `35ccce8c4509faa70348b5de3be581dc594a66e258fdf6425f7c0461ec806ad1` |
| `public/brand/hands-full-opening.jpg` | `79cda83a86e6b0fb7daac1fc0b7c946cbfa631c5d76e4f7671c1c43448078ab4` |
| `public/audio/transfer-chime-approved.wav` | `2b976ec7225dfd259b5fadf3907b13afddf2c3a58afc090921601f9952589282` |
| `public/audio/botbound-score.mp3` | `554d0877dffbe7b6dbbb008c40ff9f66fa35061c07c7c1c17242622f1e8cd290` |
| `public/audio/phone-ring.wav` | `3a6c2b8771bc56f0e4533420a6e3ea740ffae6a1eee56d6875ad130519917802` |
| `public/fonts/Inter-Variable.woff2` | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` |
| `public/fonts/InterTight-Variable.woff2` | `77fefe8ca19b9f69b5284832c519e0493127c1f091f0a8936884be7721c4e618` |
| `public/fonts/IBMPlexMono-Bold.woff2` | `4f84d86cfd060f4ded334358ff8a4c81d4db2ed5addd568359d693f44a87765a` |

## Accessibility sidecars

| File | SHA-256 |
| --- | --- |
| `public/captions/botbound-second-ring-30s.json` | `733809ee5fe99c7ea4ec030d204dabbbffa10bd0538d8f3b2ed3bf4c03363d0e` |
| `public/captions/botbound-second-ring-30s.srt` | `b0f4e21342f31bd2d05d4b044b97b42ecc96d9abe7825cb62c498ea7e2da2ee9` |
| `public/captions/botbound-second-ring-30s.vtt` | `eb88b6ed0da442c2e37e9afa79d6068ac1e8cd7296bd43287dd04a33f4c36bde` |
| `public/captions/botbound-second-ring-15s.json` | `c4e1a46a051297d5bfb9e9e64317dc9705c5e71fd16b659e00b7f35b48e17a45` |
| `public/captions/botbound-second-ring-15s.srt` | `bcbd0c2a6379245ede5c71ca3cf32c123edc7bfd42bf0e59de675ae08910f712` |
| `public/captions/botbound-second-ring-15s.vtt` | `d6150a1eed79645dd27f3229c407b2774b9cd505fa4492e26b17978d40a95340` |
| `public/captions/botbound-second-ring-6s.json` | `718569008a7c8aed8cc0363a099d7c68dbd5c903272923c2fa33d6895dbbb72a` |
| `public/captions/botbound-second-ring-6s.srt` | `95b6899e7ae10828390d69ae744e0ecad333c918ebb3489c2e3aef2ca2e063a1` |
| `public/captions/botbound-second-ring-6s.vtt` | `12ced39ea9363e2277bd56281d210167c33d11a4a79c91d5cb36fac2e6c70667` |

The robot, app icon, and opening image are approved BotBound launch assets prepared from the certified full-resolution sources. The transfer chime is copied unchanged from the approved product sound. The score and ring are original deterministic outputs of `scripts/generate-audio.mjs`; the composition uses the repository-safe MP3 derivative of the PCM score.

Before paid broadcast delivery, confirm the final media-rights record for the approved image-generation sources and attach the delivery-render SHA-256 values to this manifest.
