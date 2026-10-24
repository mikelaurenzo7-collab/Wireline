import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  Loader2,
  Mic,
  Pause,
  Phone,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { authFetch } from "../../lib/api";
import {
  LIVE_VOICE_COACHING_COPY,
  LIVE_VOICE_SCRIPT,
  analyzeLiveVoiceRecording,
  readPcm16MonoWav,
  type LiveVoiceQualityReport,
} from "../../lib/voice/live-voice-quality";
import { StatusNotice } from "../molecules";
import { Checkbox } from "../ui/shadcn/Checkbox";
import { encodeVoiceRecording } from "./voice-clone-recording";

/**
 * Clone a voice for live calls: consent, a guided read with a live level
 * meter, an instant quality check with friendly coaching, an A/B against the
 * stock voice, and one tap to put it on (or take it off) this Bot.
 */

type ClonedVoice = {
  id: string;
  name: string;
  qualityScore: number | null;
  sourceDurationSeconds: number;
  gender: "female" | "male" | null;
  createdAt: string;
  inUseByAgentIds: string[];
};

type Capabilities = {
  available: boolean;
  consentVersion: string;
  minSeconds: number;
  recommendedSeconds: number;
  maxSeconds: number;
  maxBytes: number;
  maxVoices: number;
};

type Step = "idle" | "consent" | "record" | "review" | "creating" | "done";
type Recording = { bytes: Uint8Array; url: string; report: LiveVoiceQualityReport };
type Capture = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  sink: GainNode;
  chunks: Float32Array[];
  samples: number;
};

/** Shown once, after the first clone completes, and never again once dismissed. */
/** Deep links (/voice-clone, "Clone your voice") scroll here. */
export const LIVE_VOICE_ANCHOR_ID = "voice-clone";

export const LIVE_VOICE_TIP_KEY = "botbound.liveVoiceTip.v1";
export const LIVE_VOICE_TIP_COPY =
  "Tip: stock voices are tuned for the fastest replies on high-volume lines.";

const CREATE_STAGES = [
  "Checking your recording…",
  "Learning how you sound…",
  "Tuning it for phone calls…",
  "Almost ready…",
];

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || fallback;
}

function formatSeconds(value: number): string {
  const whole = Math.max(0, Math.floor(value));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function verdictLabel(report: LiveVoiceQualityReport): string {
  if (report.verdict === "great") return "Sounds great";
  if (report.verdict === "good") return "Good to go";
  return "Let's try that again";
}

function readTip(): boolean {
  try {
    return window.localStorage.getItem(LIVE_VOICE_TIP_KEY) === "dismissed";
  } catch {
    return false;
  }
}

export default function LiveVoiceCloneStudio({
  agentId,
  agentName,
  stockVoiceId,
  botPhone,
  onActiveVoiceChange,
}: {
  agentId: string;
  agentName: string;
  stockVoiceId: string | null;
  botPhone?: string | null;
  /** Lets the voice picker say which voice callers hear. */
  onActiveVoiceChange?: (name: string | null) => void;
}) {
  const id = useId();
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [voices, setVoices] = useState<ClonedVoice[]>([]);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"self" | "authorized_speaker">("self");
  const [gender, setGender] = useState<"" | "female" | "male">("");
  const [consent, setConsent] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [recordingState, setRecordingState] = useState<"idle" | "requesting" | "recording">("idle");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [createStage, setCreateStage] = useState(0);
  const [created, setCreated] = useState<ClonedVoice | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tipDismissed, setTipDismissed] = useState(true);
  const capture = useRef<Capture | null>(null);
  const meterFrame = useRef<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const playRequest = useRef(0);
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const activeVoice = voices.find((voice) => voice.inUseByAgentIds.includes(agentId)) ?? null;
  const activeVoiceName = activeVoice?.name ?? null;
  useEffect(() => {
    onActiveVoiceChange?.(activeVoiceName);
  }, [activeVoiceName, onActiveVoiceChange]);
  const minSeconds = capabilities?.minSeconds ?? 10;
  const recommendedSeconds = capabilities?.recommendedSeconds ?? 90;
  const maxSeconds = capabilities?.maxSeconds ?? 120;
  const scriptLine = Math.min(
    LIVE_VOICE_SCRIPT.length - 1,
    Math.floor((seconds / recommendedSeconds) * LIVE_VOICE_SCRIPT.length),
  );

  const scriptList = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    if (recordingState !== "recording") return;
    const line = scriptList.current?.children[scriptLine] as HTMLElement | undefined;
    line?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [recordingState, scriptLine]);

  const stopPlayback = useCallback(() => {
    playRequest.current += 1;
    audio.current?.pause();
    audio.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    setPlaying(null);
  }, []);

  const releaseCapture = useCallback(() => {
    const current = capture.current;
    capture.current = null;
    if (meterFrame.current !== null) cancelAnimationFrame(meterFrame.current);
    meterFrame.current = null;
    setLevel(0);
    if (!current) return;
    current.processor.onaudioprocess = null;
    for (const cleanup of [
      () => current.stream.getTracks().forEach((track) => track.stop()),
      () => current.source.disconnect(),
      () => current.processor.disconnect(),
      () => current.sink.disconnect(),
    ]) {
      try {
        cleanup();
      } catch {
        // Keep releasing the rest of the microphone resources.
      }
    }
    void current.context.close().catch(() => undefined);
  }, []);

  const clearRecording = useCallback(() => {
    setRecording((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return null;
    });
  }, []);

  const load = useCallback(async () => {
    const response = await authFetch("/api/voice/live-voices");
    if (!response.ok) throw new Error(await errorMessage(response, "Cloned voices didn't load."));
    const body = (await response.json()) as Capabilities & { voices: ClonedVoice[] };
    setCapabilities(body);
    setVoices(body.voices ?? []);
  }, []);

  useLayoutEffect(() => {
    generation.current += 1;
    setName(`${agentName.trim() || "My"} voice`.slice(0, 80));
    setStep("idle");
    setError(null);
    setNotice(null);
    setLoading(true);
    const current = generation.current;
    load()
      .catch((reason) => {
        if (current === generation.current)
          setError(reason instanceof Error ? reason.message : "Cloned voices didn't load.");
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      generation.current += 1;
      releaseCapture();
      stopPlayback();
    };
  }, [agentId, agentName, load, releaseCapture, stopPlayback]);

  useEffect(() => () => clearRecording(), [clearRecording]);

  useEffect(() => {
    if (step !== "creating") return;
    setCreateStage(0);
    const timer = window.setInterval(
      () => setCreateStage((stage) => Math.min(CREATE_STAGES.length - 1, stage + 1)),
      2_500,
    );
    return () => window.clearInterval(timer);
  }, [step]);

  function acceptWav(bytes: Uint8Array) {
    const decoded = readPcm16MonoWav(bytes);
    const report = analyzeLiveVoiceRecording(decoded.samples, decoded.sampleRateHz);
    clearRecording();
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes).buffer], { type: "audio/wav" }),
    );
    setRecording({ bytes, url, report });
    setStep("review");
  }

  function finishRecording() {
    const current = capture.current;
    if (!current) return;
    const chunks = current.chunks;
    const rate = current.context.sampleRate;
    releaseCapture();
    setRecordingState("idle");
    try {
      acceptWav(encodeVoiceRecording(chunks, rate, { minSeconds, maxSeconds }));
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That recording couldn't be read. Give it another go.",
      );
    }
  }

  async function startRecording() {
    if (recordingState !== "idle") return;
    const current = generation.current;
    setError(null);
    clearRecording();
    setSeconds(0);
    setRecordingState("requesting");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("This browser can't record. Upload a WAV recording instead.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (current !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const Context =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const context = new Context();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4_096, 1, 1);
      const sink = context.createGain();
      sink.gain.value = 0;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1_024;
      source.connect(analyser);
      const active: Capture = { stream, context, source, processor, sink, chunks: [], samples: 0 };
      capture.current = active;
      processor.onaudioprocess = (event) => {
        if (capture.current !== active) return;
        const remaining = maxSeconds * context.sampleRate - active.samples;
        const samples = event.inputBuffer.getChannelData(0).slice(0, Math.max(0, remaining));
        if (samples.length) {
          active.chunks.push(samples);
          active.samples += samples.length;
          setSeconds(active.samples / context.sampleRate);
        }
        if (active.samples >= maxSeconds * context.sampleRate) finishRecording();
      };
      source.connect(processor);
      processor.connect(sink);
      sink.connect(context.destination);
      const buffer = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (capture.current !== active) return;
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const value of buffer) sum += value * value;
        const db = 20 * Math.log10(Math.sqrt(sum / buffer.length) || 1e-5);
        setLevel(Math.max(0, Math.min(1, (db + 60) / 50)));
        meterFrame.current = requestAnimationFrame(tick);
      };
      await context.resume();
      meterFrame.current = requestAnimationFrame(tick);
      setRecordingState("recording");
    } catch (reason) {
      releaseCapture();
      setRecordingState("idle");
      setError(
        reason instanceof DOMException && reason.name === "NotAllowedError"
          ? "Microphone access is off. Allow it in your browser, or upload a WAV recording."
          : reason instanceof Error
            ? reason.message
            : "The microphone didn't start. Try again or upload a WAV recording.",
      );
    }
  }

  async function uploadFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      if (capabilities && file.size > capabilities.maxBytes)
        throw new Error("That file is too large. Keep it under two minutes.");
      acceptWav(new Uint8Array(await file.arrayBuffer()));
    } catch {
      setError("Choose a mono 16-bit WAV between 10 seconds and 2 minutes.");
    }
  }

  async function createVoice() {
    if (!recording || !consent || !capabilities) return;
    const current = generation.current;
    setStep("creating");
    setError(null);
    try {
      const params = new URLSearchParams({
        name: name.trim(),
        consentAccepted: "true",
        consentVersion: capabilities.consentVersion,
        consentScope: scope,
      });
      if (gender) params.set("gender", gender);
      const response = await authFetch(`/api/voice/live-voices?${params}`, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: new Blob([new Uint8Array(recording.bytes).buffer], { type: "audio/wav" }),
        timeoutMs: 120_000,
      });
      if (!response.ok)
        throw new Error(await errorMessage(response, "Your voice couldn't be created. Try again."));
      const body = (await response.json()) as { voice: ClonedVoice };
      if (current !== generation.current) return;
      setCreated(body.voice);
      // The tip appears on this one completion only; it is never shown again.
      const seen = readTip();
      setTipDismissed(seen);
      if (!seen) dismissTip(false);
      setVoices((list) => [body.voice, ...list.filter((voice) => voice.id !== body.voice.id)]);
      clearRecording();
      setStep("done");
    } catch (reason) {
      if (current !== generation.current) return;
      setStep("review");
      setError(reason instanceof Error ? reason.message : "Your voice couldn't be created.");
    }
  }

  async function play(voiceId: string, variant: "clone" | "stock") {
    const key = `${voiceId}:${variant}`;
    if (playing === key) {
      stopPlayback();
      return;
    }
    stopPlayback();
    const request = ++playRequest.current;
    setPlaying(key);
    setError(null);
    try {
      const params = new URLSearchParams({ variant, agentName });
      if (stockVoiceId) params.set("stockVoice", stockVoiceId);
      const response = await authFetch(
        `/api/voice/live-voices/${encodeURIComponent(voiceId)}/preview?${params}`,
        { timeoutMs: 30_000 },
      );
      if (!response.ok) throw new Error(await errorMessage(response, "That preview didn't play."));
      const blob = await response.blob();
      if (request !== playRequest.current) return;
      const url = URL.createObjectURL(blob);
      audioUrl.current = url;
      const element = new Audio(url);
      audio.current = element;
      element.onended = () => {
        if (request === playRequest.current) stopPlayback();
      };
      await element.play();
    } catch (reason) {
      if (request !== playRequest.current) return;
      stopPlayback();
      setError(reason instanceof Error ? reason.message : "That preview didn't play.");
    }
  }

  async function applyVoice(voice: ClonedVoice | null) {
    setBusy(voice ? `use:${voice.id}` : "stock");
    setError(null);
    setNotice(null);
    try {
      const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/live-voice`, {
        method: voice ? "POST" : "DELETE",
        body: voice ? JSON.stringify({ voiceId: voice.id }) : undefined,
      });
      if (!response.ok) throw new Error(await errorMessage(response, "That change didn't save."));
      setVoices((list) =>
        list.map((item) => ({
          ...item,
          inUseByAgentIds:
            voice && item.id === voice.id
              ? [...new Set([...item.inUseByAgentIds, agentId])]
              : item.inUseByAgentIds.filter((idValue) => idValue !== agentId),
        })),
      );
      setNotice(
        voice
          ? `${agentName} now answers calls as ${voice.name}.`
          : `${agentName} is back on its stock voice.`,
      );
      if (voice) setStep("idle");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That change didn't save.");
    } finally {
      setBusy(null);
    }
  }

  async function removeVoice(voice: ClonedVoice) {
    if (!window.confirm(`Delete ${voice.name}? Bots using it switch back to their stock voice.`))
      return;
    setBusy(`delete:${voice.id}`);
    setError(null);
    try {
      const response = await authFetch(`/api/voice/live-voices/${encodeURIComponent(voice.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await errorMessage(response, "That voice wasn't deleted."));
      setVoices((list) => list.filter((item) => item.id !== voice.id));
      if (created?.id === voice.id) {
        setCreated(null);
        setStep("idle");
      }
      setNotice(`${voice.name} was deleted.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That voice wasn't deleted.");
    } finally {
      setBusy(null);
    }
  }

  function dismissTip(hide = true) {
    if (hide) setTipDismissed(true);
    try {
      window.localStorage.setItem(LIVE_VOICE_TIP_KEY, "dismissed");
    } catch {
      // Private browsing: the tip just stays dismissed for this visit.
    }
  }

  const renderHeader = (subtitle: string) => (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h4 id={`${id}-title`} className="text-sm font-semibold text-foreground">
          Your voice, on every call
        </h4>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
  const header = renderHeader(
    `Read a short script and ${agentName} answers the phone sounding like you.`,
  );
  const shellClass =
    "min-w-0 scroll-mt-24 space-y-3 outline-none rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background p-3 sm:p-4";

  if (loading) {
    return (
      <section
        id={LIVE_VOICE_ANCHOR_ID}
        tabIndex={-1}
        aria-labelledby={`${id}-title`}
        aria-busy="true"
        className={shellClass}
      >
        {header}
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Checking voice cloning for this account…
        </p>
      </section>
    );
  }

  if (!capabilities?.available) {
    return (
      <section
        id={LIVE_VOICE_ANCHOR_ID}
        tabIndex={-1}
        aria-labelledby={`${id}-title`}
        className={shellClass}
      >
        {renderHeader(
          error
            ? "Record a short script so callers hear you."
            : `${agentName} can answer calls in your own voice once cloning is on for your account.`,
        )}
        {error ? (
          <div className="space-y-2">
            <StatusNotice tone="destructive" title="Something needs a second try">
              {error}
            </StatusNotice>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setLoading(true);
                const current = generation.current;
                load()
                  .catch((reason) => {
                    if (current === generation.current)
                      setError(
                        reason instanceof Error ? reason.message : "Cloned voices didn't load.",
                      );
                  })
                  .finally(() => {
                    if (current === generation.current) setLoading(false);
                  });
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted wl-focus-ring-halo"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs leading-5 text-muted-foreground">
            Voice cloning isn't on for this account yet. Until then, {agentName} keeps answering
            with the stock voice you pick.
          </p>
        )}
      </section>
    );
  }

  const atLimit = voices.length >= capabilities.maxVoices;
  const retake = recording?.report.verdict === "retake";
  // "That works" reads as a contradiction next to a retake verdict.
  const reviewTips = (recording?.report.tips ?? []).filter(
    (tip) => !(retake && tip === "short_but_ok"),
  );
  const primaryButton =
    "inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 wl-focus-ring-halo disabled:opacity-50";
  const secondaryButton =
    "inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted wl-focus-ring-halo disabled:opacity-50";
  const playButton = (voiceId: string, variant: "clone" | "stock", label: string) => {
    const active = playing === `${voiceId}:${variant}`;
    return (
      <button
        type="button"
        onClick={() => void play(voiceId, variant)}
        aria-pressed={active}
        className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors wl-focus-ring-halo ${
          active
            ? "border-primary/40 bg-primary/10 text-foreground"
            : "border-border bg-background text-foreground hover:bg-muted"
        }`}
      >
        {active ? (
          <Square className="size-3.5 fill-current" aria-hidden="true" />
        ) : (
          <Play className="size-4" aria-hidden="true" />
        )}
        {label}
      </button>
    );
  };

  return (
    <section
      id={LIVE_VOICE_ANCHOR_ID}
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      className={shellClass}
    >
      {header}

      <div aria-live="polite" className="space-y-2">
        {notice ? <StatusNotice tone="success">{notice}</StatusNotice> : null}
        {error ? (
          <StatusNotice tone="destructive" title="Something needs a second try">
            {error}
          </StatusNotice>
        ) : null}
      </div>

      {activeVoice ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
          <span className="min-w-0 text-sm text-foreground">
            <Check className="mr-1.5 inline size-4 text-primary" aria-hidden="true" />
            Callers hear <strong>{activeVoice.name}</strong>
          </span>
          <button
            type="button"
            onClick={() => void applyVoice(null)}
            disabled={busy !== null}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-muted wl-focus-ring-halo disabled:opacity-60"
          >
            {busy === "stock" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="size-4" aria-hidden="true" />
            )}
            Switch back to stock voice
          </button>
        </div>
      ) : null}

      {voices.length > 0 && step !== "done" ? (
        <ul className="space-y-2" aria-label="Your cloned voices">
          {voices.map((voice) => {
            const inUse = voice.inUseByAgentIds.includes(agentId);
            return (
              <li
                key={voice.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold text-foreground">
                    {voice.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {inUse ? "On this Bot" : "Ready"}
                    {voice.qualityScore !== null ? ` · Quality ${voice.qualityScore}/100` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void play(voice.id, "clone")}
                  aria-label={`${playing === `${voice.id}:clone` ? "Stop" : "Play"} ${voice.name}`}
                  aria-pressed={playing === `${voice.id}:clone`}
                  className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground wl-focus-ring-halo"
                >
                  {playing === `${voice.id}:clone` ? (
                    <Pause className="size-4" aria-hidden="true" />
                  ) : (
                    <Play className="size-4" aria-hidden="true" />
                  )}
                </button>
                {!inUse ? (
                  <button
                    type="button"
                    onClick={() => void applyVoice(voice)}
                    disabled={busy !== null}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 wl-focus-ring-halo disabled:opacity-60"
                  >
                    {busy === `use:${voice.id}` ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Use on this Bot
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void removeVoice(voice)}
                  disabled={busy !== null}
                  aria-label={`Delete ${voice.name}`}
                  className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive wl-focus-ring-halo disabled:opacity-60"
                >
                  {busy === `delete:${voice.id}` ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="size-4" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {step === "idle" ? (
        atLimit ? (
          <p className="text-xs leading-5 text-muted-foreground">
            You can keep {capabilities.maxVoices} cloned voices. Delete one to make another.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => {
              setStep("consent");
              setError(null);
              setNotice(null);
            }}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 wl-focus-ring-halo sm:w-auto"
          >
            <Mic className="size-4" aria-hidden="true" />
            {voices.length ? "Clone another voice" : "Clone my voice"}
          </button>
        )
      ) : null}

      {step === "consent" ? (
        <form
          className="space-y-3 rounded-xl border border-border bg-background p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (consent && name.trim()) setStep("record");
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Step 1 of 3 · Permission
          </p>
          <label className="block text-sm font-medium text-foreground" htmlFor={`${id}-name`}>
            Voice name
            <input
              id={`${id}-name`}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            />
          </label>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-foreground">Whose voice is this?</legend>
            {(
              [
                ["self", "My own voice"],
                ["authorized_speaker", "Someone who gave me written permission"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${id}-scope`}
                  checked={scope === value}
                  onChange={() => setScope(value)}
                  className="size-4"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="block text-sm font-medium text-foreground" htmlFor={`${id}-gender`}>
            Closest stock voice{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
            <select
              id={`${id}-gender`}
              value={gender}
              onChange={(event) => setGender(event.target.value as typeof gender)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">Use the Bot's current voice</option>
              <option value="female">Higher, brighter voice</option>
              <option value="male">Lower, deeper voice</option>
            </select>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Used as the backup voice so callers never hear a jarring change.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm leading-5 text-foreground">
            <Checkbox
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              I confirm this is my voice, or I have the speaker's permission, to use it for{" "}
              {agentName}'s calls. I can delete it anytime, and it's deleted with my account.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!consent || !name.trim()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 wl-focus-ring-halo disabled:opacity-50"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => setStep("idle")}
              className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-muted-foreground hover:bg-muted wl-focus-ring-halo"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {step === "record" ? (
        <div className="space-y-3 rounded-xl border border-border bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Step 2 of 3 · Read aloud, like you're on a call
          </p>
          <ol
            ref={scriptList}
            className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg bg-muted/40 p-3 text-sm leading-6"
          >
            {LIVE_VOICE_SCRIPT.map((line, index) => (
              <li
                key={line}
                aria-current={recordingState === "recording" && index === scriptLine}
                className={
                  recordingState === "recording" && index === scriptLine
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                }
              >
                {line}
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-3">
            <div
              role="meter"
              aria-label="Microphone level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level * 100)}
              className="h-2.5 flex-1 overflow-hidden rounded-full bg-foreground/10"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-75 ${
                  level > 0.92 ? "bg-amber-500" : "bg-primary"
                }`}
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {formatSeconds(seconds)} / {formatSeconds(recommendedSeconds)}
            </span>
          </div>
          <p className="text-xs leading-5 text-muted-foreground" aria-live="polite">
            {recordingState !== "recording"
              ? "Find a quiet room and hold the mic about a hand's width away."
              : level > 0.92
                ? "A touch loud. Lean back a little."
                : level < 0.15
                  ? "We can barely hear you. Move a little closer."
                  : seconds < minSeconds
                    ? "Sounding good. Keep reading."
                    : seconds < recommendedSeconds
                      ? "Great. Keep going for the most natural result, or stop anytime."
                      : "Perfect. Stop whenever you're ready."}
          </p>
          <div className="flex flex-wrap gap-2">
            {recordingState === "recording" ? (
              <button
                type="button"
                onClick={finishRecording}
                disabled={seconds < minSeconds}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 wl-focus-ring-halo disabled:opacity-50"
              >
                <Square className="size-3.5 fill-current" aria-hidden="true" />
                {seconds < minSeconds
                  ? `Keep going (${Math.ceil(minSeconds - seconds)}s)`
                  : "Stop and check"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startRecording()}
                disabled={recordingState === "requesting"}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 wl-focus-ring-halo disabled:opacity-60"
              >
                {recordingState === "requesting" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Mic className="size-4" aria-hidden="true" />
                )}
                Start recording
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={recordingState !== "idle"}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted wl-focus-ring-halo disabled:opacity-50"
            >
              <Upload className="size-4" aria-hidden="true" />
              Upload a WAV
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="audio/wav,audio/x-wav,.wav"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void uploadFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => {
                releaseCapture();
                setRecordingState("idle");
                setStep("idle");
              }}
              className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-muted-foreground hover:bg-muted wl-focus-ring-halo"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {step === "review" && recording ? (
        <div className="space-y-3 rounded-xl border border-border bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Step 3 of 3 · Quality check
          </p>
          <div className="flex items-center gap-3">
            <span
              className={`grid size-12 shrink-0 place-items-center rounded-full text-sm font-bold ${
                recording.report.verdict === "retake"
                  ? "bg-amber-100 text-amber-900"
                  : "bg-primary/10 text-primary"
              }`}
              aria-hidden="true"
            >
              {recording.report.score}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {verdictLabel(recording.report)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatSeconds(recording.report.durationSeconds)} recorded · quality{" "}
                {recording.report.score}/100
              </p>
            </div>
          </div>
          {reviewTips.length ? (
            <ul className="space-y-1 text-sm leading-5 text-foreground">
              {reviewTips.map((tip) => (
                <li key={tip}>• {LIVE_VOICE_COACHING_COPY[tip]}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground">Clear, steady and well-paced. Nice work.</p>
          )}
          <audio controls src={recording.url} className="w-full" aria-label="Your recording" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                clearRecording();
                setSeconds(0);
                setStep("record");
              }}
              className={retake ? primaryButton : secondaryButton}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Retake
            </button>
            {!retake ? (
              <button type="button" onClick={() => void createVoice()} className={primaryButton}>
                <Sparkles className="size-4" aria-hidden="true" />
                Create my voice
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === "creating" ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-border bg-background p-4"
        >
          <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{CREATE_STAGES[createStage]}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700"
                style={{ width: `${((createStage + 1) / CREATE_STAGES.length) * 90}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {step === "done" && created ? (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-background p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Check className="size-4 text-primary" aria-hidden="true" />
            {created.name} is ready. Hear the difference:
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {playButton(created.id, "clone", "Your voice")}
            {playButton(created.id, "stock", "Stock voice")}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void applyVoice(created)}
              disabled={busy !== null}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 wl-focus-ring-halo disabled:opacity-60"
            >
              {busy === `use:${created.id}` ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-4" aria-hidden="true" />
              )}
              Use this voice on {agentName}
            </button>
            <button
              type="button"
              onClick={() => setStep("idle")}
              className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-muted-foreground hover:bg-muted wl-focus-ring-halo"
            >
              Not now
            </button>
          </div>
          {!tipDismissed ? (
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
              <span className="min-w-0 flex-1">{LIVE_VOICE_TIP_COPY}</span>
              <button
                type="button"
                onClick={() => dismissTip()}
                aria-label="Dismiss tip"
                className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted wl-focus-ring-halo"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeVoice && botPhone ? (
        <a
          href={`tel:${botPhone}`}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted wl-focus-ring-halo sm:w-auto"
        >
          <Phone className="size-4" aria-hidden="true" />
          Test call: dial {botPhone}
        </a>
      ) : null}
    </section>
  );
}
