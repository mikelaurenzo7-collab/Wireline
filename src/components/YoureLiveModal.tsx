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
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  PartyPopper,
  Sparkles,
  Mic,
  ArrowRight,
  LayoutGrid,
  Share2,
  CheckCircle2,
  Copy,
  BarChart3,
  MessagesSquare,
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
import {
  ACTIVATION_COMPLETE_COPY,
  ACTIVATION_PENDING_COPY,
  CONSOLE_MAP,
  YOURE_LIVE_COPY,
} from "../lib/wireline-onboarding-copy";
import { BRAND } from "../constants/brand-colors";
import { cn } from "../lib/utils";

const CONSOLE_MAP_ICONS = {
  ops: LayoutGrid,
  chat: MessagesSquare,
  agents: Users,
  insights: BarChart3,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type YoureLiveModalMode = "activation_pending" | "activated" | "legacy";

export interface YoureLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
  phoneNumber: string | null;
  timeToFirstCallMs: number;
  knowledgeItems: number;
  onTestCall: () => void;
  onViewDashboard: () => void;
  /** activation_pending = setup done; activated = first useful call recorded */
  mode?: YoureLiveModalMode;
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

const CONFETTI_COLORS = [
  BRAND.purple,
  BRAND.purple,
  BRAND.purpleMuted,
  BRAND.purpleDeep,
  BRAND.creamDeep,
  BRAND.creamWarm,
];

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
            className="absolute wl-confetti-piece"
            data-confetti-w={`${piece.size}px`}
            data-confetti-h={`${piece.size * 0.6}px`}
            data-confetti-bg={piece.color}
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
      className={cn(
        "group touch-press hover:scale-[1.02] w-full text-left p-4 rounded-md border transition-all duration-300",
        primary
          ? "bg-gradient-to-br from-brand/10 to-brand/5 border-brand/30 hover:border-brand/50 hover:shadow-lg hover:shadow-brand/10"
          : "wl-panel border-border hover:border-brand/25",
      )}
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
          <p className={`wl-label mt-2 ${primary ? "text-brand/70" : "text-muted/70"}`}>{action}</p>
        </div>
      </div>
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

function formatTel(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  return `tel:${number}`;
}

export default function YoureLiveModal({
  isOpen,
  onClose,
  agentName,
  phoneNumber,
  timeToFirstCallMs,
  knowledgeItems,
  onTestCall,
  onViewDashboard,
  mode = "legacy",
}: YoureLiveModalProps) {
  const navigate = useNavigate();
  const [showConfetti, setShowConfetti] = useState(false);
  const [copied, setCopied] = useState(false);

  const isActivated = mode === "activated" || mode === "legacy";
  const isPending = mode === "activation_pending";
  const copy = isPending
    ? ACTIVATION_PENDING_COPY
    : isActivated && mode === "activated"
      ? ACTIVATION_COMPLETE_COPY
      : null;

  // Trigger confetti and conversion analytics when modal opens (activation only)
  useEffect(() => {
    if (isOpen) {
      setShowConfetti(isActivated);

      if (!isActivated) return;

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
            w.plausible(mode === "activated" ? "TenantActivated" : "OnboardingWizardComplete", {
              props: { agent: agentName },
            });
          }
          if (w.dataLayer && typeof w.dataLayer.push === "function") {
            w.dataLayer.push({
              event: mode === "activated" ? "tenant_activated" : "onboarding_complete",
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
  }, [isOpen, agentName, isActivated, mode]);

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
  const eyebrow = copy?.eyebrow ?? YOURE_LIVE_COPY.eyebrow;
  const title = copy?.title ?? YOURE_LIVE_COPY.title;
  const titleAccent = "titleAccent" in (copy ?? {}) ? copy?.titleAccent : null;
  const subtitle = copy?.subtitle(agentName) ?? YOURE_LIVE_COPY.subtitle(agentName);
  const timeBadge = isPending
    ? "Setup complete"
    : isQuickSetup
      ? "Lightning fast"
      : mode === "activated"
        ? "Time to activation"
        : "Setup complete";

  const signalClass = "text-[color:var(--wl-signal,#10B981)]";

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent
        className={cn(
          "sm:max-w-lg p-0 overflow-hidden max-h-[90vh] overflow-y-auto scroll-viewport",
          "wl-celebration-panel [&>button.absolute]:hidden",
        )}
      >
        <ConfettiExplosion active={showConfetti} />

        <div className="relative px-6 sm:px-8 pt-8 pb-5 text-center">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-56 h-28 bg-gradient-to-b from-brand/20 to-transparent blur-3xl pointer-events-none"
            aria-hidden
          />

          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, duration: 0.6, type: "spring", stiffness: 200 }}
            className="relative inline-block mb-5"
          >
            <div className="w-16 h-16 rounded-md bg-gradient-to-br from-brand to-brand-deep flex items-center justify-center shadow-lg shadow-brand/25">
              <PartyPopper className="w-8 h-8 text-on-brand" />
            </div>
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.3 }}
              className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-paper wl-status-success bg-[color-mix(in_srgb,var(--wl-signal)_85%,var(--paper))]"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            </motion.span>
          </motion.div>

          <DialogHeader className="flex flex-col space-y-0 text-center items-center pb-1">
            <DialogDescription className="wl-label text-brand mb-1">{eyebrow}</DialogDescription>
            <DialogTitle className="font-display italic text-3xl text-ink leading-tight">
              {title}
              {titleAccent ? (
                <>
                  {" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-deep">
                    {titleAccent}
                  </span>
                </>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted mt-1 max-w-xs mx-auto">{subtitle}</p>

          {isPending && phoneNumber ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="mt-4 p-4 rounded-md border border-brand/25 bg-brand/5 text-left"
            >
              <p className="wl-label text-brand mb-1">{ACTIVATION_PENDING_COPY.phoneLabel}</p>
              <p className="font-mono text-lg text-ink tabular-nums">{phoneNumber}</p>
              <a
                href={formatTel(phoneNumber)}
                className="touch-press mt-3 inline-flex items-center justify-center gap-2 w-full rounded-full bg-brand text-on-brand wl-label py-2.5 min-h-[44px] hover:opacity-95 transition-opacity"
              >
                <Mic className="w-4 h-4" />
                {ACTIVATION_PENDING_COPY.dialCta}
              </a>
            </motion.div>
          ) : null}

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35 }}
            className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/25"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand" />
            <span className="text-[11px] font-medium text-brand tabular-nums">
              {timeBadge} · {formatTime(timeToFirstCallMs)}
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-4 text-[11px] text-muted"
          >
            <span className={cn("inline-flex items-center gap-1", signalClass)}>
              <CheckCircle2 className="w-3.5 h-3.5" />1 agent
            </span>
            {knowledgeItems > 0 && (
              <span className={cn("inline-flex items-center gap-1", signalClass)}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {knowledgeItems} knowledge
              </span>
            )}
            {phoneNumber && (
              <span className={cn("inline-flex items-center gap-1", signalClass)}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Number ready
              </span>
            )}
          </motion.div>
        </div>

        <div className="px-6 sm:px-8">
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        <div className="px-6 sm:px-8 py-5 space-y-3">
          <p className="wl-label text-muted mb-1">
            {copy && "nextLabel" in copy ? copy.nextLabel : YOURE_LIVE_COPY.nextLabel}
          </p>

          <NextStepCard
            icon={LayoutGrid}
            title={isPending ? ACTIVATION_PENDING_COPY.opsTitle : YOURE_LIVE_COPY.opsTitle}
            description={isPending ? ACTIVATION_PENDING_COPY.opsDetail : YOURE_LIVE_COPY.opsDetail}
            action={isPending ? ACTIVATION_PENDING_COPY.opsAction : YOURE_LIVE_COPY.opsAction}
            onClick={onViewDashboard}
            primary={isPending}
            delay={0}
          />

          <NextStepCard
            icon={Mic}
            title={
              isPending ? ACTIVATION_PENDING_COPY.browserTestTitle : YOURE_LIVE_COPY.testCallTitle
            }
            description={
              isPending ? ACTIVATION_PENDING_COPY.browserTestDetail : YOURE_LIVE_COPY.testCallDetail
            }
            action={
              isPending ? ACTIVATION_PENDING_COPY.browserTestAction : YOURE_LIVE_COPY.testCallAction
            }
            onClick={onTestCall}
            primary={!isPending}
            delay={1}
          />
        </div>

        <div className="px-6 sm:px-8 pb-6">
          <p className="wl-label text-brand mb-2">{CONSOLE_MAP.sectionTitle}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CONSOLE_MAP.items.map((item) => {
              const Icon = CONSOLE_MAP_ICONS[item.id as keyof typeof CONSOLE_MAP_ICONS];
              return (
                <ShadButton
                  key={item.id}
                  type="button"
                  variant="ghost"
                  disableAnimations
                  className="wl-console-map-item touch-press hover:scale-[1.02] flex h-auto w-full items-start justify-start gap-2.5 px-[0.65rem] py-[0.55rem] text-left font-normal"
                  onClick={() => {
                    onClose();
                    navigate(item.path);
                  }}
                >
                  <span className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold text-ink uppercase tracking-[0.1em]">
                      {item.label}
                    </span>
                    <span className="block wl-micro-meta--muted leading-snug mt-0.5">
                      {item.detail}
                    </span>
                  </span>
                </ShadButton>
              );
            })}
          </div>
        </div>

        <div className="px-6 sm:px-8 pb-7 pt-1 flex flex-wrap items-center justify-center gap-2">
          <ShadButton
            type="button"
            variant="outline"
            disableAnimations
            onClick={handleShare}
            className="touch-press hover:scale-[1.02] rounded-full wl-label gap-1.5"
          >
            {copied ? (
              <>
                <CheckCircle2 className={cn("w-3.5 h-3.5", signalClass)} />
                Copied
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                Share win
              </>
            )}
          </ShadButton>
          {phoneNumber && (
            <ShadButton
              type="button"
              variant="outline"
              disableAnimations
              onClick={() => {
                navigator.clipboard.writeText(phoneNumber);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="touch-press hover:scale-[1.02] rounded-full wl-label gap-1.5 font-mono"
            >
              <Copy className="w-3.5 h-3.5" />
              {phoneNumber}
            </ShadButton>
          )}
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
