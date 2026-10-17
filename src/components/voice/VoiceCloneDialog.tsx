import { useId, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { Loader2, Mic, RotateCcw, Square, Upload } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "../atoms";
import { StatusNotice } from "../molecules";
import { Checkbox } from "../ui/shadcn/Checkbox";
import {
  VOICE_ASSET_CONSENT_VERSION,
  VOICE_CLONE_CONSENT_TEXT,
  type VoiceCloneCreateInput,
} from "../../lib/voice-clone-contract";
import {
  inspectPcm16MonoWav,
  VOICE_REFERENCE_MAX_BYTES,
  VOICE_REFERENCE_MAX_SECONDS,
  VOICE_REFERENCE_MIN_SECONDS,
  VOICE_REFERENCE_SAMPLE_RATES,
} from "../../lib/voice/voice-reference-audio";
import { encodeVoiceRecording, voiceAudioBase64 } from "./voice-clone-recording";

type Capture = {
  stream: MediaStream;
  context?: AudioContext;
  source?: MediaStreamAudioSourceNode;
  processor?: ScriptProcessorNode;
  sink?: GainNode;
  timer?: ReturnType<typeof setTimeout>;
  sampleRate: number;
  samples: number;
  chunks: Float32Array[];
};
type Recording = { bytes: Uint8Array; url: string; seconds: number; label: string };

function stopAudioPreview(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

function disposeCapture(capture: Capture | null) {
  if (!capture) return;
  if (capture.timer !== undefined) clearTimeout(capture.timer);
  if (capture.processor) capture.processor.onaudioprocess = null;
  // Releasing one browser resource must not strand the microphone if another
  // resource was already closed by the browser or an audio-device failure.
  for (const cleanup of [
    () => capture.stream.getTracks().forEach((track) => track.stop()),
    () => capture.source?.disconnect(),
    () => capture.processor?.disconnect(),
    () => capture.sink?.disconnect(),
  ]) {
    try {
      cleanup();
    } catch {
      // The remaining resources still need releasing.
    }
  }
  if (capture.context) void capture.context.close().catch(() => undefined);
}

export default function VoiceCloneDialog({
  open,
  onClose,
  onCreate,
  agentName,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: VoiceCloneCreateInput) => Promise<void>;
  agentName?: string;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [captureState, setCaptureState] = useState<"idle" | "requesting" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const capture = useRef<Capture | null>(null);
  const generation = useRef(0);
  const operation = useRef(0);
  const savePending = useRef(false);
  const capturePending = useRef(false);
  const previewUrl = useRef<string | null>(null);
  const audioPreview = useRef<HTMLAudioElement | null>(null);
  const attachAudioPreview = useRef((audio: HTMLAudioElement | null) => {
    if (audioPreview.current !== audio) stopAudioPreview(audioPreview.current);
    audioPreview.current = audio;
  });
  const fileInput = useRef<HTMLInputElement | null>(null);
  const finish = useRef<() => void>(() => undefined);
  const opener = useRef<HTMLElement | null>(null);
  const openingLocation = useRef("");

  const release = () => {
    const active = capture.current;
    capture.current = null;
    capturePending.current = false;
    disposeCapture(active);
  };
  const clearRecording = () => {
    stopAudioPreview(audioPreview.current);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setRecording(null);
    setConsent(false);
  };

  // Callers key this dialog by account and Bot. Closing, navigating away, or
  // replacing it invalidates every pending microphone/file/create continuation.
  useLayoutEffect(() => {
    generation.current += 1;
    operation.current += 1;
    release();
    clearRecording();
    setName(`${agentName?.trim() || "My"} voice`.slice(0, 80));
    setCaptureState("idle");
    setSeconds(0);
    setReading(false);
    setSaving(false);
    savePending.current = false;
    setError("");
    return () => {
      generation.current += 1;
      operation.current += 1;
      release();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    };
  }, [open, agentName]);

  const acceptAudio = (bytes: Uint8Array, label: string) => {
    const metadata = inspectPcm16MonoWav(bytes, {
      maxBytes: VOICE_REFERENCE_MAX_BYTES,
      minDurationSeconds: VOICE_REFERENCE_MIN_SECONDS,
      maxDurationSeconds: VOICE_REFERENCE_MAX_SECONDS,
      sampleRates: VOICE_REFERENCE_SAMPLE_RATES,
    });
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes).buffer], { type: "audio/wav" }),
    );
    clearRecording();
    previewUrl.current = url;
    setRecording({ bytes, url, seconds: metadata.durationSeconds, label });
  };

  finish.current = () => {
    const current = capture.current;
    if (!current) return;
    release();
    setCaptureState("idle");
    try {
      acceptAudio(encodeVoiceRecording(current.chunks, current.sampleRate), "Recorded voice");
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Record your voice again.");
    }
  };

  const startRecording = async () => {
    if (
      captureState !== "idle" ||
      capturePending.current ||
      reading ||
      savePending.current ||
      !open
    )
      return;
    capturePending.current = true;
    const currentGeneration = generation.current;
    const currentOperation = ++operation.current;
    clearRecording();
    setError("");
    setSeconds(0);
    setCaptureState("requesting");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Recording is unavailable in this browser. Upload a WAV recording instead.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (currentGeneration !== generation.current || currentOperation !== operation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const current: Capture = { stream, sampleRate: 0, samples: 0, chunks: [] };
      capture.current = current;
      const Context =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) throw new Error("Recording is unavailable. Upload a WAV recording instead.");
      current.context = new Context();
      current.sampleRate = current.context.sampleRate;
      current.source = current.context.createMediaStreamSource(stream);
      current.processor = current.context.createScriptProcessor(4_096, 1, 1);
      current.sink = current.context.createGain();
      current.sink.gain.value = 0;
      current.processor.onaudioprocess = (event) => {
        if (
          currentGeneration !== generation.current ||
          currentOperation !== operation.current ||
          capture.current !== current
        )
          return;
        const remaining = VOICE_REFERENCE_MAX_SECONDS * current.sampleRate - current.samples;
        const samples = event.inputBuffer.getChannelData(0).slice(0, Math.max(0, remaining));
        if (samples.length) {
          current.chunks.push(samples);
          current.samples += samples.length;
          setSeconds(current.samples / current.sampleRate);
        }
        if (current.samples >= VOICE_REFERENCE_MAX_SECONDS * current.sampleRate) finish.current();
      };
      current.source.connect(current.processor);
      current.processor.connect(current.sink);
      current.sink.connect(current.context.destination);
      await current.context.resume();
      if (
        currentGeneration !== generation.current ||
        currentOperation !== operation.current ||
        capture.current !== current
      )
        return;
      current.timer = setTimeout(() => {
        if (capture.current === current) finish.current();
      }, VOICE_REFERENCE_MAX_SECONDS * 1_000);
      setCaptureState("recording");
    } catch (reason) {
      if (currentGeneration !== generation.current || currentOperation !== operation.current)
        return;
      release();
      setCaptureState("idle");
      setError(
        reason instanceof Error
          ? reason.message
          : "Microphone access was unavailable. Allow access or upload a WAV recording.",
      );
    }
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || captureState !== "idle" || savePending.current) return;
    const currentGeneration = generation.current;
    const currentOperation = ++operation.current;
    setError("");
    setReading(true);
    clearRecording();
    try {
      if (file.size > VOICE_REFERENCE_MAX_BYTES)
        throw new Error("Choose a WAV recording smaller than 2 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (currentGeneration !== generation.current || currentOperation !== operation.current)
        return;
      try {
        acceptAudio(bytes, file.name);
      } catch {
        throw new Error("Choose a mono PCM 16-bit WAV recording, 6 to 20 seconds and up to 2 MB.");
      }
    } catch (reason) {
      if (currentGeneration === generation.current && currentOperation === operation.current)
        setError(reason instanceof Error ? reason.message : "The recording could not be opened.");
    } finally {
      if (currentGeneration === generation.current && currentOperation === operation.current)
        setReading(false);
    }
  };

  const create = async () => {
    if (!recording || !consent || !name.trim() || busy || savePending.current || !open) return;
    const currentGeneration = generation.current;
    savePending.current = true;
    setSaving(true);
    setError("");
    try {
      await onCreate({
        name: name.trim(),
        referenceAudioBase64: voiceAudioBase64(recording.bytes),
        consentAccepted: true,
        consentVersion: VOICE_ASSET_CONSENT_VERSION,
      });
      if (currentGeneration === generation.current) onClose();
    } catch (reason) {
      if (currentGeneration === generation.current)
        setError(
          reason instanceof Error ? reason.message : "Your voice could not be saved. Try again.",
        );
    } finally {
      if (currentGeneration === generation.current) {
        savePending.current = false;
        setSaving(false);
      }
    }
  };
  const busy = saving || reading || captureState !== "idle";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !savePending.current) onClose();
      }}
    >
      <DialogContent
        showClose={!saving}
        aria-busy={saving}
        className="min-w-0 max-w-lg overflow-x-hidden"
        onOpenAutoFocus={() => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          openingLocation.current = window.location.href;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (
            openingLocation.current === window.location.href &&
            opener.current?.isConnected &&
            !opener.current.matches(":disabled")
          )
            opener.current.focus({ preventScroll: true });
          opener.current = null;
        }}
        onEscapeKeyDown={(event) => {
          if (savePending.current) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (savePending.current) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create your voice</DialogTitle>
          <DialogDescription>Record your own voice for a private preview.</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <label htmlFor={`${id}-name`} className="text-sm font-medium text-foreground">
              Voice name
            </label>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={80}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="min-w-0 space-y-3 rounded-xl border border-border bg-secondary/40 p-4">
            <p className="text-sm text-muted-foreground">
              Speak naturally for 6 to 20 seconds. Quiet room, one speaker.
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={captureState === "recording" ? "outline" : "default"}
                disabled={saving || reading || captureState === "requesting"}
                onClick={
                  captureState === "recording"
                    ? () => finish.current()
                    : () => void startRecording()
                }
                className="min-h-11 max-w-full whitespace-normal"
              >
                {captureState === "requesting" ? (
                  <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
                ) : captureState === "recording" ? (
                  <Square aria-hidden="true" className="size-4 shrink-0" />
                ) : (
                  <Mic aria-hidden="true" className="size-4 shrink-0" />
                )}
                {captureState === "requesting"
                  ? "Waiting for microphone"
                  : captureState === "recording"
                    ? "Stop recording"
                    : recording
                      ? "Record again"
                      : "Start recording"}
              </Button>
              {captureState === "recording" ? (
                <span
                  className="text-sm tabular-nums text-foreground"
                  role="timer"
                  aria-label="Recording duration"
                >
                  {Math.floor(seconds)} / 20s
                </span>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                className="min-h-11 max-w-full whitespace-normal"
              >
                <Upload aria-hidden="true" className="size-4 shrink-0" />
                Upload WAV
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="audio/wav,audio/x-wav,.wav"
                className="hidden"
                tabIndex={-1}
                aria-label="Upload voice recording"
                onChange={(event) => void upload(event)}
                disabled={busy}
              />
            </div>
            {reading ? (
              <p className="text-sm text-muted-foreground" role="status">
                Reading recording…
              </p>
            ) : null}
            {recording ? (
              <div className="min-w-0 space-y-2">
                <p className="break-words text-sm text-foreground [overflow-wrap:anywhere]">
                  {recording.label} · {recording.seconds.toFixed(1)}s
                </p>
                <audio
                  ref={attachAudioPreview.current}
                  src={recording.url}
                  controls
                  preload="metadata"
                  aria-label="Your voice recording"
                  className="block h-10 w-full min-w-0 max-w-full"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={clearRecording}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  Remove recording
                </button>
              </div>
            ) : null}
          </div>
          <label className="flex min-w-0 cursor-pointer items-start gap-3 text-sm leading-6 text-muted-foreground">
            <Checkbox
              id={`${id}-consent`}
              checked={consent}
              disabled={busy || !recording}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1 size-5"
            />
            <span>{VOICE_CLONE_CONSENT_TEXT}</span>
          </label>
          {error ? (
            <StatusNotice tone="destructive" title="Voice needs attention">
              <span className="break-words [overflow-wrap:anywhere]">{error}</span>
            </StatusNotice>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
            className="min-h-11 whitespace-normal"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !recording || !consent || !name.trim()}
            onClick={() => void create()}
            className="min-h-11 whitespace-normal"
          >
            {saving ? (
              <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
            ) : null}
            {saving ? "Saving voice…" : "Save voice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
