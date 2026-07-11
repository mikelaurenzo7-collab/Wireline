import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Mic,
  Pause,
  Play,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { authFetch } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { cn } from "../../lib/utils";
import { Checkbox } from "../ui/shadcn/Checkbox";
import { Input } from "../ui/shadcn/Input";
import { ShadButton } from "../ui/shadcn/ShadButton";

const VOICE_CLONE_CONSENT_VERSION = "voice-clone-consent-v2-2026-07-11";
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

type ClonedVoice = {
  voice_id: string;
  name: string;
  preview_url: string | null;
  owned_by_user: boolean;
};

function bufferToBase64(buffer: ArrayBuffer) {
  return btoa(Array.from(new Uint8Array(buffer), (byte) => String.fromCharCode(byte)).join(""));
}

export default function VoiceLibraryPanel() {
  const { error: toastError, success: toastSuccess } = useToast();
  const [voices, setVoices] = useState<ClonedVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [showCloneForm, setShowCloneForm] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [cloning, setCloning] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadVoices = async () => {
    setLoading(true);
    try {
      const response = await authFetch("/api/voices");
      const body = (await response.json().catch(() => null)) as {
        voices?: ClonedVoice[];
        configured?: boolean;
      } | null;
      if (!response.ok) throw new Error("Voice library is unavailable.");
      setVoices(body?.voices || []);
      setConfigured(Boolean(body?.configured));
    } catch {
      toastError("Couldn't load Wireline voices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVoices();
    return () => audioRef.current?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once while the panel is mounted
  }, []);

  const playPreview = (voice: ClonedVoice) => {
    if (!voice.preview_url) {
      toastError("No preview available", "This voice does not have a preview yet.");
      return;
    }
    audioRef.current?.pause();
    if (playingVoiceId === voice.voice_id) {
      setPlayingVoiceId(null);
      return;
    }
    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    audio.onended = () => setPlayingVoiceId(null);
    audio.onerror = () => {
      setPlayingVoiceId(null);
      toastError("Preview failed", "Couldn't play the audio sample.");
    };
    setPlayingVoiceId(voice.voice_id);
    audio.play().catch(() => setPlayingVoiceId(null));
  };

  const resetClone = () => {
    setShowCloneForm(false);
    setCloneName("");
    setCloneFile(null);
    setConsent(false);
  };

  const startClone = async (event: FormEvent) => {
    event.preventDefault();
    if (!cloneFile) return toastError("Audio sample required");
    if (cloneFile.size > 25 * 1024 * 1024)
      return toastError("File too large", "Keep samples under 25 MB.");
    const normalizedType = cloneFile.type.split(";")[0]?.trim().toLowerCase();
    if (!normalizedType || !SUPPORTED_CLONE_AUDIO_TYPES.has(normalizedType))
      return toastError("Unsupported audio", "Use MP3, WAV, M4A, OGG, or WebM.");
    if (!consent)
      return toastError(
        "Authorization required",
        "Confirm you are the speaker or have documented authorization.",
      );
    setCloning(true);
    try {
      const response = await authFetch("/api/voices/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cloneName.trim(),
          audioBase64: bufferToBase64(await cloneFile.arrayBuffer()),
          audioMimeType: normalizedType,
          consent_given: true,
          consent_statement_version: VOICE_CLONE_CONSENT_VERSION,
          voice_use_scope: "wireline-agents",
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Clone failed.");
      toastSuccess("Verified voice ready", "You can now assign it to your agents.");
      resetClone();
      await loadVoices();
    } catch (error) {
      toastError("Voice creation failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setCloning(false);
    }
  };

  const deleteClone = async (voice: ClonedVoice) => {
    if (!confirm(`Delete "${voice.name}"? Agents using it will return to an automatic voice.`))
      return;
    try {
      const response = await authFetch(`/api/voices/${encodeURIComponent(voice.voice_id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Delete failed.");
      toastSuccess("Voice deleted", "Its Wireline authorization has been revoked.");
      await loadVoices();
    } catch (error) {
      toastError("Could not delete voice", error instanceof Error ? error.message : "Try again.");
    }
  };

  const ownedVoices = voices.filter((voice) => voice.owned_by_user);

  return (
    <div className="h-full max-w-3xl space-y-4 overflow-y-auto p-4">
      <header>
        <p className="wl-label text-brand">Wireline voice</p>
        <h2 className="mt-1 font-display text-2xl font-semibold text-foreground">Voice library</h2>
        <p className="mt-1 text-[var(--wireline-typography-caption-size)] leading-relaxed text-muted">
          Create a recognizable, permissioned sound for your agents. Wireline records authorization
          evidence and keeps private voices out of the public catalog.
        </p>
      </header>

      {!configured ? (
        <div className="flex items-start gap-2.5 rounded-md border border-brand/30 bg-brand/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p className="text-[var(--wireline-typography-caption-size)] leading-relaxed text-brand/80">
            Wireline voice creation is not configured for this workspace yet. Ask the workspace
            owner to finish voice setup, then return here to create voices.
          </p>
        </div>
      ) : null}

      {!showCloneForm ? (
        <ShadButton
          type="button"
          variant="outline"
          disableAnimations
          onClick={() => setShowCloneForm(true)}
          disabled={!configured}
          className="flex h-auto w-full flex-col gap-2 rounded-md border-2 border-dashed border-brand/30 bg-brand/5 py-6 hover:border-brand/50 hover:bg-brand/8 disabled:opacity-40"
        >
          <Mic className="h-5 w-5 text-brand" />
          <span className="text-[var(--wireline-typography-caption-size)] font-medium text-brand">
            Create a verified Wireline voice
          </span>
        </ShadButton>
      ) : (
        <form
          onSubmit={startClone}
          className="space-y-4 rounded-md border border-border bg-card p-5"
        >
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">Create a voice</h3>
            <p className="mt-1 text-[var(--wireline-typography-overline-size)] leading-relaxed text-muted">
              Upload a clean 30–90 second, single-speaker sample. MP3, WAV, M4A, OGG, or WebM under
              25 MB.
            </p>
          </div>
          <div className="flex items-start gap-2.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-[var(--wireline-typography-overline-size)] leading-relaxed text-foreground/75">
              <span className="font-medium text-foreground">Verified voice policy.</span> Wireline
              stores a consent record and a one-way fingerprint of this sample. The source audio is
              not stored in Wireline's database.
            </p>
          </div>
          <label className="block">
            <span className="wl-label text-muted">Voice name</span>
            <Input
              value={cloneName}
              onChange={(event) => setCloneName(event.target.value)}
              minLength={2}
              maxLength={80}
              required
              placeholder="e.g. Founder voice"
              className="mt-1.5 w-full rounded-md border border-white/10 bg-card px-3 py-2.5 text-[var(--wireline-typography-caption-size)]"
            />
          </label>
          <label className="block">
            <span className="wl-label text-muted">Audio sample</span>
            <Input
              type="file"
              required
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a,audio/x-m4a,audio/ogg,audio/webm,.mp3,.wav,.m4a,.ogg,.webm"
              onChange={(event) => setCloneFile(event.target.files?.[0] || null)}
              className="mt-1.5 w-full text-[var(--wireline-typography-caption-size)]"
            />
            {cloneFile ? (
              <p className="mt-1 wl-micro-meta--muted">
                {cloneFile.name} · {(cloneFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            ) : null}
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-[var(--wireline-typography-overline-size)] text-foreground/80">
            <Checkbox
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-brand"
            />
            <span>
              I am the speaker, or I have the speaker's documented authorization to create and use
              this synthetic voice in Wireline agents. I understand this attestation is recorded and
              can be revoked by deleting the voice.
            </span>
          </label>
          <div className="flex gap-2">
            <ShadButton
              type="submit"
              variant="editorial"
              disableAnimations
              disabled={cloning || !cloneFile || !consent || cloneName.trim().length < 2}
              className="flex-1 rounded-full py-2.5 text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em]"
            >
              {cloning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UploadCloud className="h-3.5 w-3.5" />
              )}
              {cloning ? "Creating…" : "Create verified voice"}
            </ShadButton>
            <ShadButton
              type="button"
              variant="ghost"
              disableAnimations
              disabled={cloning}
              onClick={resetClone}
              className="rounded-full text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] text-muted"
            >
              Cancel
            </ShadButton>
          </div>
        </form>
      )}

      <section className="space-y-2">
        <p className="wl-label-muted">Your private voices · {ownedVoices.length}</p>
        {loading ? (
          <div className="flex items-center gap-2 rounded-md border border-white/8 p-4 text-[var(--wireline-typography-caption-size)] text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : null}
        {!loading && !ownedVoices.length ? (
          <div className="rounded-md border border-dashed border-white/15 p-6 text-center text-[var(--wireline-typography-caption-size)] text-muted">
            No private voices created yet.
          </div>
        ) : null}
        {!loading
          ? ownedVoices.map((voice) => (
              <div
                key={voice.voice_id}
                className="flex items-center gap-3 rounded-md border border-white/10 bg-card p-3"
              >
                <ShadButton
                  type="button"
                  variant="outline"
                  size="icon"
                  disableAnimations
                  onClick={() => playPreview(voice)}
                  disabled={!voice.preview_url}
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-full",
                    voice.preview_url
                      ? "border-brand/20 bg-brand/10 text-brand hover:bg-brand/20"
                      : "bg-black/5 text-muted/70",
                  )}
                  aria-label={`Play preview of ${voice.name}`}
                >
                  {playingVoiceId === voice.voice_id ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="ml-0.5 h-4 w-4" />
                  )}
                </ShadButton>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[var(--wireline-typography-caption-size)] font-medium text-foreground">
                    {voice.name}
                  </p>
                  <p className="wl-label-muted/70">Private Wireline voice</p>
                </div>
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  disableAnimations
                  onClick={() => void deleteClone(voice)}
                  className="h-8 w-8 shrink-0 rounded-md text-muted hover:bg-rose-500/8 hover:text-rose-600"
                  aria-label={`Delete ${voice.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </ShadButton>
              </div>
            ))
          : null}
      </section>
    </div>
  );
}
