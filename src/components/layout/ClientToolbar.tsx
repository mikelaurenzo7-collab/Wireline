import type { ReactNode } from "react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";

type ClientToolbarProps = {
  left?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/** Compact action row when TopBar owns the page title (no duplicate PageShell header). */
export default function ClientToolbar({ left, actions, className }: ClientToolbarProps) {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!left && !actions) return null;

  return (
    <>
      <div
        className={cn(
          "shrink-0 flex items-center justify-between gap-3 mb-2 md:mb-3 min-h-10",
          className,
        )}
      >
        {left && <div className="min-w-0 flex-1">{left}</div>}
        {actions && (
          <>
            <div className="hidden md:flex items-center justify-end gap-2 shrink-0">{actions}</div>
            <ShadButton
              type="button"
              variant="outline"
              size="icon"
              disableAnimations
              onClick={() => setOpen(true)}
              aria-label="Page actions"
              className="touch-press md:hidden w-9 h-9 wl-panel"
            >
              <MoreHorizontal className="w-5 h-5" />
            </ShadButton>
          </>
        )}
      </div>

      {open && actions && (
        <AnimatePresence>
          <motion.div
            key="toolbar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[80] md:hidden"
          >
            <ShadButton
              type="button"
              variant="ghost"
              disableAnimations
              aria-label="Close actions"
              className="absolute inset-0 h-auto w-full rounded-none bg-black/40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              ref={sheetRef}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
              className="absolute bottom-0 inset-x-0 wl-panel-elevated border-t border-ink/[0.08] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-eyebrow">Actions</span>
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  disableAnimations
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-muted" />
                </ShadButton>
              </div>
              <div className="flex flex-col gap-2">{actions}</div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}
    </>
  );
}
