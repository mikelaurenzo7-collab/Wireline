import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Pin the page underneath so the background can't creep while the
  // dialog is open. Restores scroll position cleanly on close.
  useBodyScrollLock(open);

  // Focus the confirm button when the modal opens; restore focus on close.
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    // Defer one frame so the element is in the DOM before focusing.
    const raf = requestAnimationFrame(() => confirmBtnRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      prevFocus?.focus?.();
    };
  }, [open]);

  // Trap focus inside the dialog while it's open.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          /* iOS sheet feel on mobile: anchored to the bottom of the viewport
           * with safe-area-inset-bottom padding so the modal clears the
           * home indicator. Pops to center on tablet+ where the screen
           * has enough room to treat it as a dialog. */
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
          aria-modal="true"
          role="dialog"
          aria-labelledby="confirm-modal-title"
          aria-describedby="confirm-modal-desc"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-xl"
            onClick={onCancel}
          />
          <motion.div
            ref={dialogRef}
            /* Slide up from below on mobile (y: 100 ≈ "off-screen bottom"),
             * pop into center on tablet+ via the bg layout — both look
             * native by using a spring transition rather than a linear
             * fade. Scale stays at 1 so the modal doesn't visibly shrink
             * during a slide. */
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="relative w-full max-w-md sm:max-w-sm aurora-ring rounded-t-2xl sm:rounded-2xl z-10 max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain"
          >
            <div className="relative rounded-t-2xl sm:rounded-2xl glass-strong p-6 overflow-hidden">
              {/* iOS-style sheet grabber — only visible on mobile, gives
               * the modal a "swipeable" affordance even though we don't
               * actually wire swipe-to-dismiss (the backdrop tap closes). */}
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
                  style={danger
                    ? { background: "rgba(232,70,106,0.15)", border: "1px solid rgba(232,70,106,0.30)" }
                    : { background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.30)" }}
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
                  style={danger
                    ? { background: "rgba(232,70,106,0.20)", border: "1px solid rgba(232,70,106,0.40)", color: "#E8466A" }
                    : undefined}
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
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
