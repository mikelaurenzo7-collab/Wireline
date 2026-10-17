"""Private, bounded speech synthesis worker. No model dependencies at import time."""

from __future__ import annotations

import base64
import binascii
import copy
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import dataclass, field
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import multiprocessing
import os
from pathlib import Path
import signal
import socket
import tempfile
import threading
from typing import Any
import wave

from assets import CHATTERBOX_SOURCE_REVISION, MODEL_REVISION, PERTH_CHECKPOINT_SHA256, sha256_file, verify_model_assets

MAX_TEXT_CHARACTERS = 1000
MAX_TEXT_BYTES = 4000
MAX_REFERENCE_BYTES = 2_000_000
MAX_REQUEST_BYTES = 2_680_000
MIN_REFERENCE_SECONDS = 6
MAX_REFERENCE_SECONDS = 20
REFERENCE_SAMPLE_RATES = frozenset({16000, 22050, 24000, 44100, 48000})
OUTPUT_SAMPLE_RATE = 24000
MAX_OUTPUT_SECONDS = 60
MAX_OUTPUT_BYTES = OUTPUT_SAMPLE_RATE * MAX_OUTPUT_SECONDS * 2 + 44


class ApiError(Exception):
    def __init__(self, status: int, code: str):
        self.status = status
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class SpeechRequest:
    text: str
    reference_wav: bytes | None = field(default=None, repr=False)


@dataclass(frozen=True)
class Config:
    token: str = field(repr=False)
    model_directory: Path = Path("/models/chatterbox-nano")
    host: str = "127.0.0.1"
    port: int = 8080
    inference_timeout_seconds: int = 60
    startup_timeout_seconds: int = 600
    cpu_threads: int = 4

    @classmethod
    def from_environment(cls) -> "Config":
        token = os.getenv("VOICE_ENGINE_SERVICE_TOKEN", "")
        if not 32 <= len(token.encode("utf-8")) <= 512 or not token.isascii() or any(ord(c) < 33 or ord(c) > 126 for c in token):
            raise ValueError("VOICE_ENGINE_SERVICE_TOKEN must be 32-512 printable ASCII bytes")

        def integer(name: str, default: int, minimum: int, maximum: int) -> int:
            raw = os.getenv(name, str(default))
            if not raw.isascii() or not raw.isdecimal():
                raise ValueError(f"Invalid {name}")
            value = int(raw)
            if not minimum <= value <= maximum:
                raise ValueError(f"Invalid {name}")
            return value

        return cls(
            token=token,
            model_directory=Path(os.getenv("VOICE_ENGINE_MODEL_DIR", "/models/chatterbox-nano")),
            host=os.getenv("VOICE_ENGINE_HOST", "127.0.0.1"),
            port=integer("PORT", 8080, 1, 65535),
            inference_timeout_seconds=integer("VOICE_ENGINE_INFERENCE_TIMEOUT_SECONDS", 60, 15, 180),
            startup_timeout_seconds=integer("VOICE_ENGINE_STARTUP_TIMEOUT_SECONDS", 600, 30, 1800),
            cpu_threads=integer("VOICE_ENGINE_CPU_THREADS", 4, 1, 8),
        )


def encode_wav(pcm: bytes, sample_rate: int = OUTPUT_SAMPLE_RATE) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(pcm)
    return output.getvalue()


def canonical_reference(encoded: Any) -> bytes:
    if not isinstance(encoded, str) or not encoded or len(encoded) > 4 * ((MAX_REFERENCE_BYTES + 2) // 3):
        raise ApiError(400, "invalid_reference_audio")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(400, "invalid_reference_audio") from None
    if len(raw) > MAX_REFERENCE_BYTES:
        raise ApiError(413, "reference_audio_too_large")
    try:
        with wave.open(io.BytesIO(raw), "rb") as audio:
            rate = audio.getframerate()
            frames = audio.getnframes()
            if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or audio.getcomptype() != "NONE" or rate not in REFERENCE_SAMPLE_RATES:
                raise ApiError(400, "unsupported_reference_audio")
            if not MIN_REFERENCE_SECONDS * rate <= frames <= MAX_REFERENCE_SECONDS * rate:
                raise ApiError(400, "reference_duration_out_of_range")
            pcm = audio.readframes(frames + 1)
            if len(pcm) != frames * 2:
                raise ApiError(400, "invalid_reference_audio")
    except (wave.Error, EOFError, OSError, OverflowError):
        raise ApiError(400, "invalid_reference_audio") from None
    # Keep only parsed PCM. Metadata, arbitrary chunks and supplied filenames never reach librosa.
    return encode_wav(pcm, rate)


def parse_speech_request(body: bytes) -> SpeechRequest:
    if len(body) > MAX_REQUEST_BYTES:
        raise ApiError(413, "request_too_large")
    def reject_constant(value: str) -> None:
        raise ValueError("non_json_number")

    def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate_json_key")
            result[key] = value
        return result

    try:
        data = json.loads(body.decode("utf-8"), parse_constant=reject_constant, object_pairs_hook=unique_object)
    except (UnicodeDecodeError, ValueError, RecursionError):
        raise ApiError(400, "invalid_json") from None
    if not isinstance(data, dict) or set(data) - {"text", "referenceAudioBase64"}:
        raise ApiError(400, "invalid_request")
    text = data.get("text")
    if not isinstance(text, str):
        raise ApiError(400, "invalid_text")
    text = text.strip()
    if not text or len(text) > MAX_TEXT_CHARACTERS or any(ord(c) < 32 and c not in "\t\n\r" for c in text):
        raise ApiError(400, "invalid_text")
    try:
        if len(text.encode("utf-8")) > MAX_TEXT_BYTES:
            raise ApiError(400, "invalid_text")
    except UnicodeEncodeError:
        raise ApiError(400, "invalid_text") from None
    reference = canonical_reference(data["referenceAudioBase64"]) if "referenceAudioBase64" in data else None
    return SpeechRequest(text, reference)


class ChatterboxEngine:
    """One model, private conditioning per request; worker process supplies serialization."""

    def __init__(self, model: Any, scratch_directory: str | None = None):
        if model.conds is None:
            raise RuntimeError("default_voice_unavailable")
        self.model = model
        self.default_conditionals = copy.deepcopy(model.conds)
        self.scratch_directory = scratch_directory

    @classmethod
    def load(cls, config: Config, scratch_directory: str) -> "ChatterboxEngine":
        # Runtime is offline even if an upstream helper attempts an implicit fetch.
        os.environ.update({"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "HF_HUB_DISABLE_TELEMETRY": "1", "TOKENIZERS_PARALLELISM": "false"})
        for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS", "NUMBA_NUM_THREADS"):
            os.environ[name] = str(config.cpu_threads)
        verify_model_assets(config.model_directory)
        spec = importlib.util.find_spec("perth")
        if spec is None or spec.origin is None:
            raise RuntimeError("watermarker_unavailable")
        checkpoint = Path(spec.origin).parent / "perth_net" / "pretrained" / "implicit" / "perth_net_250000.pth.tar"
        if not checkpoint.is_file() or sha256_file(checkpoint) != PERTH_CHECKPOINT_SHA256:
            raise RuntimeError("watermarker_unavailable")
        import torch
        import perth
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        torch.set_num_threads(config.cpu_threads)
        torch.set_num_interop_threads(1)
        if perth.PerthImplicitWatermarker is None:
            raise RuntimeError("watermarker_unavailable")
        model = ChatterboxTurboTTS.from_local(config.model_directory, device="cpu", nano=True)
        if not isinstance(model.watermarker, perth.PerthImplicitWatermarker):
            raise RuntimeError("watermarker_unavailable")
        return cls(model, scratch_directory)

    def synthesize(self, request: SpeechRequest) -> bytes:
        reference_path: Path | None = None
        self.model.conds = copy.deepcopy(self.default_conditionals)
        try:
            if request.reference_wav is not None:
                with tempfile.NamedTemporaryFile(dir=self.scratch_directory, prefix="sample-", suffix=".wav", delete=False) as reference:
                    reference_path = Path(reference.name)
                    reference.write(request.reference_wav)
            # Full waveform inference, not a streaming or live-call transport.
            waveform = self.model.generate(request.text, audio_prompt_path=str(reference_path) if reference_path else None)
            return self.waveform_to_wav(waveform)
        finally:
            try:
                self.model.conds = copy.deepcopy(self.default_conditionals)
            finally:
                if reference_path is not None:
                    reference_path.unlink(missing_ok=True)

    def waveform_to_wav(self, waveform: Any) -> bytes:
        import torch

        if self.model.sr != OUTPUT_SAMPLE_RATE:
            raise ApiError(503, "unexpected_model_output")
        samples = waveform.detach().cpu().float().reshape(-1)
        if samples.numel() == 0 or samples.numel() > OUTPUT_SAMPLE_RATE * MAX_OUTPUT_SECONDS or not bool(torch.isfinite(samples).all()):
            raise ApiError(422, "invalid_model_output")
        pcm = samples.clamp(-1, 1).mul(32767).round().short().numpy().astype("<i2").tobytes()
        return encode_wav(pcm)


def model_process(connection: Any, config: Config, scratch_directory: str) -> None:
    # Native/Python libraries cannot log request text, sample paths, or raw failures.
    with open(os.devnull, "w", encoding="utf-8") as sink, redirect_stdout(sink), redirect_stderr(sink):
        try:
            engine = ChatterboxEngine.load(config, scratch_directory)
            connection.send(("ready",))
        except Exception:
            connection.send(("failed",))
            connection.close()
            return
        try:
            while True:
                message = connection.recv()
                if message is None:
                    return
                try:
                    output = engine.synthesize(message)
                    if len(output) > MAX_OUTPUT_BYTES:
                        raise ApiError(422, "invalid_model_output")
                    connection.send(("audio", output))
                except ApiError as error:
                    connection.send(("error", error.status, error.code))
                except Exception:
                    # Unknown native/model state is not reused for another speaker.
                    connection.send(("failed",))
                    return
                finally:
                    # Do not retain the last user's reference/request while waiting for another job.
                    del message
                    if "output" in locals():
                        del output
        except (EOFError, BrokenPipeError, OSError):
            return
        finally:
            connection.close()


class ModelSupervisor:
    """Hard inference deadline kills the process; a timed-out job never keeps running."""

    def __init__(self, config: Config):
        self.config = config
        self._single_flight = threading.Lock()
        self._state_lock = threading.Lock()
        self._stop_lock = threading.Lock()
        self._state = "loading"
        # Parent owns cleanup so forcibly terminating a hung model cannot strand a reference clip.
        self._scratch = tempfile.TemporaryDirectory(prefix="botbound-voice-")
        context = multiprocessing.get_context("spawn")
        self._connection, child_connection = context.Pipe()
        self._process = context.Process(target=model_process, args=(child_connection, config, self._scratch.name), daemon=True)
        self._process.start()
        child_connection.close()
        threading.Thread(target=self._await_startup, daemon=True).start()

    def _set_state(self, state: str) -> None:
        with self._state_lock:
            self._state = state

    def _await_startup(self) -> None:
        try:
            if self._connection.poll(self.config.startup_timeout_seconds):
                message = self._connection.recv()
                if message == ("ready",) and self._process.is_alive():
                    self._set_state("ready")
                    return
        except (EOFError, OSError):
            pass
        self._quarantine("failed")

    def readiness(self) -> dict[str, Any]:
        with self._state_lock:
            state = self._state
        if state == "ready" and not self._process.is_alive():
            self._set_state("failed")
            state = "failed"
        return {
            "ready": state == "ready",
            "state": state,
            "engine": "chatterbox-nano",
            "modelRevision": MODEL_REVISION,
            "sourceRevision": CHATTERBOX_SOURCE_REVISION,
            "device": "cpu",
            "watermarkReady": state == "ready",
            "maxTextCharacters": MAX_TEXT_CHARACTERS,
            "maxReferenceBytes": MAX_REFERENCE_BYTES,
            "maxOutputSeconds": MAX_OUTPUT_SECONDS,
            "inferenceTimeoutSeconds": self.config.inference_timeout_seconds,
            "busy": self._single_flight.locked(),
        }

    def _quarantine(self, state: str = "quarantined") -> None:
        self._set_state(state)
        with self._stop_lock:
            if self._process.is_alive():
                self._process.terminate()
                self._process.join(timeout=3)
            if self._process.is_alive():
                self._process.kill()
                self._process.join(timeout=3)
            if not self._process.is_alive():
                self._scratch.cleanup()

    def synthesize(self, request: SpeechRequest) -> bytes:
        if not self._single_flight.acquire(blocking=False):
            raise ApiError(429, "voice_engine_busy")
        try:
            if not self.readiness()["ready"]:
                raise ApiError(503, "voice_engine_not_ready")
            try:
                self._connection.send(request)
                if not self._connection.poll(self.config.inference_timeout_seconds):
                    self._quarantine()
                    raise ApiError(504, "voice_engine_timeout")
                message = self._connection.recv()
            except (EOFError, BrokenPipeError, OSError):
                self._quarantine()
                raise ApiError(503, "voice_engine_unavailable") from None
            if isinstance(message, tuple) and len(message) == 2 and message[0] == "audio" and isinstance(message[1], bytes) and len(message[1]) <= MAX_OUTPUT_BYTES:
                return message[1]
            if isinstance(message, tuple) and len(message) == 3 and message[0] == "error" and message[1] == 422 and message[2] == "invalid_model_output":
                raise ApiError(422, "invalid_model_output")
            self._quarantine()
            raise ApiError(503, "voice_engine_unavailable")
        finally:
            self._single_flight.release()

    def close(self) -> None:
        self._quarantine("stopped")
        self._connection.close()


class VoiceHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 8

    def __init__(self, address: tuple[str, int], config: Config, engine: Any):
        self.config = config
        self.engine = engine
        self._connections = threading.BoundedSemaphore(16)
        super().__init__(address, VoiceRequestHandler)

    def get_request(self) -> tuple[socket.socket, Any]:
        client, address = super().get_request()
        client.settimeout(10)
        return client, address

    def process_request(self, request: socket.socket, client_address: Any) -> None:
        if not self._connections.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._connections.release()
            raise

    def process_request_thread(self, request: socket.socket, client_address: Any) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._connections.release()

    def handle_error(self, request: Any, client_address: Any) -> None:
        # Do not print stack traces containing headers/body/text/sample paths.
        pass


class VoiceRequestHandler(BaseHTTPRequestHandler):
    server: VoiceHTTPServer
    server_version = "BotBoundVoice"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:
        pass

    def _reply(self, status: int, body: bytes, content_type: str) -> None:
        self.close_connection = True
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if content_type == "audio/wav":
            self.send_header("X-Voice-Engine", "chatterbox-nano")
            self.send_header("X-Voice-Model-Revision", MODEL_REVISION)
            self.send_header("X-Voice-Source-Revision", CHATTERBOX_SOURCE_REVISION)
        self.send_header("Connection", "close")
        if status == 429:
            self.send_header("Retry-After", "2")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, body: Any) -> None:
        self._reply(status, json.dumps(body, separators=(",", ":")).encode("utf-8"), "application/json")

    def _authenticate(self) -> None:
        supplied = self.headers.get_all("Authorization", [])
        expected = "Bearer " + self.server.config.token
        if len(supplied) != 1 or not hmac.compare_digest(supplied[0].encode("utf-8"), expected.encode("utf-8")):
            raise ApiError(401, "unauthorized")

    def _discard_small_body(self) -> None:
        # Draining a tiny already-sent body avoids a TCP reset hiding a 401 on Windows.
        # Never parse it, accept an unbounded upload, or let an unauthenticated sender stall.
        if getattr(self, "_body_consumed", False) or self.headers.get("Transfer-Encoding") is not None:
            return
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or len(lengths[0]) > 5 or not lengths[0].isascii() or not lengths[0].isdecimal():
            return
        length = int(lengths[0])
        if length > 8192:
            return
        previous_timeout = self.connection.gettimeout()
        try:
            self.connection.settimeout(0.1)
            self.rfile.read(length)
        except (OSError, TimeoutError):
            pass
        finally:
            self.connection.settimeout(previous_timeout)
            self._body_consumed = True

    def do_GET(self) -> None:
        try:
            if self.path == "/healthz":
                self._json(200, {"status": "ok"})
            elif self.path == "/readyz":
                self._authenticate()
                readiness = self.server.engine.readiness()
                self._json(200 if readiness["ready"] else 503, readiness)
            else:
                raise ApiError(404, "not_found")
        except ApiError as error:
            self._json(error.status, {"error": {"code": error.code}})

    def do_POST(self) -> None:
        try:
            self._authenticate()
            if self.path != "/v1/speech":
                raise ApiError(404, "not_found")
            if self.headers.get("Transfer-Encoding") is not None:
                raise ApiError(400, "unsupported_transfer_encoding")
            lengths = self.headers.get_all("Content-Length", [])
            if len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdecimal():
                raise ApiError(411, "content_length_required")
            if len(lengths[0]) > 10:
                raise ApiError(413, "request_too_large")
            length = int(lengths[0])
            if length > MAX_REQUEST_BYTES:
                raise ApiError(413, "request_too_large")
            body = self.rfile.read(length)
            self._body_consumed = True
            if len(body) != length:
                raise ApiError(400, "incomplete_request")
            if self.headers.get_content_type() != "application/json":
                raise ApiError(415, "application_json_required")
            request = parse_speech_request(body)
            audio = self.server.engine.synthesize(request)
            self._reply(200, audio, "audio/wav")
        except (TimeoutError, socket.timeout):
            self._json(408, {"error": {"code": "request_timeout"}})
        except ApiError as error:
            self._discard_small_body()
            self._json(error.status, {"error": {"code": error.code}})


def main() -> None:
    config = Config.from_environment()
    engine = ModelSupervisor(config)
    server = VoiceHTTPServer((config.host, config.port), config, engine)

    def stop(signum: int, frame: Any) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        server.serve_forever(poll_interval=0.25)
    finally:
        server.server_close()
        engine.close()


if __name__ == "__main__":
    main()
