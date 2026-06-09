/**
 * Auto-opens after signup (or when a signed-in user has zero agents).
 * Welcome → FastStartWizard → activation pending → celebrate on first useful call.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Compass, Sparkles, X } from "lucide-react";
import FastStartWizard, { type FastStartResult } from "./FastStartWizard";
import YoureLiveModal from "./YoureLiveModal";
import WirelineMark from "./WirelineMark";
import { ShadButton } from "./ui/shadcn/ShadButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/shadcn/Dialog";
import { getStoredSignupIntent } from "../lib/signup-intent";
import {
  beginOnboardingTimer,
  clearFreshSignupSession,
  evaluatePostSignupEligibility,
  fetchActivationStatusFull,
  isActivationCelebrated,
  markActivationCelebrated,
  markOnboardingCelebrated,
  markOnboardingCompleted,
  markPostSignupDismissed,
  markTourCompleted,
  setPostSignupFlowActive,
} from "../lib/post-signup-onboarding";
import { ONBOARDING_WELCOME, onboardingWelcomeSubtitle } from "../lib/wireline-onboarding-copy";
import { cn } from "../lib/utils";

type Phase = "idle" | "welcome" | "wizard" | "activate_pending" | "celebrate_activation";

export default function PostSignupOnboarding() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("idle");
  const [completion, setCompletion] = useState<FastStartResult | null>(null);
  const [signupWedge, setSignupWedge] = useState<string | null>(null);
  const [activationSeconds, setActivationSeconds] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const eligibility = await evaluatePostSignupEligibility();
      if (cancelled) return;

      if (eligibility.activated && !isActivationCelebrated()) {
        const status = await fetchActivationStatusFull();
        if (cancelled) return;
        setActivationSeconds(status?.timeToActivationSeconds ?? null);
        setPhase("celebrate_activation");
        setPostSignupFlowActive(true);
        return;
      }

      if (!eligibility.shouldShow) {
        setPostSignupFlowActive(false);
        return;
      }

      const intent = getStoredSignupIntent();
      setSignupWedge(intent?.signupWedge ?? null);

      beginOnboardingTimer();
      setPostSignupFlowActive(true);
      setPhase("welcome");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "activate_pending") return;

    let cancelled = false;
    const poll = async () => {
      const status = await fetchActivationStatusFull();
      if (cancelled || !status?.activated) return;
      setActivationSeconds(status.timeToActivationSeconds);
      await markOnboardingCompleted();
      markOnboardingCelebrated();
      markActivationCelebrated();
      setPhase("celebrate_activation");
    };

    void poll();
    const interval = setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase]);

  const finishFlow = useCallback(() => {
    setPostSignupFlowActive(false);
    clearFreshSignupSession();
    setPhase("idle");
  }, []);

  const handleExploreFirst = useCallback(() => {
    markPostSignupDismissed();
    void markTourCompleted();
    finishFlow();
  }, [finishFlow]);

  const handleStartWizard = useCallback(() => {
    setPhase("wizard");
  }, []);

  const handleWizardComplete = useCallback(async (result: FastStartResult) => {
    clearFreshSignupSession();
    setCompletion(result);
    setPhase("activate_pending");
    setPostSignupFlowActive(true);
  }, []);

  const handleWizardClose = useCallback(() => {
    markPostSignupDismissed();
    void markTourCompleted();
    finishFlow();
  }, [finishFlow]);

  const handleActivatePendingClose = useCallback(() => {
    finishFlow();
  }, [finishFlow]);

  const handleActivationCelebrateClose = useCallback(() => {
    finishFlow();
  }, [finishFlow]);

  const setupMs =
    completion?.timeToCompleteMs ??
    (() => {
      try {
        const start = localStorage.getItem("wireline_onboarding_start");
        return start ? Date.now() - Number(start) : 0;
      } catch {
        return 0;
      }
    })();

  const activationMs = activationSeconds != null ? activationSeconds * 1000 : setupMs;

  return (
    <>
      <Dialog
        open={phase === "welcome"}
        onOpenChange={(open) => {
          if (!open && phase === "welcome") handleExploreFirst();
        }}
      >
        <DialogContent
          className={cn(
            "max-w-lg border-border p-0 overflow-hidden gap-0",
            "wl-modal-surface wl-onboarding-welcome rounded-md [&>button.absolute]:hidden",
          )}
        >
          <div className="relative px-6 pt-6 pb-5 border-b border-border/80">
            <ShadButton
              type="button"
              variant="ghost"
              size="icon"
              disableAnimations
              onClick={handleExploreFirst}
              className="absolute right-3 top-3 h-8 w-8 rounded-full text-muted hover:text-ink touch-press hover:scale-[1.05]"
              aria-label="Close and explore"
            >
              <X className="w-4 h-4" />
            </ShadButton>

            <DialogHeader className="text-left space-y-3 pr-8">
              <div className="flex items-center gap-3">
                <span className="flex w-11 h-11 items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/20">
                  <WirelineMark className="w-5 h-5" strokeWidth={130} />
                </span>
                <div>
                  <p className="wl-label text-brand">{ONBOARDING_WELCOME.eyebrow}</p>
                  <DialogTitle className="font-display italic text-2xl text-ink leading-tight">
                    {ONBOARDING_WELCOME.title}{" "}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-deep">
                      {ONBOARDING_WELCOME.titleAccent}
                    </span>
                  </DialogTitle>
                </div>
              </div>
              <DialogDescription className="text-sm text-ink/70 leading-relaxed">
                {onboardingWelcomeSubtitle(signupWedge)}
              </DialogDescription>
            </DialogHeader>
          </div>

          <ul className="px-6 py-4 space-y-3">
            {ONBOARDING_WELCOME.bullets.map((item, i) => (
              <motion.li
                key={item.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08 * i, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="flex gap-3 items-start"
              >
                <span className="shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand/12 wl-micro-badge font-mono font-bold text-brand border border-brand/20">
                  {i + 1}
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink uppercase tracking-[0.12em]">
                    {item.label}
                  </p>
                  <p className="text-[11px] text-muted leading-relaxed mt-0.5">{item.detail}</p>
                </div>
              </motion.li>
            ))}
          </ul>

          <div className="px-6 pb-6 flex flex-col sm:flex-row gap-2">
            <ShadButton
              type="button"
              variant="editorial"
              disableAnimations
              onClick={handleStartWizard}
              className="touch-press hover:scale-[1.02] flex-1 rounded-full wl-label gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {ONBOARDING_WELCOME.ctaPrimary}
              <span className="wl-micro-meta opacity-80 normal-case tracking-normal">
                ({ONBOARDING_WELCOME.timeHint})
              </span>
            </ShadButton>
            <ShadButton
              type="button"
              variant="outline"
              disableAnimations
              onClick={handleExploreFirst}
              className="touch-press hover:scale-[1.02] flex-1 rounded-full wl-label gap-1.5"
            >
              <Compass className="w-3.5 h-3.5" />
              {ONBOARDING_WELCOME.ctaSecondary}
            </ShadButton>
          </div>
        </DialogContent>
      </Dialog>

      <FastStartWizard
        isOpen={phase === "wizard"}
        onClose={handleWizardClose}
        onComplete={handleWizardComplete}
        estimatedTimeText={ONBOARDING_WELCOME.timeHint}
      />

      <AnimatePresence>
        {phase === "activate_pending" && completion && (
          <YoureLiveModal
            isOpen
            mode="activation_pending"
            onClose={handleActivatePendingClose}
            agentName={completion.agentName}
            phoneNumber={
              completion.phoneNumber && completion.phoneNumber !== "Browser test only"
                ? completion.phoneNumber
                : null
            }
            timeToFirstCallMs={setupMs}
            knowledgeItems={completion.knowledgeItems}
            onTestCall={() => {
              handleActivatePendingClose();
              navigate("/chat");
            }}
            onViewDashboard={() => {
              handleActivatePendingClose();
              navigate("/ops");
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === "celebrate_activation" && (
          <YoureLiveModal
            isOpen
            mode="activated"
            onClose={handleActivationCelebrateClose}
            agentName={completion?.agentName ?? "Your agent"}
            phoneNumber={
              completion?.phoneNumber && completion.phoneNumber !== "Browser test only"
                ? completion.phoneNumber
                : null
            }
            timeToFirstCallMs={activationMs}
            knowledgeItems={completion?.knowledgeItems ?? 0}
            onTestCall={() => {
              handleActivationCelebrateClose();
              navigate("/chat");
            }}
            onViewDashboard={() => {
              handleActivationCelebrateClose();
              navigate("/ops");
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
