import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  Check,
  Loader2,
  Mic2,
  Pause,
  Play,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";

import { authFetch } from "../../lib/api";
import {
  ELEVENLABS_VOICE_CONSENT_VERSION,
  ELEVENLABS_VOICE_QUALITY_VERSION,
} from "../../lib/managed-voice-runtime";
import { StatusNotice } from "../molecules";

const MAX_CLONE_UPLOAD_BYTES = 3 * 1024 * 1024;

const SUPPORTED_CLONE_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
]);

export type PrivateVoice = {
  voice_id: string;
  name: string;
  status: string;
  preview_url: string;
  provider_verification_required?: boolean;
};

type Props = {
  configured: boolean;
  canManage: boolean;
  voices: PrivateVoice[];
  onChanged: () => Promise<void>;
};

function fileMimeType(file: File): string {
  const declared = file.type.split(";")[0]?.trim().toLowerCase();
  if (declared) return declared;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "m4a") return "audio/m4a";
  if (extension === "ogg") return "audio/ogg";
  if (extension === "webm") return "audio/webm";
  return "";
}

async function audioDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const audio = new Audio();
      const timer = window.setTimeout(
        () => reject(new Error("Audio could not be read.")),
        8_000,
      );
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        window.clearTimeout(timer);
        Number.isFinite(audio.duration)
          ? resolve(audio.duration)
          : reject(new Error("Audio duration could not be read."));
      };
      audio.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Audio could not be read."));
      };
      audio.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fileToBase64(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const comma = value.indexOf(",");
      comma >= 0
        ? resolve(value.slice(comma + 1))
        : reject(new Error("Audio could not be read."));
    };
    reader.onerror = () => reject(new Error("Audio could not be read."));
    reader.readAsDataURL(file);
  });
}

function statusLabel(status: string): string {
  if (status === "pending_review") return "Review required";
  if (status === "approved") return "Live";
  if (status === "deletion_pending") return "Deletion queued";
  if (status === "rejected") return "Not approved";
  return status.replace(/_/g, " ");
}

export default function VoiceCloningStudio({
  configured,
  canManage,
  voices,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [removeBackgroundNoise, setRemoveBackgroundNoise] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileSelectionRef = useRef(0);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  if (!canManage) return null;

  async function chooseFile(next: File | null) {
    const selection = ++fileSelectionRef.current;
    setFile(null);
    setDurationSeconds(null);
    setError(null);
    if (!next) return;
    const mimeType = fileMimeType(next);
    if (!SUPPORTED_CLONE_AUDIO_TYPES.has(mimeType)) {
      setError("Use MP3, WAV, M4A, OGG, or WebM audio.");
      return;
    }
    if (next.size > MAX_CLONE_UPLOAD_BYTES) {
      setError("Compress the sample below 3 MB.");
      return;
    }
    try {
      const duration = await audioDuration(next);
      if (selection !== fileSelectionRef.current) return;
      if (duration < 10 || duration > 90) {
        setError("Use a 10–90 second single-speaker sample.");
        return;
      }
      setFile(next);
      setDurationSeconds(duration);
    } catch (reason) {
      if (selection !== fileSelectionRef.current) return;
      setError(
        reason instanceof Error ? reason.message : "Audio could not be read.",
      );
    }
  }

  function resetDraft() {
    fileSelectionRef.current += 1;
    setName("");
    setFile(null);
    setDurationSeconds(null);
    setRemoveBackgroundNoise(false);
    setConsentAccepted(false);
    setOpen(false);
  }

  async function createVoice(event: FormEvent) {
    event.preventDefault();
    if (!file || durationSeconds === null || busy) return;
    setBusy("create");
    setError(null);
    setNotice(null);
    try {
      const response = await authFetch("/api/voices/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          audioBase64: await fileToBase64(file),
          audioMimeType: fileMimeType(file),
          sourceDurationSeconds: durationSeconds,
          removeBackgroundNoise,
          consentAccepted,
          consentVersion: ELEVENLABS_VOICE_CONSENT_VERSION,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(body?.error || "Voice could not be created.");
      resetDraft();
      setNotice("Voice created. Listen once, then approve it for live calls.");
      await onChanged().catch(() => {
        setError("Voice created. Refresh to load its review status.");
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Voice could not be created.",
      );
    } finally {
      setBusy(null);
    }
  }

  function preview(voice: PrivateVoice) {
    audioRef.current?.pause();
    if (playingId === voice.voice_id) {
      audioRef.current = null;
      setPlayingId(null);
      return;
    }
    setError(null);
    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    setPlayingId(voice.voice_id);
    audio.onended = () => {
      if (audioRef.current !== audio) return;
      audioRef.current = null;
      setPlayingId(null);
      setReviewedIds((current) => new Set(current).add(voice.voice_id));
    };
    audio.onerror = () => {
      if (audioRef.current !== audio) return;
      audioRef.current = null;
      setPlayingId(null);
      setError("Proof audio is unavailable. The voice remains private.");
    };
    void audio.play().catch(() => {
      if (audioRef.current !== audio) return;
      audioRef.current = null;
      setPlayingId(null);
      setError("Proof audio could not play.");
    });
  }

  async function approve(voice: PrivateVoice) {
    if (!reviewedIds.has(voice.voice_id) || busy) return;
    setBusy(voice.voice_id);
    setError(null);
    try {
      const response = await authFetch(
        `/api/voices/${encodeURIComponent(voice.voice_id)}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qualityConfirmed: true,
            qualityVersion: ELEVENLABS_VOICE_QUALITY_VERSION,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(body?.error || "Voice could not be approved.");
      setNotice(`${voice.name} is ready for live calls.`);
      await onChanged().catch(() => {
        setError("Voice approved. Refresh to update the library.");
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Voice could not be approved.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function revoke(voice: PrivateVoice) {
    if (
      busy ||
      !window.confirm(
        `Revoke “${voice.name}”? Assigned agents will use Savannah.`,
      )
    ) {
      return;
    }
    setBusy(voice.voice_id);
    setError(null);
    try {
      const response = await authFetch(
        `/api/voices/${encodeURIComponent(voice.voice_id)}`,
        {
          method: "DELETE",
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        status?: string;
      } | null;
      if (!response.ok)
        throw new Error(body?.error || "Voice could not be revoked.");
      setNotice(
        body?.status === "deletion_pending"
          ? "Live use stopped. Provider deletion is pending; retry revoke."
          : "Voice revoked and deleted.",
      );
      await onChanged().catch(() => {
        setError("Revocation was sent. Refresh to update its status.");
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Voice could not be revoked.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      {notice ? (
        <StatusNotice tone="success" title="Voice updated">
          {notice}
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice tone="destructive" title="Voice unavailable">
          {error}
        </StatusNotice>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!configured}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mic2 className="size-4" aria-hidden="true" />
          Create voice
        </button>
      ) : (
        <form
          onSubmit={createVoice}
          className="space-y-4 rounded-xl border border-border bg-muted/20 p-4"
        >
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Wireline does not store the upload. Live use requires review.
            </p>
          </div>

          <label className="block text-sm font-medium text-foreground">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={80}
              required
              placeholder="Founder voice"
              className="mt-1.5 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50"
            />
          </label>

          <label className="block text-sm font-medium text-foreground">
            Sample
            <input
              type="file"
              required
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a,audio/x-m4a,audio/ogg,audio/webm,.mp3,.wav,.m4a,.ogg,.webm"
              onChange={(event) =>
                void chooseFile(event.target.files?.[0] || null)
              }
              className="mt-1.5 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground"
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              10–90 seconds · under 3 MB
              {durationSeconds ? ` · ${Math.round(durationSeconds)}s` : ""}
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              checked={removeBackgroundNoise}
              onChange={(event) =>
                setRemoveBackgroundNoise(event.target.checked)
              }
              className="mt-1 size-4 accent-primary"
            />
            <span>
              Clean background noise
              <span className="block text-xs leading-5 text-muted-foreground">
                Use only for a noisy recording.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm leading-5 text-foreground">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(event) => setConsentAccepted(event.target.checked)}
              className="mt-1 size-4 accent-primary"
            />
            <span>
              I am the speaker or have documented permission.{" "}
              <Link to="/terms" className="underline underline-offset-2">
                Terms
              </Link>{" "}
              ·{" "}
              <Link to="/privacy" className="underline underline-offset-2">
                Privacy
              </Link>
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={
                busy === "create" ||
                !file ||
                durationSeconds === null ||
                !consentAccepted ||
                name.trim().length < 2
              }
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "create" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="size-4" aria-hidden="true" />
              )}
              Create
            </button>
            <button
              type="button"
              onClick={resetDraft}
              disabled={busy === "create"}
              className="min-h-10 rounded-lg px-4 text-sm font-semibold text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {voices.length ? (
        <div className="space-y-2" aria-label="Private voices">
          {voices.map((voice) => {
            const pending = voice.status === "pending_review";
            const reviewed = reviewedIds.has(voice.voice_id);
            const providerBlocked =
              voice.provider_verification_required === true;
            return (
              <div
                key={voice.voice_id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-3 py-3"
              >
                <button
                  type="button"
                  onClick={() => preview(voice)}
                  disabled={
                    Boolean(busy) || voice.status === "deletion_pending"
                  }
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-foreground disabled:opacity-50"
                  aria-label={`${playingId === voice.voice_id ? "Pause" : "Play"} ${voice.name} proof`}
                >
                  {playingId === voice.voice_id ? (
                    <Pause className="size-4" aria-hidden="true" />
                  ) : (
                    <Play className="ml-0.5 size-4" aria-hidden="true" />
                  )}
                </button>
                <div className="min-w-32 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {voice.name}
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {statusLabel(voice.status)}
                    {voice.provider_verification_required
                      ? " · provider check"
                      : ""}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {pending ? (
                    <button
                      type="button"
                      onClick={() => void approve(voice)}
                      disabled={!reviewed || providerBlocked || Boolean(busy)}
                      title={
                        providerBlocked
                          ? "Provider verification is required"
                          : reviewed
                            ? "Approve for live calls"
                            : "Play the full proof first"
                      }
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === voice.voice_id ? (
                        <Loader2
                          className="size-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Check className="size-3.5" aria-hidden="true" />
                      )}
                      Approve
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void revoke(voice)}
                    disabled={Boolean(busy)}
                    className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    aria-label={`Revoke ${voice.name}`}
                  >
                    {busy === voice.voice_id ? (
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Trash2 className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
