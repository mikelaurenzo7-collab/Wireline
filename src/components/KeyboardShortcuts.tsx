import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Keyboard, ArrowRight } from "lucide-react";

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  {
    category: "Navigation",
    items: [
      { keys: ["G", "D"], description: "Live Ops" },
      { keys: ["G", "R"], description: "Chat" },
      { keys: ["G", "N"], description: "Training" },
      { keys: ["G", "P"], description: "Phone" },
      { keys: ["G", "E"], description: "Email" },
      { keys: ["G", "M"], description: "SMS" },
      { keys: ["G", "T"], description: "Triage" },
      { keys: ["G", "I"], description: "Insights" },
      { keys: ["G", "A"], description: "Agents" },
      { keys: ["G", "S"], description: "Settings" },
    ],
  },
  {
    category: "Commands",
    items: [
      { keys: ["\u2318", "K"], description: "Command palette" },
      { keys: ["?"], description: "Keyboard shortcuts" },
      { keys: ["Esc"], description: "Close panel" },
    ],
  },
  {
    category: "Call Logs",
    items: [
      { keys: ["\u2318", "F"], description: "Search calls" },
      { keys: ["\u2318", "E"], description: "Export CSV" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-2 py-0.5 border border-ink/[0.10] dark:border-brand/20 bg-ink/[0.02] dark:bg-brand/[0.04] text-[11px] font-mono text-ink/70 inline-flex items-center justify-center min-w-[1.5rem]">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 bottom-0 sm:bottom-auto sm:top-[8%] z-[91] sm:w-full max-w-xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            <div className="bg-white dark:bg-[var(--wl-surface-dark)] border border-black/[0.06] dark:border-brand/20 shadow-2xl overflow-hidden max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto overscroll-contain">
              <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-brand/[0.12]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-brand/10 flex items-center justify-center">
                    <Keyboard className="w-4 h-4 text-brand" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-ink">Keyboard shortcuts</h2>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
                      Navigate without the mouse
                    </p>
                  </div>
                </div>
                <button
                  ref={closeRef}
                  onClick={onClose}
                  aria-label="Close"
                  className="w-9 h-9 flex items-center justify-center text-muted hover:text-ink hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-5">
                {SHORTCUTS.map((section) => (
                  <div key={section.category}>
                    <h3 className="text-[9px] font-semibold uppercase tracking-[0.35em] text-brand/70 mb-3">
                      {section.category}
                    </h3>
                    <div className="space-y-1">
                      {section.items.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-4 py-2 px-2 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors group"
                        >
                          <span className="text-[12px] text-ink/80 group-hover:text-ink transition-colors">
                            {item.description}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {item.keys.map((key, ki) => (
                              <Kbd key={ki}>{key}</Kbd>
                            ))}
                            {item.keys.length > 1 && (
                              <span className="text-muted/40 mx-0.5 text-[10px] font-mono" aria-hidden="true">
                                +
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-5 py-3 border-t border-black/[0.06] dark:border-brand/[0.12] flex items-center justify-center gap-2 text-[10px] text-muted">
                <Kbd>?</Kbd>
                <ArrowRight className="w-3 h-3 text-muted/40" />
                <span>
                  Press <span className="font-semibold text-ink/60">?</span> any time
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}