/**
 * YoureLiveModal — Celebration + clear next steps after first agent is live
 *
 * This is the "magic moment" in onboarding. When a user completes their
 * first agent setup, we celebrate their achievement and give them a clear
 * path forward.
 *
 * Design principles:
 *   - Celebration that feels earned (confetti, motion)
 *   - Clear next steps (not just "you're done", but "here's what to do now")
 *   - Time-to-first-call prominently displayed
 *   - Easy share (helps with word-of-mouth)
 */
import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  PartyPopper,
  Sparkles,
  Mic,
  ArrowRight,
  BarChart3,
  Share2,
  CheckCircle2,
  Copy,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/shadcn/Dialog";
import { ShadButton } from "./ui/shadcn/ShadButton";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface YoureLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
  phoneNumber: string | null;
  timeToFirstCallMs: number;
  knowledgeItems: number;
  onTestCall: () => void;
  onViewDashboard: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confetti Component
// ─────────────────────────────────────────────────────────────────────────────

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  delay: number;
}

const CONFETTI_COLORS = ["#8B3FD6", "#8B3FD6", "#8B6FA8", "#3B154C", "#C4B5A0", "#D4C9B8"];

function ConfettiExplosion({ active }: { active: boolean }) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    if (!active) {
      setPieces([]);
      return;
    }

    // Generate confetti pieces
    const newPieces: ConfettiPiece[] = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -10 - Math.random() * 20,
      rotation: Math.random() * 360,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 6 + Math.random() * 8,
      delay: Math.random() * 0.5,
    }));

    setPieces(newPieces);

    // Clear after animation
    const timer = setTimeout(() => setPieces([]), 4000);
    return () => clearTimeout(timer);
  }, [active]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
      <AnimatePresence>
        {pieces.map((piece) => (
          <motion.div
            key={piece.id}
            initial={{
              x: `${piece.x}%`,
              y: `${piece.y}%`,
              rotate: 0,
              opacity: 1,
              scale: 0,
            }}
            animate={{
              y: "120%",
              rotate: piece.rotation,
              opacity: [1, 1, 0],
              scale: [0, 1, 1],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 2.5 + Math.random() * 1,
              delay: piece.delay,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className="absolute"
            style={{
              width: piece.size,
              height: piece.size * 0.6,
              backgroundColor: piece.color,
              borderRadius: "2px",
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Next Step Card Component
// ─────────────────────────────────────────────────────────────────────────────

interface NextStepCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
  primary?: boolean;
  delay?: number;
}

function NextStepCard({
  icon: Icon,
  title,
  description,
  action,
  onClick,
  primary = false,
  delay = 0,
}: NextStepCardProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + delay * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      className={`group w-full text-left p-4 rounded-md border transition-all duration-300 ${
        primary
          ? "bg-gradient-to-br from-brand/10 to-brand/5 border-brand/30 hover:border-brand/50 hover:shadow-lg hover:shadow-brand/10"
          : "bg-white/50 border-black/10 hover:border-black/20 hover:bg-white/70"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
            primary
              ? "bg-brand/20 text-brand"
              : "bg-black/5 text-ink/60 group-hover:text-brand transition-colors"
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={`text-sm font-medium ${primary ? "text-brand" : "text-ink"}`}>
              {title}
            </h4>
            <ArrowRight
              className={`w-4 h-4 transition-transform group-hover:translate-x-1 ${
                primary ? "text-brand" : "text-muted"
              }`}
            />
          </div>
          <p className="text-xs text-muted mt-1 leading-relaxed">{description}</p>
          <p
            className={`text-[10px] uppercase tracking-[0.24em] mt-2 ${primary ? "text-brand/70" : "text-muted/70"}`}
          >
            {action}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function YoureLiveModal({
  isOpen,
  onClose,
  agentName,
  phoneNumber,
  timeToFirstCallMs,
  knowledgeItems,
  onTestCall,
  onViewDashboard,
}: YoureLiveModalProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [copied, setCopied] = useState(false);

  // Trigger confetti and conversion analytics when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowConfetti(true);

      // Dispatch conversion tracking to Meta Pixel, Google Tag Manager, and Plausible
      if (typeof window !== "undefined") {
        try {
          type AnalyticsWindow = Window & {
            fbq?: (event: string, action: string, data?: Record<string, unknown>) => void;
            plausible?: (event: string, data?: Record<string, unknown>) => void;
            dataLayer?: { push: (data: Record<string, unknown>) => void };
          };
          const w = window as AnalyticsWindow;
          if (typeof w.fbq === "function") {
            w.fbq("track", "CompleteRegistration", {
              content_name: "AI Agent Live",
              agent_name: agentName,
            });
          }
          if (typeof w.plausible === "function") {
            w.plausible("OnboardingWizardComplete", {
              props: { agent: agentName },
            });
          }
          if (w.dataLayer && typeof w.dataLayer.push === "function") {
            w.dataLayer.push({
              event: "onboarding_complete",
              agentName: agentName,
            });
          }
        } catch (err) {
          console.error("[wireline:analytics] Failed to dispatch conversion events:", err);
        }
      }

      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, agentName]);

  const formatTime = useCallback((ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);

    if (minutes === 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  }, []);

  const handleShare = useCallback(() => {
    const text = `I just set up an AI receptionist for my business in ${formatTime(timeToFirstCallMs)} with @trywireline`;

    if (navigator.share) {
      navigator.share({
        title: "My AI Receptionist is Live!",
        text,
        url: window.location.origin,
      });
    } else {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [timeToFirstCallMs, formatTime]);

  if (!isOpen) return null;

  const isQuickSetup = timeToFirstCallMs < 300000; // Under 5 minutes

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg border border-white/10 shadow-2xl p-0 bg-black/85 backdrop-blur-xl rounded-md overflow-hidden max-h-[90vh] overflow-y-auto">
        <ConfettiExplosion active={showConfetti} />

        {/* Hero Section */}
        <div className="relative px-8 pt-10 pb-6 text-center">
          {/* Glow effects */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-gradient-to-b from-brand/30 to-transparent blur-3xl pointer-events-none" />

          {/* Animated success icon */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, duration: 0.6, type: "spring", stiffness: 200 }}
            className="relative inline-block mb-6"
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand to-emerald-500 flex items-center justify-center shadow-lg shadow-brand/30">
              <PartyPopper className="w-10 h-10 text-white" />
            </div>
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
              className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-white"
            >
              <CheckCircle2 className="w-4 h-4 text-white" />
            </motion.div>
          </motion.div>

          <DialogHeader className="flex flex-col space-y-0 text-center items-center pb-2">
            <DialogDescription className="text-[10px] uppercase tracking-[0.45em] text-brand font-bold mb-2">
              Setup Complete
            </DialogDescription>
            <DialogTitle className="font-display italic text-3xl md:text-4xl text-ink leading-tight">
              You're Live!
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted mt-2 max-w-xs mx-auto">
            <strong className="text-ink">{agentName}</strong> is ready to answer calls
          </p>

          {/* Time badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-brand/10 border border-brand/30"
          >
            <Sparkles className="w-4 h-4 text-brand" />
            <span className="text-xs font-medium text-brand">
              {isQuickSetup ? "Lightning fast" : "Setup complete"} — {formatTime(timeToFirstCallMs)}
            </span>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex items-center justify-center gap-6 mt-6 text-xs"
          >
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>1 AI agent</span>
            </div>
            {knowledgeItems > 0 && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>{knowledgeItems} knowledge items</span>
              </div>
            )}
            {phoneNumber && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Phone number ready</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* Divider */}
        <div className="px-8">
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* Next Steps */}
        <div className="px-8 py-6 space-y-3">
          <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground mb-4 font-bold">
            What to do next
          </p>

          <NextStepCard
            icon={Mic}
            title="Talk to your agent"
            description="Place a test call right from your browser — no phone needed. Make sure it sounds perfect."
            action="Start test call →"
            onClick={onTestCall}
            primary
            delay={0}
          />

          <NextStepCard
            icon={BarChart3}
            title="View your dashboard"
            description="See call analytics, manage your agent's settings, and add more capabilities."
            action="Go to dashboard →"
            onClick={onViewDashboard}
            delay={1}
          />

          <NextStepCard
            icon={Users}
            title="Invite your team"
            description="Add colleagues to review calls, manage leads, and collaborate."
            action="Team settings →"
            onClick={onViewDashboard}
            delay={2}
          />
        </div>

        {/* Footer actions */}
        <div className="px-8 pb-8 pt-2">
          <div className="flex items-center justify-center gap-3">
            <ShadButton
              variant="outline"
              onClick={handleShare}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 text-[11px] uppercase tracking-[0.24em] text-ink hover:bg-white/5 transition-colors h-10"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  Share
                </>
              )}
            </ShadButton>

            {phoneNumber && (
              <ShadButton
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(phoneNumber);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 text-[11px] uppercase tracking-[0.24em] text-ink hover:bg-white/5 transition-colors h-10"
              >
                {copied ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {phoneNumber}
              </ShadButton>
            )}
          </div>

          <p className="text-center text-[10px] text-muted-foreground mt-4 italic">
            Your agent is live and ready to take calls 24/7
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Simplified export for programmatic use
// ─────────────────────────────────────────────────────────────────────────────

export function showYoureLiveCelebration(props: Omit<YoureLiveModalProps, "isOpen">) {
  // This is a helper for non-React contexts
  // In React, use the component directly
  return props;
}
