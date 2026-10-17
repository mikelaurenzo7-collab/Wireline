"""No model downloads, paid calls, torch, or microphone access are used by these tests."""

import base64
from dataclasses import replace
import http.client
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import MagicMock, patch
import wave

from benchmark import peak_memory_bytes, synthetic_reference_from_builtin
from assets import CHATTERBOX_SOURCE_REVISION, MODEL_ASSETS, MODEL_REVISION, verify_model_assets
from server import (
    ApiError, ChatterboxEngine, Config, MAX_OUTPUT_BYTES, MAX_REFERENCE_BYTES,
    MAX_REQUEST_BYTES, ModelSupervisor, OUTPUT_SAMPLE_RATE, SpeechRequest,
    VoiceHTTPServer, canonical_reference, encode_wav, parse_speech_request,
)


TOKEN = "test-only-not-production-" + "x" * 32


def reference(*, seconds=6, rate=16000, channels=1, width=2):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(width)
        audio.setframerate(rate)
        audio.writeframes(b"\x01" * (int(seconds * rate) * channels * width))
    return output.getvalue()


def encoded_reference(**kwargs):
    return base64.b64encode(reference(**kwargs)).decode("ascii")


class ValidationTests(unittest.TestCase):
    def error(self, call, code, status=400):
        with self.assertRaises(ApiError) as failure:
            call()
        self.assertEqual((failure.exception.status, failure.exception.code), (status, code))

    def test_minimal_text_is_trimmed(self):
        self.assertEqual(parse_speech_request(b'{"text":"  Welcome.  "}'), SpeechRequest("Welcome."))

    def test_reference_is_canonical_mono_pcm(self):
        result = parse_speech_request(json.dumps({"text": "Hello", "referenceAudioBase64": encoded_reference()}).encode())
        with wave.open(io.BytesIO(result.reference_wav), "rb") as audio:
            self.assertEqual((audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getnframes()), (1, 2, 16000, 96000))

    def test_supported_reference_sample_rates(self):
        for rate in (16000, 22050, 24000, 44100, 48000):
            with self.subTest(rate=rate):
                self.assertTrue(canonical_reference(encoded_reference(rate=rate)))

    def test_reference_duration_boundaries(self):
        for seconds in (6, 20):
            self.assertTrue(canonical_reference(encoded_reference(seconds=seconds)))
        for seconds in (5, 5.999, 20.001):
            self.error(lambda: canonical_reference(encoded_reference(seconds=seconds)), "reference_duration_out_of_range")

    def test_reference_format_is_not_inferred_from_filename_or_url(self):
        for value in ("https://example.com/voice.wav", "/etc/passwd", "data:audio/wav;base64,AAAA", None, 1, "%%%%", ""):
            with self.subTest(value=value):
                self.error(lambda: canonical_reference(value), "invalid_reference_audio")

    def test_compressed_stereo_and_unsupported_width_or_rate_rejected(self):
        for parameters in ({"channels": 2}, {"width": 1}, {"width": 3}, {"rate": 8000}):
            with self.subTest(parameters=parameters):
                self.error(lambda: canonical_reference(encoded_reference(**parameters)), "unsupported_reference_audio")

    def test_truncated_reference_rejected(self):
        value = base64.b64encode(reference()[:-20]).decode()
        self.error(lambda: canonical_reference(value), "invalid_reference_audio")

    def test_reference_metadata_and_trailing_bytes_removed(self):
        original = reference()
        self.assertEqual(canonical_reference(base64.b64encode(original + b"sensitive metadata").decode()), original)

    def test_reference_size_limit(self):
        self.error(lambda: canonical_reference("A" * (4 * ((MAX_REFERENCE_BYTES + 2) // 3) + 4)), "invalid_reference_audio")

    def test_json_invalid_or_non_object(self):
        for payload in (b"", b"[1]", b"null", b"false", b"{", b'\xff', b'{"text":NaN}'):
            self.error(lambda: parse_speech_request(payload), "invalid_json" if payload in (b"", b"{", b'\xff', b'{"text":NaN}') else "invalid_request")

    def test_no_user_paths_model_options_or_urls(self):
        for key in ("audio_prompt_path", "model", "voiceId", "url", "device", "temperature"):
            self.error(lambda: parse_speech_request(json.dumps({"text": "Hello", key: "anything"}).encode()), "invalid_request")

    def test_duplicate_json_fields_rejected(self):
        self.error(lambda: parse_speech_request(b'{"text":"first","text":"second"}'), "invalid_json")

    def test_invalid_text(self):
        for value in (None, 5, "", " \n ", "\x00hidden", "x" * 1001, "\ud800"):
            self.error(lambda: parse_speech_request(json.dumps({"text": value}).encode()), "invalid_text")

    def test_valid_unicode_text_and_boundary(self):
        self.assertEqual(parse_speech_request(json.dumps({"text": "x" * 1000}).encode()).text, "x" * 1000)
        self.assertEqual(parse_speech_request(json.dumps({"text": "Welcome, Zoë."}).encode()).text, "Welcome, Zoë.")

    def test_body_bound(self):
        self.error(lambda: parse_speech_request(b" " * (MAX_REQUEST_BYTES + 1)), "request_too_large", 413)

    def test_missing_assets_fail_before_model_import(self):
        with tempfile.TemporaryDirectory() as directory, self.assertRaisesRegex(RuntimeError, "model_assets_unavailable"):
            verify_model_assets(Path(directory))
        self.assertNotIn("s3gen.safetensors", MODEL_ASSETS)

    def test_offline_engine_rejects_missing_assets_without_importing_model(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "model_assets_unavailable"):
                ChatterboxEngine.load(Config(TOKEN, model_directory=Path(directory)), directory)

    def test_configuration_secrets_redacted_and_limits_bounded(self):
        with patch.dict("os.environ", {"VOICE_ENGINE_SERVICE_TOKEN": TOKEN}, clear=True):
            config = Config.from_environment()
        self.assertNotIn(TOKEN, repr(config))
        self.assertEqual((config.cpu_threads, config.host), (4, "127.0.0.1"))
        for values in ({"VOICE_ENGINE_SERVICE_TOKEN": "short"}, {"VOICE_ENGINE_CPU_THREADS": "100"}, {"VOICE_ENGINE_INFERENCE_TIMEOUT_SECONDS": "999"}):
            with patch.dict("os.environ", {"VOICE_ENGINE_SERVICE_TOKEN": TOKEN, **values}, clear=True), self.assertRaises(ValueError):
                Config.from_environment()

    def test_local_peak_memory_measurement_is_positive(self):
        self.assertGreater(peak_memory_bytes(), 0)

    def test_synthetic_reference_uses_only_builtin_pcm_loop(self):
        source = encode_wav(b"\x01\x02" * 24000)
        result = synthetic_reference_from_builtin(source)
        with wave.open(io.BytesIO(result), "rb") as audio:
            self.assertEqual(audio.getnframes(), 6 * 24000)
            self.assertEqual(audio.readframes(6 * 24000), b"\x01\x02" * (6 * 24000))


class ConditioningTests(unittest.TestCase):
    def test_default_reset_and_private_tempfile_cleanup_after_success(self):
        model = MagicMock()
        model.conds = {"speaker": "default", "nested": [1]}
        paths = []

        def generate(text, audio_prompt_path):
            self.assertEqual(model.conds, {"speaker": "default", "nested": [1]})
            if audio_prompt_path:
                paths.append(Path(audio_prompt_path))
                self.assertEqual(paths[-1].read_bytes(), reference())
            model.conds["speaker"] = "private speaker"
            model.conds["nested"].append(2)
            return "fake-tensor"

        model.generate.side_effect = generate
        engine = ChatterboxEngine(model)
        engine.waveform_to_wav = MagicMock(return_value=b"mock-wave")
        self.assertEqual(engine.synthesize(SpeechRequest("Hello", reference())), b"mock-wave")
        self.assertEqual(model.conds, {"speaker": "default", "nested": [1]})
        self.assertFalse(paths[0].exists())
        engine.synthesize(SpeechRequest("Default voice again"))
        self.assertEqual(model.generate.call_args.kwargs["audio_prompt_path"], None)

    def test_conditioning_and_reference_cleaned_on_failure(self):
        model = MagicMock()
        model.conds = {"speaker": "default"}
        paths = []

        def fail(text, audio_prompt_path):
            model.conds = {"speaker": "private"}
            paths.append(Path(audio_prompt_path))
            raise RuntimeError("provider detail must not leave process")

        model.generate.side_effect = fail
        engine = ChatterboxEngine(model)
        with self.assertRaises(RuntimeError):
            engine.synthesize(SpeechRequest("Hello", reference()))
        self.assertEqual(model.conds, {"speaker": "default"})
        self.assertFalse(paths[0].exists())


class SupervisorTests(unittest.TestCase):
    def supervisor(self, *, message=("audio", b"mock"), poll=True):
        supervisor = ModelSupervisor.__new__(ModelSupervisor)
        supervisor.config = Config(TOKEN)
        supervisor._single_flight = threading.Lock()
        supervisor._state_lock = threading.Lock()
        supervisor._stop_lock = threading.Lock()
        supervisor._state = "ready"
        supervisor._scratch = tempfile.TemporaryDirectory()
        self.addCleanup(supervisor._scratch.cleanup)
        supervisor._connection = MagicMock()
        supervisor._connection.poll.return_value = poll
        supervisor._connection.recv.return_value = message
        supervisor._process = MagicMock()
        supervisor._process.is_alive.return_value = True
        supervisor._process.terminate.side_effect = lambda: setattr(supervisor._process.is_alive, "return_value", False)
        return supervisor

    def test_single_flight_returns_busy_without_sending(self):
        supervisor = self.supervisor()
        with supervisor._single_flight:
            with self.assertRaises(ApiError) as failure:
                supervisor.synthesize(SpeechRequest("Hello"))
        self.assertEqual((failure.exception.status, failure.exception.code), (429, "voice_engine_busy"))
        supervisor._connection.send.assert_not_called()

    def test_hung_job_terminated_quarantined_and_sample_removed(self):
        supervisor = self.supervisor(poll=False)
        private_sample = Path(supervisor._scratch.name) / "sample.wav"
        private_sample.write_bytes(b"private")
        with self.assertRaises(ApiError) as failure:
            supervisor.synthesize(SpeechRequest("Hello"))
        self.assertEqual((failure.exception.status, failure.exception.code), (504, "voice_engine_timeout"))
        supervisor._process.terminate.assert_called_once()
        self.assertEqual(supervisor.readiness()["state"], "quarantined")
        self.assertFalse(private_sample.exists())
        with self.assertRaises(ApiError) as again:
            supervisor.synthesize(SpeechRequest("No continued compute"))
        self.assertEqual(again.exception.status, 503)
        self.assertEqual(supervisor._connection.send.call_count, 1)

    def test_force_kill_if_terminate_does_not_stop(self):
        supervisor = self.supervisor(poll=False)
        supervisor._process.terminate.side_effect = None
        supervisor._process.kill.side_effect = lambda: setattr(supervisor._process.is_alive, "return_value", False)
        with self.assertRaises(ApiError):
            supervisor.synthesize(SpeechRequest("Hello"))
        supervisor._process.kill.assert_called_once()

    def test_invalid_or_oversized_response_quarantined(self):
        for message in (("failed",), ("audio", b"x" * (MAX_OUTPUT_BYTES + 1)), ("error", 500, "private detail")):
            supervisor = self.supervisor(message=message)
            with self.assertRaises(ApiError) as failure:
                supervisor.synthesize(SpeechRequest("Hello"))
            self.assertEqual(failure.exception.code, "voice_engine_unavailable")
            self.assertFalse(supervisor.readiness()["ready"])

    def test_valid_output_does_not_quarantine(self):
        supervisor = self.supervisor()
        self.assertEqual(supervisor.synthesize(SpeechRequest("Hello")), b"mock")
        self.assertTrue(supervisor.readiness()["ready"])
        supervisor._process.terminate.assert_not_called()

    def test_readiness_reports_actual_inference_deadline(self):
        supervisor = self.supervisor()
        self.assertEqual(supervisor.readiness()["inferenceTimeoutSeconds"], 60)
        supervisor.config = replace(supervisor.config, inference_timeout_seconds=15)
        self.assertEqual(supervisor.readiness()["inferenceTimeoutSeconds"], 15)

    def test_worker_death_not_ready_and_no_inference(self):
        supervisor = self.supervisor()
        supervisor._process.is_alive.return_value = False
        self.assertFalse(supervisor.readiness()["ready"])
        with self.assertRaises(ApiError) as failure:
            supervisor.synthesize(SpeechRequest("Hello"))
        self.assertEqual(failure.exception.status, 503)
        supervisor._connection.send.assert_not_called()


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.engine = MagicMock()
        self.engine.readiness.return_value = {"ready": True, "state": "ready"}
        self.engine.synthesize.return_value = encode_wav(b"\x00\x00" * OUTPUT_SAMPLE_RATE)
        self.server = VoiceHTTPServer(("127.0.0.1", 0), Config(TOKEN), self.engine)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_liveness_contains_no_model_or_credentials(self):
        status, headers, body = self.request("GET", "/healthz")
        self.assertEqual((status, json.loads(body)), (200, {"status": "ok"}))
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.engine.readiness.assert_not_called()

    def test_readiness_requires_authentication(self):
        for headers in ({}, {"Authorization": "Bearer wrong"}):
            status, _, body = self.request("GET", "/readyz", headers=headers)
            self.assertEqual((status, json.loads(body)), (401, {"error": {"code": "unauthorized"}}))
        self.engine.readiness.assert_not_called()

    def test_authenticated_readiness_reflects_model_failure(self):
        self.engine.readiness.return_value = {"ready": False, "state": "failed"}
        status, _, body = self.request("GET", "/readyz", headers={"Authorization": f"Bearer {TOKEN}"})
        self.assertEqual((status, json.loads(body)), (503, {"ready": False, "state": "failed"}))

    def test_speech_authentication_precedes_body_parsing(self):
        status, _, body = self.request("POST", "/v1/speech", b"invalid private body", {"Content-Type": "application/json"})
        self.assertEqual(status, 401)
        self.assertNotIn(b"private", body)
        self.engine.synthesize.assert_not_called()

    def test_success_wav_has_source_provenance_and_no_store(self):
        status, headers, body = self.request("POST", "/v1/speech", b'{"text":"Hello"}', {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "audio/wav")
        self.assertEqual(headers["X-Voice-Engine"], "chatterbox-nano")
        self.assertEqual(headers["X-Voice-Model-Revision"], MODEL_REVISION)
        self.assertEqual(headers["X-Voice-Source-Revision"], CHATTERBOX_SOURCE_REVISION)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertTrue(body.startswith(b"RIFF"))
        self.engine.synthesize.assert_called_once_with(SpeechRequest("Hello"))

    def test_busy_retry_header_and_safe_error(self):
        self.engine.synthesize.side_effect = ApiError(429, "voice_engine_busy")
        status, headers, body = self.request("POST", "/v1/speech", b'{"text":"Hello"}', {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
        self.assertEqual((status, headers["Retry-After"], json.loads(body)), (429, "2", {"error": {"code": "voice_engine_busy"}}))

    def test_body_size_and_content_type(self):
        headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "text/plain"}
        self.assertEqual(self.request("POST", "/v1/speech", b"Hello", headers)[0], 415)
        headers["Content-Length"] = str(MAX_REQUEST_BYTES + 1)
        self.assertEqual(self.request("POST", "/v1/speech", b"", headers)[0], 413)
        self.engine.synthesize.assert_not_called()


if __name__ == "__main__":
    unittest.main()
