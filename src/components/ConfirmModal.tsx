import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { ShadButton } from "./ui/shadcn/ShadButton";

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

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => confirmBtnRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      prevFocus?.focus?.();
    };
  }, [open]);

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
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="relative w-full max-w-md sm:max-w-sm rounded-t-md sm:rounded-md z-10 max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain border border-border shadow-2xl"
          >
            <div className="relative rounded-t-md sm:rounded-md wl-panel-elevated p-6 overflow-hidden">
              <div className="sm:hidden flex justify-center -mt-1 mb-3">
                <div className="w-9 h-1 rounded-full bg-ink/15" aria-hidden="true" />
              </div>

              <div className="relative z-10 flex items-start gap-4 mb-5">
                <div
                  className={cn(
                    "w-10 h-10 rounded-md flex items-center justify-center shrink-0",
                    danger
                      ? "bg-rose-500/15 border border-rose-500/30"
                      : "bg-brand/15 border border-brand/30",
                  )}
                >
                  <AlertTriangle
                    className={cn("w-5 h-5", danger ? "text-rose-500" : "text-brand")}
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
                <ShadButton
                  variant="ghost"
                  size="icon"
                  onClick={onCancel}
                  aria-label="Close dialog"
                  className="ml-auto w-11 h-11 sm:w-8 sm:h-8 -m-1.5 sm:m-0 rounded-full shrink-0"
                >
                  <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                </ShadButton>
              </div>

              <div className="relative z-10 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                <ShadButton
                  variant="outline"
                  onClick={onCancel}
                  disabled={loading}
                  disableAnimations
                  className="flex-1 h-11 rounded-md text-[11px] uppercase tracking-[0.25em]"
                >
                  {cancelLabel}
                </ShadButton>
                <ShadButton
                  ref={confirmBtnRef}
                  variant={danger ? "destructive" : "editorial"}
                  onClick={onConfirm}
                  disabled={loading}
                  disableAnimations
                  className={cn(
                    "flex-1 h-11 rounded-md text-[11px] uppercase tracking-[0.25em]",
                    !danger && "!py-0",
                  )}
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  {confirmLabel}
                </ShadButton>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
