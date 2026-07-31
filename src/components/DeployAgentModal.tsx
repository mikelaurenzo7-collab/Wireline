import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, ArrowRight, User2, Users2 } from "lucide-react";
import { cn } from "../lib/utils";
import { MANAGED_VOICE_BY_GENDER, VAPI_CURATED_VOICES, providerLabel } from "../lib/voice-catalog";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { useModalFocusTrap } from "../lib/use-modal-focus-trap";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

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
 * Quick Deploy modal — opens when an Account Holder clicks "Deploy Agent" on a
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
 * Account Holders can further refine in Studio → Set up after deploy.
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
  const [voiceId, setVoiceId] = useState<string>(MANAGED_VOICE_BY_GENDER.female);
  const [showVoiceList, setShowVoiceList] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Pin the page underneath and contain keyboard focus while the modal is open.
  useBodyScrollLock(open && template !== null);
  useModalFocusTrap(dialogRef, {
    active: open && template !== null,
    onEscape: () => {
      if (!deploying) onClose();
    },
  });

  // Reset state whenever a new template is selected, autofocus the name field.
  useEffect(() => {
    if (!template) return;
    setName(template.name);
    const initialGender: Gender = template.defaultGender ?? "female";
    setGender(initialGender);
    setVoiceId(MANAGED_VOICE_BY_GENDER[initialGender]);
    setShowVoiceList(false);
    // Defer focus until the modal animation is past the initial frame. Clear it
    // if the template changes or the dialog closes so focus cannot jump back
    // into an exiting modal after the shared trap restores the trigger.
    const focusTimer = window.setTimeout(() => nameInputRef.current?.select(), 80);
    return () => window.clearTimeout(focusTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-keyed on template id
  }, [template?.id]);

  // When gender flips, swap to the default voice for that gender so the
  // user doesn't have to also click into the voice picker.
  const handleGenderChange = (g: Gender) => {
    setGender(g);
    setVoiceId(MANAGED_VOICE_BY_GENDER[g]);
    setShowVoiceList(false);
  };

  if (!template) return null;

  const isEmail = template.channel === "email";

  // Curated managed voices only — every deploy lands on the phone runtime
  // Wireline actually operates, so the picked voice is the live voice.
  const allVoices = VAPI_CURATED_VOICES;
  const voicesForGender = allVoices.filter((v) => v.gender === gender);
  const selectedVoice = allVoices.find((v) => v.id === voiceId);
  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && trimmedName.length <= 80 && !deploying;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onConfirm({ name: trimmedName, voiceId, gender });
  };

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4 pb-[env(safe-area-inset-bottom,0)]"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => !deploying && onClose()}
            aria-hidden="true"
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="deploy-agent-title"
            aria-describedby="deploy-agent-description"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            // Bottom-sheet on mobile (anchored to bottom edge, full-width,
            // rounded top), centered card on desktop. The panel caps at the
            // viewport height and scrolls internally so tall content (voice
            // picker expanded, etc.) never overflows off-screen. Rendered via a
            // portal to document.body so `position: fixed` resolves against the
            // viewport — not the route's transformed PageTransition box.
            className="relative z-10 w-full sm:w-[min(540px,calc(100vw-32px))] max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain rounded-t-md sm:rounded-md"
          >
            <div className="relative rounded-t-md sm:rounded-md overflow-hidden wl-panel-elevated border border-border shadow-2xl">
              <div className="relative z-10 flex items-start justify-between gap-4 px-7 pt-6 pb-3 border-b border-border">
                <div className="space-y-1.5 min-w-0">
                  <p className="wl-micro-meta">Deploy · {template.category}</p>
                  <h2
                    id="deploy-agent-title"
                    className="font-display italic text-2xl text-foreground leading-tight"
                  >
                    {template.name}
                  </h2>
                  <p
                    id="deploy-agent-description"
                    className="text-[length:var(--wireline-typography-caption-size)] text-foreground/65 leading-relaxed"
                  >
                    {template.description}
                  </p>
                </div>
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  disableAnimations
                  onClick={() => !deploying && onClose()}
                  disabled={deploying}
                  aria-label="Close"
                  className="shrink-0 min-h-9 w-9 rounded-md"
                >
                  <X className="w-4 h-4" />
                </ShadButton>
              </div>

              {/* Body */}
              <div className="relative z-10 px-7 py-6 space-y-6">
                {/* Name */}
                <div className="space-y-2">
                  <label htmlFor="agent-name" className="wl-label-muted opacity-80">
                    Agent name
                  </label>
                  <Input
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
                    className="w-full bg-muted/20 border border-border rounded-md px-4 py-3 text-[length:var(--wireline-typography-body-size)] text-foreground placeholder:text-foreground/55 outline-none focus:border-brand/50 focus:bg-white/40 transition-colors"
                  />
                  <p className="wl-micro-meta">
                    What callers and your team will see. You can change this any time in Studio.
                  </p>
                </div>

                {/* Voice (voice channel only) */}
                {!isEmail ? (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <label className="wl-label-muted opacity-80">Voice</label>
                      <ShadButton
                        type="button"
                        variant="link"
                        disableAnimations
                        onClick={() => setShowVoiceList((v) => !v)}
                        className="h-auto p-0 wl-label-muted hover:text-brand"
                      >
                        {showVoiceList ? "Hide options" : "Pick a specific voice"}
                      </ShadButton>
                    </div>

                    {/* Female / Male toggle */}
                    <div className="grid grid-cols-2 gap-2">
                      <GenderTile
                        active={gender === "female"}
                        label="Female"
                        sublabel={
                          allVoices
                            .find((v) => v.id === MANAGED_VOICE_BY_GENDER.female)
                            ?.name.split(" —")[0] || "Female default"
                        }
                        icon={User2}
                        onClick={() => handleGenderChange("female")}
                      />
                      <GenderTile
                        active={gender === "male"}
                        label="Male"
                        sublabel={
                          allVoices
                            .find((v) => v.id === MANAGED_VOICE_BY_GENDER.male)
                            ?.name.split(" —")[0] || "Male default"
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
                          <p className="wl-micro-meta pt-1">Specific {gender} voice</p>
                          {voicesForGender.map((v) => {
                            const isSelected = v.id === voiceId;
                            return (
                              <ShadButton
                                type="button"
                                key={v.id}
                                variant="ghost"
                                disableAnimations
                                onClick={() => setVoiceId(v.id)}
                                className={cn(
                                  "w-full h-auto justify-between rounded-md px-3 py-2.5 text-[length:var(--wireline-typography-caption-size)] border",
                                  isSelected
                                    ? "bg-brand/12 border-brand/35 text-foreground"
                                    : "bg-muted/20 border border-border text-foreground/75 hover:bg-muted/30 hover:text-foreground",
                                )}
                              >
                                <span className="truncate">{v.name}</span>
                                <span className="wl-micro-meta shrink-0">
                                  {providerLabel(v.provider)}
                                </span>
                              </ShadButton>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {selectedVoice && !showVoiceList && (
                      <div className="space-y-1.5">
                        <p className="wl-micro-meta">
                          Picked: <span className="text-foreground/75">{selectedVoice.name}</span>
                        </p>
                        <p className="wl-micro-meta">
                          Included with your line. Hear it on a Studio test right after deploy.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-border bg-muted/20 px-4 py-3 text-[length:var(--wireline-typography-caption-size)] text-foreground/65">
                    Email agent - no voice picker. The agent's writing tone is configured in{" "}
                    <span className="text-foreground/80">Studio</span> after deploy.
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="relative z-10 px-7 pb-6 pt-2 flex items-center justify-between gap-3 border-t border-border">
                <ShadButton
                  type="button"
                  variant="ghost"
                  disableAnimations
                  onClick={() => !deploying && onClose()}
                  disabled={deploying}
                  className="text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.32em]"
                >
                  Cancel
                </ShadButton>
                <ShadButton
                  type="button"
                  variant="editorial"
                  disableAnimations
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="rounded-md text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.32em] disabled:opacity-50"
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
                </ShadButton>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
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
    <ShadButton
      type="button"
      variant="ghost"
      disableAnimations
      onClick={onClick}
      className={cn(
        "relative h-auto rounded-md border px-3 py-3 text-left overflow-hidden justify-start",
        active
          ? "border-brand/40 bg-brand/8 text-foreground"
          : "border-border bg-muted/20 text-foreground/70 hover:bg-muted/30 hover:text-foreground",
      )}
    >
      {active && (
        <motion.div
          layoutId="gender-active"
          aria-hidden="true"
          className="absolute inset-0 rounded-md pointer-events-none wl-deploy-gender-active"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <div className="relative z-10 flex items-center gap-2.5">
        <div
          className={cn(
            "w-8 h-8 rounded-md flex items-center justify-center shrink-0 border",
            active ? "border-brand/40 bg-brand/15" : "border-border bg-white/40",
          )}
        >
          <Icon className="w-4 h-4" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <p className="text-[length:var(--wireline-typography-caption-size)] font-semibold tracking-wide">
            {label}
          </p>
          <p className="wl-micro-meta truncate">{sublabel}</p>
        </div>
      </div>
    </ShadButton>
  );
}
