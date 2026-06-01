/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
/**
 * Voice Library — operator-side clone management surface.
 *
 * Lives under Admin → Voices. Lets operators:
 *   1. Browse their cloned voices (with playable previews)
 *   2. Clone a new voice from a 30-90s audio sample
 *   3. Delete clones they no longer need
 *
 * Clones flow through /api/voices/clone (ElevenLabs Instant Voice
 * Clone). Pricing surface clearly disclosed before the upload button
 * fires so operators know the unit cost.
 */
import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Mic, Loader2, Trash2, Play, Pause, UploadCloud, AlertTriangle } from "lucide-react";
import { authFetch } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { cn } from "../../lib/utils";
import { Checkbox } from "../ui/shadcn/Checkbox";
import { Input } from "../ui/shadcn/Input";

interface ClonedVoice {
  voice_id: string;
  name: string;
  preview_url: string | null;
  owned_by_user: boolean;
  category?: string;
}

export default function VoiceLibraryPanel() {
  const { error: toastError, success: toastSuccess } = useToast();
  const [voices, setVoices] = useState<ClonedVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean>(true);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Clone form state
  const [showCloneForm, setShowCloneForm] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [cloning, setCloning] = useState(false);

  async function loadVoices() {
    setLoading(true);
    try {
      const r = await authFetch("/api/voices");
      if (!r.ok) throw new Error("Failed to load voices");
      const data = await r.json();
      setVoices(data.voices || []);
      setConfigured(!!data.configured);
    } catch {
      toastError("Couldn't load voice library");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVoices();
    return () => {
      if (audioRef.current) audioRef.current.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time fetch on mount
  }, []);

  function playPreview(voice: ClonedVoice) {
    if (!voice.preview_url) {
      toastError("No preview available", "This voice doesn't have a sample yet.");
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    if (playingVoiceId === voice.voice_id) {
      setPlayingVoiceId(null);
      return;
    }
    const audio = new Audio(voice.preview_url);
    audio.onended = () => setPlayingVoiceId(null);
    audio.onerror = () => {
      setPlayingVoiceId(null);
      toastError("Preview failed", "Couldn't play the audio sample.");
    };
    audioRef.current = audio;
    setPlayingVoiceId(voice.voice_id);
    audio.play().catch(() => {
      setPlayingVoiceId(null);
      toastError("Preview failed");
    });
  }

  async function startClone(e: React.FormEvent) {
    e.preventDefault();
    if (!cloneFile) {
      toastError("Audio file required");
      return;
    }
    if (cloneFile.size > 25 * 1024 * 1024) {
      toastError("File too large", "Keep samples under 25MB");
      return;
    }
    if (!consent) {
      toastError("Consent required", "Confirm you have permission to clone this voice");
      return;
    }

    setCloning(true);
    try {
      const buf = await cloneFile.arrayBuffer();
      const base64 = btoa(new Uint8Array(buf).reduce((acc, b) => acc + String.fromCharCode(b), ""));
      const r = await authFetch("/api/voices/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cloneName.trim(),
          audioBase64: base64,
          audioMimeType: cloneFile.type,
          consent_given: consent,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Clone failed");

      toastSuccess(`Cloned ${cloneName}`, "Available now in your voice picker");
      setShowCloneForm(false);
      setCloneName("");
      setCloneFile(null);
      setConsent(false);
      await loadVoices();
    } catch (e: any) {
      toastError("Clone failed", e?.message || "Try again");
    } finally {
      setCloning(false);
    }
  }

  async function deleteClone(voice: ClonedVoice) {
    if (!confirm(`Delete "${voice.name}"? Agents using this voice will fall back to a default.`)) {
      return;
    }
    try {
      const r = await authFetch(`/api/voices/${encodeURIComponent(voice.voice_id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Delete failed");
      toastSuccess("Voice deleted");
      await loadVoices();
    } catch (e: any) {
      toastError("Delete failed", e?.message || "Try again");
    }
  }

  const ownedVoices = voices.filter((v) => v.owned_by_user);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="font-display italic text-2xl text-ink mb-1">Voice library</h2>
        <p className="text-[12px] text-muted leading-relaxed">
          Clone your own voice — or anyone whose voice you have permission to use — and assign it to
          any agent. Cloned voices appear in the voice picker on the agent deploy screen.
        </p>
      </div>

      {!configured && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/8 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-700 leading-relaxed">
            Voice cloning isn't configured yet. The owner needs to set ELEVENLABS_API_KEY in
            environment variables. Once set, you can clone voices here.
          </p>
        </div>
      )}

      {/* Clone CTA / form */}
      {!showCloneForm ? (
        <button
          onClick={() => setShowCloneForm(true)}
          disabled={!configured}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand/30 bg-brand/5 hover:bg-brand/8 hover:border-brand/50 py-6 transition-colors disabled:opacity-40"
        >
          <Mic className="w-5 h-5 text-brand" />
          <span className="text-[13px] text-brand font-medium">Clone a new voice</span>
        </button>
      ) : (
        <form
          onSubmit={startClone}
          className="rounded-2xl border border-black/10 bg-paper p-5 space-y-4"
        >
          <div>
            <h3 className="font-display italic text-lg text-ink">Clone a voice</h3>
            <p className="text-[11px] text-muted leading-relaxed mt-1">
              Upload a clear 30-90 second audio sample. Single speaker, no background noise. MP3,
              WAV, M4A, or OGG. Under 25MB.
            </p>
          </div>

          <div>
            <label
              htmlFor="clone-name"
              className="block text-[10px] uppercase tracking-[0.28em] text-muted mb-1.5"
            >
              Voice name
            </label>
            <Input
              id="clone-name"
              type="text"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              required
              minLength={2}
              maxLength={80}
              placeholder="e.g. Mike L. — Founder voice"
              className="w-full rounded-lg border border-black/10 bg-paper px-3 py-2.5 text-[13px] text-ink outline-none focus:border-brand/40"
            />
          </div>

          <div>
            <label
              htmlFor="clone-file"
              className="block text-[10px] uppercase tracking-[0.28em] text-muted mb-1.5"
            >
              Audio sample (30-90s)
            </label>
            <Input
              id="clone-file"
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a,audio/ogg,.mp3,.wav,.m4a,.ogg"
              onChange={(e) => setCloneFile(e.target.files?.[0] || null)}
              required
              className="w-full text-[12px] text-ink file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-brand/10 file:text-brand file:text-[11px] file:cursor-pointer"
            />
            {cloneFile && (
              <p className="text-[10px] text-muted mt-1">
                {cloneFile.name} · {(cloneFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          <label className="flex items-start gap-2.5 text-[11px] text-ink/80 cursor-pointer">
            <Checkbox
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 w-3.5 h-3.5 accent-brand"
            />
            <span>
              I confirm I have permission to clone this voice. If it belongs to another person, I
              have their explicit consent.
            </span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={cloning || !consent || !cloneFile || cloneName.trim().length < 2}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-deep text-on-brand px-4 py-2.5 text-[11px] uppercase tracking-[0.28em] hover:opacity-90 disabled:opacity-30 transition-opacity"
            >
              {cloning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UploadCloud className="w-3.5 h-3.5" />
              )}
              {cloning ? "Cloning…" : "Clone voice"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCloneForm(false);
                setCloneName("");
                setCloneFile(null);
                setConsent(false);
              }}
              disabled={cloning}
              className="disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 rounded-full text-[11px] uppercase tracking-[0.28em] text-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Owned voice list */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
          Your cloned voices · {ownedVoices.length}
        </p>
        {loading ? (
          <div className="rounded-xl border border-black/8 p-4 flex items-center gap-2 text-muted text-[12px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : ownedVoices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 p-6 text-center text-[12px] text-muted">
            No cloned voices yet. Clone your first one above.
          </div>
        ) : (
          ownedVoices.map((v) => (
            <motion.div
              key={v.voice_id}
              layout
              className="rounded-xl border border-black/10 bg-paper p-3 flex items-center gap-3"
            >
              <button
                onClick={() => playPreview(v)}
                disabled={!v.preview_url}
                className={cn(
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all",
                  v.preview_url
                    ? "bg-brand/10 text-brand hover:bg-brand/20"
                    : "bg-black/5 text-muted/70 cursor-not-allowed",
                )}
                aria-label={`Play preview of ${v.name}`}
              >
                {playingVoiceId === v.voice_id ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink truncate">{v.name}</p>
                <p className="text-[9px] uppercase tracking-[0.22em] text-muted/70">Cloned voice</p>
              </div>
              <button
                onClick={() => deleteClone(v)}
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-rose-600 hover:bg-rose-500/8 transition-colors"
                aria-label={`Delete ${v.name}`}
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))
        )}
      </div>

      <p className="text-[10px] text-muted/70 text-center mt-4 leading-relaxed">
        Cloned voices flow through Wireline's voice engine and work on every agent + every call.
        Delete them anytime — agents using a deleted voice fall back to a default.
      </p>
    </div>
  );
}
