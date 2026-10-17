"""One real local HTTP synthesis, with a private in-memory token and sanitized evidence."""

from __future__ import annotations

import argparse
import base64
import io
import json
from pathlib import Path
import secrets
import threading
import time
import urllib.error
import urllib.request
import wave

from assets import CHATTERBOX_SOURCE_REVISION, MODEL_REVISION
from benchmark import peak_memory_bytes, synthetic_reference_from_builtin
from server import Config, MAX_OUTPUT_BYTES, ModelSupervisor, VoiceHTTPServer


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--builtin-reference", type=Path, help="Optional previously generated model-builtin WAV, never a human recording")
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    config = Config(token=secrets.token_urlsafe(48), model_directory=args.model_dir)
    engine = ModelSupervisor(config)
    server = VoiceHTTPServer(("127.0.0.1", 0), config, engine)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"
    authorization = {"Authorization": "Bearer " + config.token}
    evidence = {
        "sourceRevision": CHATTERBOX_SOURCE_REVISION,
        "modelRevision": MODEL_REVISION,
        "device": "cpu",
        "threads": config.cpu_threads,
        "reference": "synthetic_builtin_loop" if args.builtin_reference else "none",
        "inferenceTimeoutSeconds": config.inference_timeout_seconds,
    }
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(base_url + "/healthz", timeout=5) as response:
            assert response.status == 200 and json.load(response) == {"status": "ok"}
        while time.perf_counter() - started < config.startup_timeout_seconds + 5:
            request = urllib.request.Request(base_url + "/readyz", headers=authorization)
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    readiness = json.load(response)
                    if readiness["ready"]:
                        assert readiness["inferenceTimeoutSeconds"] == 60
                        assert readiness["sourceRevision"] == CHATTERBOX_SOURCE_REVISION
                        assert readiness["modelRevision"] == MODEL_REVISION
                        evidence["readiness"] = readiness
                        break
            except urllib.error.HTTPError as error:
                if error.code != 503:
                    raise
                failure = json.load(error)
                if failure.get("state") in {"failed", "quarantined", "stopped"}:
                    raise RuntimeError("model_not_ready") from None
            time.sleep(1)
        else:
            raise RuntimeError("model_startup_timeout")
        evidence["readyAfterSeconds"] = time.perf_counter() - started
        payload = {"text": "Hello. How can I help today?"}
        evidence["characters"] = len(payload["text"])
        if args.builtin_reference:
            generated_audio = args.builtin_reference.read_bytes()
            reference = synthetic_reference_from_builtin(generated_audio)
            payload["referenceAudioBase64"] = base64.b64encode(reference).decode("ascii")
        request = urllib.request.Request(
            base_url + "/v1/speech",
            data=json.dumps(payload).encode("utf-8"),
            headers={**authorization, "Content-Type": "application/json"},
            method="POST",
        )
        started = time.perf_counter()
        with urllib.request.urlopen(request, timeout=65) as response:
            audio = response.read(MAX_OUTPUT_BYTES + 1)
            assert len(audio) <= MAX_OUTPUT_BYTES
            assert response.headers["Content-Type"] == "audio/wav"
            assert response.headers["Cache-Control"] == "no-store"
            assert response.headers["X-Voice-Engine"] == "chatterbox-nano"
            assert response.headers["X-Voice-Model-Revision"] == MODEL_REVISION
            assert response.headers["X-Voice-Source-Revision"] == CHATTERBOX_SOURCE_REVISION
            evidence["status"] = response.status
            evidence["elapsedSeconds"] = time.perf_counter() - started
            evidence["bytes"] = len(audio)
        with wave.open(io.BytesIO(audio), "rb") as parsed:
            assert (parsed.getnchannels(), parsed.getsampwidth(), parsed.getframerate()) == (1, 2, 24000)
            evidence["audioSeconds"] = parsed.getnframes() / parsed.getframerate()
        evidence["realTimeFactor"] = evidence["elapsedSeconds"] / evidence["audioSeconds"]
        evidence["modelPeakWorkingSetBytes"] = peak_memory_bytes(engine._process.pid)
        (args.output_dir / "http-sample.wav").write_bytes(audio)
        (args.output_dir / "http-smoke.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        print(json.dumps(evidence))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        engine.close()


if __name__ == "__main__":
    main()
