# BotBound private speech engine

An isolated English speech/voice-reference preview service using the open-source **Resemble AI Chatterbox Nano** model. OpenAI continues to supply BotBound's business reasoning and existing live-voice runtime. This service requires neither an ElevenLabs API key nor an ElevenLabs subscription.

This is a **prototype for private previews**. It produces a complete watermarked WAV, not streamed speech. It does not implement recognition, turn detection, phone transport, interruption, user enrollment, speaker verification, consent storage, tenant authorization, or billing. Those belong to BotBound's authenticated application and any subsequent call-runtime integration. Do not route the live Front Desk number to this process or advertise equivalent ElevenLabs capabilities from the presence of this code.

## Fixed model and dependency boundary

- Chatterbox source `5de7a54aa4e5e2baadb0182dde554908b48b85c2`.
- Nano snapshot `71ccd1d0081b430592cea481f4307e764e07bc64`.
- Perth source `ff1c8ac55a976971245cdd53c18d6131ca00d993`.
- Every required model file is size/hash checked before load, including trusted `conds.pt`; the Perth checkpoint is separately hash checked. The unused 1.06 GB `s3gen.safetensors` file is excluded.
- Runtime dependencies are version/hash locked for CPython 3.11. Pinned upstream source archives install with `--no-deps` so upstream demo dependencies and a moving Perth branch cannot override that lock.
- `pyproject.toml` restricts universal resolution to Python 3.11. ONNX 1.19 uses a float4 dtype without declaring an upstream minimum; `ml-dtypes==0.5.4` is pinned to supply it. Do not broaden Python support by silently downgrading that dependency.
- The container base manifest is pinned. Model files are **not** fetched during image build, process startup, or synthesis.
- See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This is self-hosting a licensed model, not training an equivalent foundation model from scratch.

## Local installation and explicit model preparation

Use a dedicated **CPython 3.11** environment. Do not use the application's Node environment or production provider credentials. The initial package download is substantial; model assets add approximately **1.94 GB disk space**, separate from RAM/runtime requirements. CPU latency and quality must be measured on the intended host before choosing deployment hardware.

```powershell
uv venv --python 3.11 tmp/voice-engine-venv
$voicePython = (Resolve-Path 'tmp/voice-engine-venv/Scripts/python.exe').Path
uv pip install --python $voicePython --require-hashes -r services/voice-engine/requirements.build.lock
uv pip install --python $voicePython --no-build-isolation --torch-backend cpu --require-hashes -r services/voice-engine/requirements.lock
uv pip install --python $voicePython --no-deps --no-build-isolation --require-hashes -r services/voice-engine/requirements.sources.lock
& $voicePython services/voice-engine/prefetch.py --model-dir tmp/voice-engine-models
& $voicePython services/voice-engine/prefetch.py --model-dir tmp/voice-engine-models --verify-only
```

`prefetch.py` is an explicit operator action against the fixed public Hugging Face snapshot. It streams to randomized temporary files, verifies size/SHA-256, and atomically replaces each destination. It never accepts a user-selected download URL. `--verify-only` performs no network access. A partial download is not a ready model.

Set a new random local service credential of at least 32 bytes in the process environment, without committing or echoing it. Production credentials, if this service is approved later, belong only in the host's secret store. The Node app must use a private server-to-server URL and credential; neither is a browser secret.

```powershell
$env:VOICE_ENGINE_SERVICE_TOKEN = '<new private service credential>'
$env:VOICE_ENGINE_MODEL_DIR = (Resolve-Path 'tmp/voice-engine-models').Path
$env:VOICE_ENGINE_CPU_THREADS = '4'
& $voicePython services/voice-engine/server.py
```

No production deployment or infrastructure purchase is implied by these commands. The default listener is `127.0.0.1:8080`; the container listens on `0.0.0.0:8080` behind an authenticated private network/TLS proxy. Do not publish the worker as a customer API. Keep the process/credential isolated from unrelated tenants and configure host CPU/RAM limits.

## HTTP interface

`GET /healthz` is a public, non-probing liveness check: `{"status":"ok"}`. It says nothing about model readiness or synthesis quality.

`GET /readyz` requires `Authorization: Bearer <VOICE_ENGINE_SERVICE_TOKEN>`. Returns 200 only after the pinned model and real watermarker load; otherwise 503. The bounded JSON includes:

```json
{
  "ready": true,
  "state": "ready",
  "engine": "chatterbox-nano",
  "modelRevision": "71ccd1d0081b430592cea481f4307e764e07bc64",
  "sourceRevision": "5de7a54aa4e5e2baadb0182dde554908b48b85c2",
  "device": "cpu",
  "watermarkReady": true,
  "maxTextCharacters": 1000,
  "maxReferenceBytes": 2000000,
  "maxOutputSeconds": 60,
  "inferenceTimeoutSeconds": 60,
  "busy": false
}
```

`POST /v1/speech` requires the same bearer credential and `Content-Type: application/json` with a bounded `Content-Length`. Chunked transfer encoding is rejected. Only these keys are accepted:

```json
{"text":"Welcome to BotBound.","referenceAudioBase64":"<optional PCM WAV bytes as plain base64>"}
```

- Text: nonempty, at most 1,000 Unicode characters and 4,000 UTF-8 bytes. No model options, paths, remote URLs, or voice IDs are accepted.
- Reference: optional **mono, 16-bit uncompressed PCM WAV**, **6–20 seconds**, sample rate 16,000 / 22,050 / 24,000 / 44,100 / 48,000 Hz; at most **2,000,000 decoded bytes**. The source model requires more than 5 seconds. The wrapper strips metadata by re-encoding the parsed PCM. A reference clip must have an active, authenticated speaker-authorization record in the Node layer before it is forwarded.
- Success: 200 `audio/wav`, mono PCM16 at 24 kHz, at most 60 seconds / 2,880,044 bytes. Headers include `Cache-Control: no-store`, `X-Voice-Engine: chatterbox-nano`, and pinned model/source revision headers. The browser must not cache sample/output audio as public content.
- Failure: JSON `{"error":{"code":"…"}}`; 400/411/413/415/422 for invalid input/output, 401 unauthorized, 429 busy (`Retry-After: 2`), 503 unavailable, 504 inference deadline. Raw model failures, supplied text, sample data, and paths are not returned or logged.
- Only **one inference** is admitted; requests do not form an unbounded queue. The full conditioning/generate/reset cycle is serialized. Before and after every request, model conditioning is replaced with a deep copy of the original built-in voice. Random sample files are deleted on completion/failure.
- Default inference deadline: **60 seconds** (`VOICE_ENGINE_INFERENCE_TIMEOUT_SECONDS`, allowed 15–180). A deadline kills the model subprocess and quarantines it until process restart. Parent-owned private scratch storage is removed after termination, including a clip stranded by native code. A client timeout/abort alone is not a claim that compute stopped; the worker deadline remains authoritative. The Node fetch deadline must exceed the worker deadline by at least five seconds.
- Model startup deadline: 600 seconds (`VOICE_ENGINE_STARTUP_TIMEOUT_SECONDS`, allowed 30–1,800). CPU threads default four, allowed one through eight. Watermark failures fail closed; no dummy watermark fallback exists.

## Container

Build from this directory, not from the repository root; no secrets or model files enter the image context:

```sh
docker build -t botbound-voice-engine services/voice-engine
docker run --rm --env-file /private/voice-engine.env \
  --mount type=bind,src=/private/chatterbox-nano,dst=/models/chatterbox-nano,readonly \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --memory=8g --cpus=4 -p 127.0.0.1:8080:8080 botbound-voice-engine
```

The 8 GB example is a resource ceiling, not a certified minimum or sizing recommendation. Benchmark first. An absent/invalid snapshot keeps authenticated readiness false. Container health alone is not release readiness.

## Validation without model packages

```powershell
python -m unittest discover -s services/voice-engine -p 'test_*.py' -v
```

These tests cover bounded WAV/text parsing, rejected URLs/paths/options, authentication, provenance headers, reference cleanup, conditioning isolation, busy rejection, hard-timeout termination/quarantine, and safe errors. They use fake models; passing them does not establish audible clone quality, production latency, or phone-call readiness. The separate real CPU benchmark must record exact source/model revisions, time to full WAV, generated duration, real-time factor, peak RAM, and a listening/consented-reference evaluation.

The explicit builtin-voice benchmark does not read a person's reference sample or use provider credentials:

```powershell
& $voicePython services/voice-engine/benchmark.py --model-dir tmp/voice-engine-models --output-dir output/audio/inhouse-voice-baseline --threads 4
```

It writes two watermarked WAVs and exact-source timing/peak process-memory evidence. This is complete-waveform latency, not time to first streamed audio. Sampling is stochastic, and a builtin-voice benchmark alone does not establish clone fidelity.

`--synthetic-reference` conditions the second sample on a six-second loop of the first model-generated builtin sample. This exercises the reference path without a person's recording; it does not establish human speaker similarity or consent/verification readiness.

On October 17, 2026, the initial local Windows/Python 3.11.14 CPU baseline (four inference threads, eight physical cores, 16 GB host RAM, no CUDA) measured:

| Measure | Result |
| --- | --- |
| Model verification/loading | 43.15 seconds |
| 62-character sample | 45.85 seconds to produce 3.2 seconds of complete WAV (14.33× audio duration) |
| 97-character sample | 29.97 seconds to produce 5.6 seconds of complete WAV (5.35× audio duration) |
| Observed process peak working set during the run | At least 3,113 MiB / 3.04 GiB; initial script's final peak measurement was unavailable |

The initial baseline is evidence that this CPU configuration is **unsuitable for live conversational turns**. It is not a minimum host specification. The complete audio was generated with the builtin voice; listening quality and a verified human clone were not assessed. A corrected memory implementation and explicit HTTP smoke are provided for repeatable evidence:

```powershell
& $voicePython services/voice-engine/smoke.py --model-dir tmp/voice-engine-models --output-dir output/audio/inhouse-voice-http --builtin-reference output/audio/inhouse-voice-baseline/sample-1.wav
```

The optional `--builtin-reference` must point only to a previously generated model-builtin WAV. The smoke loops that synthetic audio, creates a new token only in local memory, verifies authenticated readiness and pinned response headers, sends exactly one synthesis request, and writes sanitized JSON/audio evidence. It shuts down the model process afterward. It is not an instruction to upload a person's recording without authorization.

The subsequent authenticated local smoke on the same CPU **returned 200**: readiness after **44.20 seconds**, then **28.13 seconds** to synthesize a 28-character sentence into **2.04 seconds** of WAV using a six-second loop of model-generated audio as the reference. It verified the real conditioning path, model/source headers, `no-store`, and the 60-second worker deadline. Correct Win64 process measurement recorded the model subprocess's peak working set as **4,407,480,320 bytes / 4.10 GiB**. This supports private preview prototyping; it reinforces that this CPU setup cannot provide acceptable live turn latency. No human recording, paid provider, production credential, or external call was used.

Regenerate locks only after reviewing upstream changes. From `services/voice-engine`, run `uv pip compile pyproject.toml --python-version 3.11 --universal --torch-backend cpu --generate-hashes --output-file requirements.lock` so the service's Python environment restriction is read. Use `--no-deps --generate-hashes` for source archives. Preserve hashes rather than hand-editing resolved dependencies.
