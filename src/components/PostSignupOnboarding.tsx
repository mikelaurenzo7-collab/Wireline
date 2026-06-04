/**
 * Auto-opens after signup (or when a signed-in user has zero agents).
 * Welcome beat → FastStartWizard → YoureLiveModal. Suppresses Product Tour overlap.
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
  markOnboardingCelebrated,
  markOnboardingCompleted,
  markPostSignupDismissed,
  markTourCompleted,
  setPostSignupFlowActive,
} from "../lib/post-signup-onboarding";
import { ONBOARDING_WELCOME, onboardingWelcomeSubtitle } from "../lib/wireline-onboarding-copy";
import { cn } from "../lib/utils";

type Phase = "idle" | "welcome" | "wizard" | "celebrate";

export default function PostSignupOnboarding() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("idle");
  const [completion, setCompletion] = useState<FastStartResult | null>(null);
  const [signupWedge, setSignupWedge] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const eligibility = await evaluatePostSignupEligibility();
      if (cancelled || !eligibility.shouldShow) {
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
    await markOnboardingCompleted();
    markOnboardingCelebrated();
    clearFreshSignupSession();
    setCompletion(result);
    setPhase("celebrate");
    setPostSignupFlowActive(false);
  }, []);

  const handleWizardClose = useCallback(() => {
    markPostSignupDismissed();
    void markTourCompleted();
    finishFlow();
  }, [finishFlow]);

  const handleCelebrateClose = useCallback(() => {
    finishFlow();
  }, [finishFlow]);

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
            "wl-panel-elevated wl-onboarding-welcome rounded-md [&>button.absolute]:hidden",
          )}
        >
          <div className="relative px-6 pt-6 pb-5 border-b border-border/80">
            <ShadButton
              type="button"
              variant="ghost"
              size="icon"
              disableAnimations
              onClick={handleExploreFirst}
              className="absolute right-3 top-3 h-8 w-8 rounded-full text-muted hover:text-ink"
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
                <span className="shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand/12 text-[10px] font-mono font-bold text-brand border border-brand/20">
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
              className="touch-press flex-1 rounded-full text-[10px] uppercase tracking-[0.24em] gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {ONBOARDING_WELCOME.ctaPrimary}
              <span className="text-[9px] opacity-80 normal-case tracking-normal">
                ({ONBOARDING_WELCOME.timeHint})
              </span>
            </ShadButton>
            <ShadButton
              type="button"
              variant="outline"
              disableAnimations
              onClick={handleExploreFirst}
              className="touch-press flex-1 rounded-full text-[10px] uppercase tracking-[0.22em] gap-1.5"
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
        {phase === "celebrate" && completion && (
          <YoureLiveModal
            isOpen
            onClose={handleCelebrateClose}
            agentName={completion.agentName}
            phoneNumber={
              completion.phoneNumber && completion.phoneNumber !== "Browser test only"
                ? completion.phoneNumber
                : null
            }
            timeToFirstCallMs={completion.timeToCompleteMs}
            knowledgeItems={completion.knowledgeItems}
            onTestCall={() => {
              handleCelebrateClose();
              navigate("/chat");
            }}
            onViewDashboard={() => {
              handleCelebrateClose();
              navigate("/ops");
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
