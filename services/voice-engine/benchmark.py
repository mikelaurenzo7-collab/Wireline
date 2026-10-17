"""Explicit, local-only builtin-voice benchmark; no customer/reference audio is read."""

from __future__ import annotations

import argparse
import ctypes
import io
import json
from pathlib import Path
import platform
import sys
import tempfile
import time
import wave

from assets import CHATTERBOX_SOURCE_REVISION, MODEL_REVISION
from server import ChatterboxEngine, Config, SpeechRequest, canonical_reference, encode_wav


def peak_memory_bytes(process_id: int | None = None) -> int:
    if sys.platform == "win32":
        from ctypes import wintypes

        class MemoryCounters(ctypes.Structure):
            _fields_ = [
                ("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                *((name, ctypes.c_size_t) for name in (
                    "PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage",
                    "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage",
                    "PagefileUsage", "PeakPagefileUsage",
                )),
            ]

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        kernel.GetCurrentProcess.argtypes = []
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.CloseHandle.restype = wintypes.BOOL
        psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(MemoryCounters), wintypes.DWORD]
        psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
        counters = MemoryCounters()
        counters.cb = ctypes.sizeof(counters)
        handle = kernel.OpenProcess(0x0410, False, process_id) if process_id is not None else kernel.GetCurrentProcess()
        if not handle:
            raise OSError(ctypes.get_last_error(), "memory_measurement_failed")
        try:
            if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
                raise OSError(ctypes.get_last_error(), "memory_measurement_failed")
            return counters.PeakWorkingSetSize
        finally:
            if process_id is not None:
                kernel.CloseHandle(handle)
    if process_id is not None:
        for line in Path(f"/proc/{int(process_id)}/status").read_text().splitlines():
            if line.startswith("VmHWM:"):
                return int(line.split()[1]) * 1024
        raise RuntimeError("memory_measurement_unavailable")
    import resource

    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(value if sys.platform == "darwin" else value * 1024)


def synthetic_reference_from_builtin(audio: bytes) -> bytes:
    """Loop only the model's builtin output to exercise reference conditioning."""
    import base64

    with wave.open(io.BytesIO(audio), "rb") as parsed:
        if (parsed.getnchannels(), parsed.getsampwidth(), parsed.getframerate()) != (1, 2, 24000):
            raise ValueError("unexpected_builtin_format")
        pcm = parsed.readframes(parsed.getnframes())
    required = 6 * 24000 * 2
    if not pcm:
        raise ValueError("empty_builtin_output")
    pcm = (pcm * ((required + len(pcm) - 1) // len(pcm)))[:required]
    return canonical_reference(base64.b64encode(encode_wav(pcm)).decode("ascii"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--threads", type=int, choices=range(1, 9), default=4)
    parser.add_argument("--synthetic-reference", action="store_true", help="Condition sample two on a six-second loop of sample one's builtin output; no human recording")
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    config = Config(
        token="local-benchmark-placeholder-not-an-http-credential",
        model_directory=args.model_dir,
        cpu_threads=args.threads,
    )
    texts = [
        "Hello, thanks for calling. How can I help your business today?",
        "Your appointment is Tuesday at three thirty. I can help you book, reschedule, or leave a message.",
    ]
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="botbound-voice-benchmark-") as scratch:
        engine = ChatterboxEngine.load(config, scratch)
        result = {
            "sourceRevision": CHATTERBOX_SOURCE_REVISION,
            "modelRevision": MODEL_REVISION,
            "platform": platform.platform(),
            "python": platform.python_version(),
            "device": "cpu",
            "threads": args.threads,
            "speaker": "model_builtin_default",
            "secondSampleReference": "synthetic_builtin_loop" if args.synthetic_reference else "none",
            "loadSeconds": time.perf_counter() - started,
            "samples": [],
        }
        builtin_audio = None
        for index, text in enumerate(texts, start=1):
            started = time.perf_counter()
            reference = synthetic_reference_from_builtin(builtin_audio) if args.synthetic_reference and builtin_audio is not None else None
            audio = engine.synthesize(SpeechRequest(text, reference))
            if index == 1:
                builtin_audio = audio
            elapsed = time.perf_counter() - started
            with wave.open(io.BytesIO(audio), "rb") as parsed:
                duration = parsed.getnframes() / parsed.getframerate()
            (args.output_dir / f"sample-{index}.wav").write_bytes(audio)
            result["samples"].append({
                "characters": len(text),
                "elapsedSeconds": elapsed,
                "audioSeconds": duration,
                "realTimeFactor": elapsed / duration,
                "bytes": len(audio),
            })
        result["peakWorkingSetBytes"] = peak_memory_bytes()
        result["measurement"] = "Current process peak resident/working-set bytes, not total host RAM or a deployment size recommendation"
        (args.output_dir / "benchmark.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps(result))


if __name__ == "__main__":
    main()
