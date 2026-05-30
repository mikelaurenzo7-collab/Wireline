import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useToast, type Toast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { isMarketingStickyCtaRoute, MARKETING_STICKY_CTA_BOTTOM } from "../lib/marketing-mobile";

const META = {
  success: {
    icon: CheckCircle2,
    color: "#10b981",
    borderColor: "rgba(16,185,129,0.30)",
    bgColor: "rgba(16,185,129,0.10)",
  },
  error: {
    icon: XCircle,
    color: "#E8466A",
    borderColor: "rgba(232,70,106,0.30)",
    bgColor: "rgba(232,70,106,0.10)",
  },
  warning: {
    icon: AlertTriangle,
    color: "#f59e0b",
    borderColor: "rgba(245,158,11,0.30)",
    bgColor: "rgba(245,158,11,0.10)",
  },
  info: {
    icon: Info,
    color: "#8B3FD6",
    borderColor: "rgba(139,63,214,0.30)",
    bgColor: "rgba(139,63,214,0.10)",
  },
};

function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToast();
  const m = META[toast.type];
  const Icon = m.icon;

  return (
    <motion.div
      layout
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.94, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="relative w-full sm:w-80 max-w-full sm:max-w-[92vw] rounded-2xl glass border shadow-2xl overflow-hidden"
      style={{ borderColor: m.borderColor }}
    >
      {/* Accent strip */}
      <div
        className="absolute left-0 inset-y-0 w-0.5 rounded-full"
        style={{ background: m.color }}
      />

      <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
        <div
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
          style={{ background: m.bgColor }}
          )}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: m.color }} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-[12px] font-semibold text-ink leading-snug truncate">{toast.title}</p>
          {toast.message && (
            <p className="text-caption leading-snug mt-0.5 line-clamp-2">{toast.message}</p>
          )}
        </div>
        <button
          onClick={() => dismiss(toast.id)}
          aria-label="Dismiss notification"
          // Larger hit area on touch devices; visible icon stays small.
          className="shrink-0 w-9 h-9 sm:w-6 sm:h-6 -m-1.5 sm:m-0 sm:mt-0.5 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-white/8 transition-all"
        >
          <X className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
        </button>
      </div>
    </motion.div>
  );
}

export default function ToastStack() {
  const { toasts } = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const marketingSticky = !user && isMarketingStickyCtaRoute(location.pathname);

  // The mobile bottom tab bar was removed, so signed-in toasts now sit at the
  // standard bottom gutter. Only the public marketing sticky CTA still needs
  // extra clearance.
  const mobileBottom = marketingSticky
    ? MARKETING_STICKY_CTA_BOTTOM
    : "calc(0.75rem + env(safe-area-inset-bottom, 0px))";

  return (
    <div
      role="log"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Notifications"
      className="fixed inset-x-3 max-md:bottom-[var(--toast-mobile-bottom)] md:bottom-5 md:inset-x-auto md:right-5 z-[9999] flex flex-col gap-2 items-stretch md:items-end pointer-events-none"
      style={{
        ["--toast-mobile-bottom" as string]: mobileBottom,
        paddingBottom: 0,
      }}
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
