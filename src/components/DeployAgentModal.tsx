import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, ArrowRight, User2, Users2, Play, Pause } from "lucide-react";
import { cn } from "../lib/utils";
import { PREMIUM_VOICES, DEFAULT_VOICE_BY_GENDER } from "./FleetSettings";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";

/**
 * Inline voice preview button — fetches /api/voices/:id/preview
 * (which 302-redirects to the public ElevenLabs preview MP3) and
 * plays it. Self-contained: handles its own audio ref + play state.
 */
function VoicePreviewButton({ voiceId, voiceName }: { voiceId: string; voiceName: string }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // When the parent swaps voiceId, kill any in-flight playback so
    // we don't have two voices overlapping.
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(false);
  }, [voiceId]);

  async function toggle() {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    setLoading(true);
    try {
      const audio = new Audio(`/api/voices/${encodeURIComponent(voiceId)}/preview`);
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setPlaying(false);
        setLoading(false);
      };
      audioRef.current = audio;
      await audio.play();
      setPlaying(true);
      if (typeof window !== "undefined" && (window as any).plausible) {
        (window as any).plausible("DeployModalVoicePreviewClick", {
          props: { voice: voiceName },
        });
      }
    } catch {
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-brand hover:text-brand/80 transition-colors disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : playing ? (
        <Pause className="w-3 h-3" />
      ) : (
        <Play className="w-3 h-3" />
      )}
      {playing ? "Stop preview" : "Hear this voice"}
    </button>
  );
}

export type DeployTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  role: string;
  channel: "voice" | "email";
  firstMessage?: string;
  /** Recommended default voice gender for this template (overridable). */
  defaultGender?: "female" | "male";
};

type Gender = "female" | "male";

export interface DeployValues {
  name: string;
  voiceId: string;
  gender: Gender;
}

interface DeployAgentModalProps {
  open: boolean;
  template: DeployTemplate | null;
  onClose: () => void;
  onConfirm: (values: DeployValues) => Promise<void> | void;
  deploying?: boolean;
}

/**
 * Quick Deploy modal — opens when an operator clicks "Deploy Agent" on a
 * template card. Lets them set the two things they almost always want to
 * customize before the agent goes live:
 *
 *   1. Name      — pre-filled with the template name, editable to anything
 *                  ("Sarah", "Front Desk", "Closer #2", etc.)
 *   2. Voice     — male / female toggle, with a per-gender default voice
 *                  and an expand-to-pick-specific control. Email-channel
 *                  templates skip the voice picker entirely.
 *
 * Everything else (role personality, template overlay, business variable
 * substitution, capabilities) is handled server-side at /api/agents POST.
 * Operators can further refine in /agents → Personality / Capabilities.
 */
export default function DeployAgentModal({
  open,
  template,
  onClose,
  onConfirm,
  deploying = false,
}: DeployAgentModalProps) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_VOICE_BY_GENDER.female);
  const [showVoiceList, setShowVoiceList] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Pin the page underneath while the deploy modal is open.
  useBodyScrollLock(open);

  // Reset state whenever a new template is selected, autofocus the name field.
  useEffect(() => {
    if (!template) return;
    setName(template.name);
    const initialGender: Gender = template.defaultGender ?? "female";
    setGender(initialGender);
    setVoiceId(DEFAULT_VOICE_BY_GENDER[initialGender]);
    setShowVoiceList(false);
    // Defer focus until the modal animation is past the initial frame
    setTimeout(() => nameInputRef.current?.select(), 80);
  }, [template?.id]);

  // When gender flips, swap to the default voice for that gender so the
  // user doesn't have to also click into the voice picker.
  const handleGenderChange = (g: Gender) => {
    setGender(g);
    setVoiceId(DEFAULT_VOICE_BY_GENDER[g]);
    setShowVoiceList(false);
  };

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deploying) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, deploying, onClose]);

  if (!template) return null;

  const isEmail = template.channel === "email";
  const voicesForGender = PREMIUM_VOICES.filter(
    (v) => v.gender === gender || v.gender === "neutral",
  );
  const selectedVoice = PREMIUM_VOICES.find((v) => v.id === voiceId);
  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && trimmedName.length <= 80 && !deploying;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onConfirm({ name: trimmedName, voiceId, gender });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-md"
            onClick={() => !deploying && onClose()}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-label="Deploy agent"
            aria-modal="true"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            // Bottom-sheet on mobile (anchored to bottom edge,
            // full-width, rounded top), centered card on desktop.
            // Matches ConfirmModal + TrialGateModal patterns so
            // every dialog in the app feels like one family.
            className="fixed z-[81]
              left-0 right-0 bottom-0 w-full
              sm:left-1/2 sm:bottom-auto sm:top-[50%] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:right-auto sm:w-[min(540px,calc(100vw-32px))]"
          >
            <div className="relative rounded-t-3xl sm:rounded-3xl overflow-hidden glass-strong border border-white/12 shadow-2xl">
              {/* Aurora glow */}
              <div
                aria-hidden="true"
                className="absolute -top-16 -right-16 w-64 h-64 rounded-full max-w-[50vw] max-h-[50vw] sm:max-w-none sm:max-h-none blur-3xl opacity-30 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle, rgba(79, 30, 123 ,0.35), rgba(79, 30, 123 ,0.18) 60%, transparent)",
                }}
              />

              {/* Header */}
              <div className="relative z-10 flex items-start justify-between gap-4 px-7 pt-6 pb-3 border-b border-white/8">
                <div className="space-y-1.5 min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.42em] text-muted/70">
                    Deploy · {template.category}
                  </p>
                  <h2 className="font-display italic text-2xl text-ink leading-tight">
                    {template.name}
                  </h2>
                  <p className="text-[12px] text-ink/65 leading-relaxed">{template.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => !deploying && onClose()}
                  disabled={deploying}
                  aria-label="Close"
                  className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-ink/40 hover:text-ink hover:bg-white/5 transition-colors disabled:opacity-40"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="relative z-10 px-7 py-6 space-y-6">
                {/* Name */}
                <div className="space-y-2">
                  <label
                    htmlFor="agent-name"
                    className="text-[10px] uppercase tracking-[0.36em] text-muted/80"
                  >
                    Agent name
                  </label>
                  <input
                    id="agent-name"
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSubmit) handleSubmit();
                    }}
                    maxLength={80}
                    placeholder="e.g. Sarah, Front Desk, Closer #2"
                    className="w-full bg-black/5 border border-black/10 rounded-xl px-4 py-3 text-[15px] text-ink placeholder:text-muted/50 outline-none focus:border-brand/50 focus:bg-white/40 transition-colors"
                  />
                  <p className="text-[10px] text-muted/65">
                    What callers and your team will see. You can change this any time in /agents.
                  </p>
                </div>

                {/* Voice (voice channel only) */}
                {!isEmail ? (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <label className="text-[10px] uppercase tracking-[0.36em] text-muted/80">
                        Voice
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowVoiceList((v) => !v)}
                        className="text-[10px] uppercase tracking-[0.32em] text-muted/65 hover:text-brand transition-colors"
                      >
                        {showVoiceList ? "Hide options" : "Pick a specific voice"}
                      </button>
                    </div>

                    {/* Female / Male toggle */}
                    <div className="grid grid-cols-2 gap-2">
                      <GenderTile
                        active={gender === "female"}
                        label="Female"
                        sublabel={
                          PREMIUM_VOICES.find(
                            (v) => v.id === DEFAULT_VOICE_BY_GENDER.female,
                          )?.name.split(" (")[0] || "Female default"
                        }
                        icon={User2}
                        onClick={() => handleGenderChange("female")}
                      />
                      <GenderTile
                        active={gender === "male"}
                        label="Male"
                        sublabel={
                          PREMIUM_VOICES.find(
                            (v) => v.id === DEFAULT_VOICE_BY_GENDER.male,
                          )?.name.split(" (")[0] || "Male default"
                        }
                        icon={Users2}
                        onClick={() => handleGenderChange("male")}
                      />
                    </div>

                    {/* Specific voice picker */}
                    <AnimatePresence>
                      {showVoiceList && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-1.5 overflow-hidden"
                        >
                          <p className="text-[10px] uppercase tracking-[0.32em] text-muted/65 pt-1">
                            Specific {gender} voice
                          </p>
                          {voicesForGender.map((v) => {
                            const isSelected = v.id === voiceId;
                            return (
                              <button
                                type="button"
                                key={v.id}
                                onClick={() => setVoiceId(v.id)}
                                className={cn(
                                  "w-full text-left rounded-xl px-3 py-2.5 text-[12px] flex items-center justify-between gap-3 transition-colors border",
                                  isSelected
                                    ? "bg-brand/12 border-brand/35 text-ink"
                                    : "bg-black/5 border-black/8 text-ink/75 hover:bg-black/8 hover:text-ink",
                                )}
                              >
                                <span className="truncate">{v.name}</span>
                                <span className="text-[9px] uppercase tracking-[0.32em] text-muted/55 shrink-0">
                                  {v.provider}
                                </span>
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {selectedVoice && !showVoiceList && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-muted/65">
                          Picked: <span className="text-ink/75">{selectedVoice.name}</span>
                        </p>
                        {/* Real per-voice audio preview via the
                            ElevenLabs-backed /api/voices/:id/preview
                            route. Plays a public preview MP3 directly
                            in the browser. Falls back gracefully if the
                            voice has no preview (the audio's onerror
                            handler logs + the button stays clickable). */}
                        <VoicePreviewButton
                          voiceId={selectedVoice.id}
                          voiceName={selectedVoice.name}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-[12px] text-ink/65">
                    Email agent — no voice picker. The agent's writing tone is configured in{" "}
                    <span className="text-ink/80">/agents → Personality</span> after deploy.
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="relative z-10 px-7 pb-6 pt-2 flex items-center justify-between gap-3 border-t border-white/8">
                <button
                  type="button"
                  onClick={() => !deploying && onClose()}
                  disabled={deploying}
                  className="text-[11px] uppercase tracking-[0.32em] text-muted/65 hover:text-ink transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={cn(
                    "group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] uppercase tracking-[0.32em] font-semibold transition-all",
                    canSubmit
                      ? "text-paper shadow-lg shadow-brand/30 hover:shadow-brand/40 active:scale-[0.98]"
                      : "text-muted/40 bg-black/8 cursor-not-allowed",
                  )}
                  style={canSubmit ? { background: "#4F1E7B" } : undefined}
                >
                  {deploying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Deploying…
                    </>
                  ) : (
                    <>
                      Deploy {trimmedName || "Agent"}
                      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function GenderTile({
  active,
  label,
  sublabel,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-xl border px-3 py-3 text-left transition-all overflow-hidden",
        active
          ? "border-brand/40 bg-brand/8 text-ink"
          : "border-black/10 bg-black/4 text-ink/70 hover:bg-black/8 hover:text-ink",
      )}
    >
      {active && (
        <motion.div
          layoutId="gender-active"
          aria-hidden="true"
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            background: "linear-gradient(135deg, rgba(79, 30, 123 ,0.16), rgba(79, 30, 123 ,0.10))",
          }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <div className="relative z-10 flex items-center gap-2.5">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
            active ? "border-brand/40 bg-brand/15" : "border-black/8 bg-white/40",
          )}
        >
          <Icon className="w-4 h-4" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold tracking-wide">{label}</p>
          <p className="text-[10px] text-muted/65 truncate">{sublabel}</p>
        </div>
      </div>
    </button>
  );
}
