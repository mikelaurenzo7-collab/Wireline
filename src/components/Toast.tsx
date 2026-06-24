import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useToast, type Toast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { isMarketingStickyCtaRoute } from "../lib/marketing-mobile";
import { cn } from "../lib/utils";
import { Button } from "./atoms/Button";
import { IconButton } from "./atoms/IconButton";

const META = {
  success: {
    icon: CheckCircle2,
    border: "border-[var(--wl-success-border)]",
    bg: "bg-[var(--wl-success-surface)]",
    iconTone: "text-[var(--wl-success)]",
  },
  error: {
    icon: XCircle,
    border: "border-[var(--wl-error-border)]",
    bg: "bg-[var(--wl-error-surface)]",
    iconTone: "text-[var(--wl-error)]",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-[var(--wl-warning-border)]",
    bg: "bg-[var(--wl-warning-surface)]",
    iconTone: "text-[var(--wl-warning)]",
  },
  info: {
    icon: Info,
    border: "border-[var(--wl-info-border)]",
    bg: "bg-[var(--wl-info-surface)]",
    iconTone: "text-[var(--wl-info)]",
  },
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
      className={cn(
        "toast-item relative w-full max-w-full overflow-hidden rounded-md border bg-card shadow-[var(--wl-shadow-md)] sm:w-80 sm:max-w-[92vw]",
        m.border,
      )}
      data-toast={toast.type}
    >
      <div className="absolute inset-y-0 left-0 w-0.5 rounded-full bg-primary" />

      <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
        <div className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", m.bg)}>
          <Icon aria-hidden="true" className={cn("size-3.5", m.iconTone)} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1 pr-2">
          <p className="truncate text-[12px] font-semibold leading-snug text-foreground">{toast.title}</p>
          {toast.message ? <p className="mt-0.5 line-clamp-2 text-caption leading-snug">{toast.message}</p> : null}
          {toast.action ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                toast.action?.onClick();
                dismiss(toast.id);
              }}
              className="mt-2 border-primary/30 text-primary hover:bg-primary/10"
            >
              {toast.action.label}
            </Button>
          ) : null}
        </div>
        <IconButton
          type="button"
          label="Dismiss notification"
          variant="ghost"
          size="sm"
          onClick={() => dismiss(toast.id)}
          className="-m-1.5 size-9 min-h-9 min-w-9 shrink-0 text-muted-foreground hover:text-foreground sm:m-0 sm:mt-0.5 sm:size-8 sm:min-h-8 sm:min-w-8"
        >
          <X aria-hidden="true" className="size-3.5" />
        </IconButton>
      </div>
    </motion.div>
  );
}

export default function ToastStack() {
  const { toasts } = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const marketingSticky = !user && isMarketingStickyCtaRoute(location.pathname);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions text"
      aria-label="Notifications"
      className="toast-stack fixed inset-x-3 z-[9999] flex flex-col items-stretch gap-2 pointer-events-none max-md:bottom-[var(--toast-mobile-bottom)] md:inset-x-auto md:bottom-5 md:right-5 md:items-end"
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
