import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useLocation } from "react-router";
import { useToast, type Toast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { isMarketingStickyCtaRoute } from "../lib/marketing-mobile";
import { cn } from "../lib/utils";
import { ShadButton } from "./ui/shadcn/ShadButton";
import type { CSSProperties } from "react";

type ToastStackStyle = CSSProperties & {
  "--toast-mobile-bottom": string;
};

// Container surface and border come from `.toast-item[data-toast]` in
// letterpress-polish.css — border utilities here would lose to .wl-panel's
// unlayered shorthand. META only picks the glyph and its box tint.
const META = {
  success: { icon: CheckCircle2, bg: "wl-status-success" },
  error: { icon: XCircle, bg: "bg-[var(--wireline-color-feedback-error-surface)]" },
  warning: { icon: AlertTriangle, bg: "bg-[var(--wireline-color-feedback-warning-surface)]" },
  info: { icon: Info, bg: "bg-[var(--wireline-color-feedback-info-surface)]" },
};

function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToast();
  const m = META[toast.type];
  const Icon = m.icon;
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      layout
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reduceMotion
          ? { opacity: 0, transition: { duration: 0.01 } }
          : { opacity: 0, y: -8, scale: 0.94, transition: { duration: 0.18 } }
      }
      transition={
        reduceMotion ? { duration: 0.01 } : { type: "spring", stiffness: 380, damping: 32 }
      }
      className="toast-item relative w-full sm:w-80 max-w-full sm:max-w-[92vw] rounded-md wl-panel elev-2 border overflow-hidden toast-enter"
      data-toast={toast.type}
    >
      <div className="absolute left-0 inset-y-0 w-0.5 rounded-full wl-toast-accent" />

      <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
        <div
          className={cn(
            "shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5",
            m.bg,
          )}
        >
          <Icon aria-hidden="true" className="w-3.5 h-3.5 wl-toast-icon" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-[length:var(--wireline-typography-caption-size)] font-semibold text-foreground leading-snug truncate">
            {toast.title}
          </p>
          {toast.message && (
            <p className="text-caption leading-snug mt-0.5 line-clamp-2">{toast.message}</p>
          )}
          {toast.action && (
            <ShadButton
              type="button"
              variant="outline"
              size="sm"
              disableAnimations
              onClick={() => {
                toast.action?.onClick();
                dismiss(toast.id);
              }}
              className="mt-2 h-7 px-2.5 rounded-md wl-label text-brand border-brand/30 hover:bg-brand/10 touch-press"
            >
              {toast.action.label}
            </ShadButton>
          )}
        </div>
        <ShadButton
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => dismiss(toast.id)}
          aria-label="Dismiss notification"
          disableAnimations
          className="shrink-0 w-9 h-9 sm:w-6 sm:h-6 -m-1.5 sm:m-0 sm:mt-0.5 text-muted hover:text-foreground"
        >
          <X aria-hidden="true" className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
        </ShadButton>
      </div>
    </motion.div>
  );
}

export default function ToastStack() {
  const { toasts } = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const marketingSticky = !user && isMarketingStickyCtaRoute(location.pathname);

  // Clear the mobile dock (signed-in) or marketing sticky CTA (public conversion
  // routes). --toast-mobile-bottom is set inline so it cannot drift from the
  // WorkspaceShell dock / MarketingStickyCta heights.
  const mobileBottom = user
    ? "calc(5.25rem + env(safe-area-inset-bottom, 0px))"
    : marketingSticky
      ? "calc(5.25rem + env(safe-area-inset-bottom, 0px))"
      : "calc(1rem + env(safe-area-inset-bottom, 0px))";

  return (
    <div
      role="log"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions text"
      aria-label="Notifications"
      className="toast-stack fixed inset-x-3 max-md:bottom-[var(--toast-mobile-bottom)] md:bottom-5 md:inset-x-auto md:right-5 z-[9999] flex flex-col gap-2 items-stretch md:items-end pointer-events-none"
      style={{ "--toast-mobile-bottom": mobileBottom } as ToastStackStyle}
      data-marketing-sticky={marketingSticky ? "true" : undefined}
    >
      <AnimatePresence initial={false} mode="sync">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
