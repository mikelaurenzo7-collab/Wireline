import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useRef } from "react";
import { cn } from "../lib/utils";
import { Dialog, DialogPortal } from "./ui/shadcn/Dialog";

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
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  return (
    // Radix Dialog handles: scroll-lock, focus-trap, Escape key, aria-modal,
    // focus restoration — replacing the manual useEffect blocks.
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogPortal>
        <AnimatePresence>
          {open && (
            <>
              {/* Overlay — replaces DialogOverlay so we can animate it */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xl"
                aria-hidden="true"
              />

              {/* Content wrapper — iOS sheet on mobile, centered dialog on sm+ */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
                style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 100 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 100 }}
                  transition={{ type: "spring", damping: 30, stiffness: 280 }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="confirm-modal-title"
                  aria-describedby="confirm-modal-desc"
                  className="relative w-full max-w-md sm:max-w-sm aurora-ring rounded-t-2xl sm:rounded-2xl z-10 max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain"
                >
                  <div className="relative rounded-t-2xl sm:rounded-2xl glass-strong p-6 overflow-hidden">
                    {/* iOS-style sheet grabber */}
                    <div className="sm:hidden flex justify-center -mt-1 mb-3">
                      <div className="w-9 h-1 rounded-full bg-ink/15" aria-hidden="true" />
                    </div>
                    <div
                      className="absolute -top-16 -right-16 w-32 h-32 rounded-full blur-3xl opacity-30 pointer-events-none"
                      style={{
                        background: danger
                          ? "radial-gradient(circle, #E8466A, transparent)"
                          : "radial-gradient(circle, #8B3FD6, transparent)",
                      }}
                    />

                    <div className="relative z-10 flex items-start gap-4 mb-5">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={
                          danger
                            ? {
                                background: "rgba(232,70,106,0.15)",
                                border: "1px solid rgba(232,70,106,0.30)",
                              }
                            : {
                                background: "rgba(245,158,11,0.15)",
                                border: "1px solid rgba(245,158,11,0.30)",
                              }
                        }
                      >
                        <AlertTriangle
                          className="w-5 h-5"
                          style={{ color: danger ? "#E8466A" : "#f59e0b" }}
                          aria-hidden="true"
                        />
                      </div>
                      <div>
                        <h3
                          id="confirm-modal-title"
                          className="font-display italic text-xl text-ink mb-1"
                        >
                          {title}
                        </h3>
                        <p id="confirm-modal-desc" className="text-xs text-muted leading-relaxed">
                          {message}
                        </p>
                      </div>
                      <button
                        onClick={onCancel}
                        aria-label="Close dialog"
                        className="ml-auto w-11 h-11 sm:w-8 sm:h-8 -m-1.5 sm:m-0 rounded-full glass border border-white/10 flex items-center justify-center text-ink/65 hover:text-ink hover:border-white/20 transition-all shrink-0 active:scale-95"
                      >
                        <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="relative z-10 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                      <button
                        onClick={onCancel}
                        disabled={loading}
                        className="disabled:opacity-50 disabled:cursor-not-allowed flex-1 h-11 rounded-xl glass border border-white/10 text-[11px] uppercase tracking-[0.25em] text-muted hover:text-ink hover:border-white/20 transition-all active:scale-95"
                      >
                        {cancelLabel}
                      </button>
                      <button
                        ref={confirmBtnRef}
                        onClick={onConfirm}
                        disabled={loading}
                        className={cn(
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                          "flex-1 h-11 rounded-xl text-[11px] uppercase tracking-[0.25em] flex items-center justify-center gap-1.5 transition-all active:scale-95",
                          !danger && "brutal-btn !py-0 !h-11",
                        )}
                        style={
                          danger
                            ? {
                                background: "rgba(232,70,106,0.20)",
                                border: "1px solid rgba(232,70,106,0.40)",
                                color: "#E8466A",
                              }
                            : undefined
                        }
                      >
                        {loading && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        )}
                        {confirmLabel}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </DialogPortal>
    </Dialog>
  );
}
