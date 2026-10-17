# Speech model credits and licenses

BotBound's service wrapper is first-party application code. It uses the following independently developed open-source model and watermark implementation; BotBound does not claim to have trained them.

## Chatterbox / Nano by Resemble AI

- Source: https://github.com/resemble-ai/chatterbox/tree/5de7a54aa4e5e2baadb0182dde554908b48b85c2
- Nano model: https://huggingface.co/ResembleAI/chatterbox-nano/tree/71ccd1d0081b430592cea481f4307e764e07bc64
- Source and model repository declare MIT. Preserve upstream per-file notices, including Apache-2.0 notices on incorporated CosyVoice-derived components, when redistributing source or images.
- The service keeps the upstream Perth watermark. It never substitutes `DummyWatermarker`.

## Perth by Resemble AI

- Source and packaged checkpoint: https://github.com/resemble-ai/Perth/tree/ff1c8ac55a976971245cdd53c18d6131ca00d993
- License: MIT.

The following MIT license is reproduced for both projects:

```text
MIT License

Copyright (c) 2025 Resemble AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Transitive libraries have their own notices in the installed distributions. The locked dependencies and upstream source archives remain part of the distribution; do not remove their licenses.
