import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useToast, type Toast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";

const META = {
  success: { icon: CheckCircle2, color: "#10B981", border: "border-emerald-500/30", bg: "bg-emerald-500/10" },
  error:   { icon: XCircle,      color: "#FF6B6B", border: "border-rose-500/30",    bg: "bg-rose-500/10" },
  warning: { icon: AlertTriangle,color: "#FFC07D", border: "border-amber-500/30",   bg: "bg-amber-500/10" },
  info:    { icon: Info,          color: "#0AC8D4", border: "border-brand/30",       bg: "bg-brand/10" },
};

function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToast();
  const m = META[toast.type];
  const Icon = m.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.94, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={cn(
        "relative w-80 max-w-[92vw] rounded-2xl glass border shadow-2xl overflow-hidden",
        m.border,
      )}
    >
      {/* Accent strip */}
      <div className="absolute left-0 inset-y-0 w-0.5 rounded-full" style={{ background: m.color }} />

      <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
        <div className={cn("shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5", m.bg)}>
          <Icon className="w-3.5 h-3.5" style={{ color: m.color }} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-[12px] font-semibold text-ink leading-snug truncate">{toast.title}</p>
          {toast.message && (
            <p className="text-[11px] text-muted/80 leading-snug mt-0.5 line-clamp-2">{toast.message}</p>
          )}
        </div>
        <button
          onClick={() => dismiss(toast.id)}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-white/8 transition-all mt-0.5"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
}

export default function ToastStack() {
  const { toasts } = useToast();
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none"
    >
      <AnimatePresence initial={false} mode="sync">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
