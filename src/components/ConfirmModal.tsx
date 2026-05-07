import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "../lib/utils";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel",
  danger = false, loading = false, onConfirm, onCancel,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-xl"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="relative w-full max-w-sm aurora-ring rounded-2xl z-10"
          >
            <div className="relative rounded-2xl glass-strong p-6 overflow-hidden">
              <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full blur-3xl opacity-30 pointer-events-none"
                style={{ background: danger ? "radial-gradient(circle, #E040C0, transparent)" : "radial-gradient(circle, #0AC8D4, transparent)" }} />

              <div className="relative z-10 flex items-start gap-4 mb-5">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  danger ? "bg-rose-500/15 border border-rose-500/30" : "bg-amber-500/15 border border-amber-500/30"
                )}>
                  <AlertTriangle className={cn("w-5 h-5", danger ? "text-rose-400" : "text-amber-400")} />
                </div>
                <div>
                  <h3 className="font-display italic text-xl text-ink mb-1">{title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{message}</p>
                </div>
                <button
                  onClick={onCancel}
                  aria-label="Close"
                  className="ml-auto w-11 h-11 sm:w-8 sm:h-8 -m-1.5 sm:m-0 rounded-full glass border border-white/10 flex items-center justify-center text-ink/40 hover:text-ink hover:border-white/20 transition-all shrink-0 active:scale-95"
                >
                  <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                </button>
              </div>

              {/* Buttons: stacked on phones, side-by-side from sm up so we
                  don't squeeze "Cancel" / "Confirm danger" labels into 35px
                  pills on narrow screens. h-11 = 44px touch target. */}
              <div className="relative z-10 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={onCancel}
                  disabled={loading}
                  className="flex-1 h-11 rounded-xl glass border border-white/10 text-[11px] uppercase tracking-[0.25em] text-muted hover:text-ink hover:border-white/20 transition-all active:scale-95"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={onConfirm}
                  disabled={loading}
                  className={cn(
                    "flex-1 h-11 rounded-xl text-[11px] uppercase tracking-[0.25em] flex items-center justify-center gap-1.5 transition-all active:scale-95",
                    danger
                      ? "bg-rose-500/20 border border-rose-500/40 text-rose-400 hover:bg-rose-500/30"
                      : "brutal-btn !py-0 !h-11"
                  )}
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
