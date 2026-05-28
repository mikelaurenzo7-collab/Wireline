import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Keyboard } from "lucide-react";

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  {
    category: "Navigation",
    items: [
      { keys: ["G", "D"], description: "Go to Dashboard" },
      { keys: ["G", "L"], description: "Go to Call Logs" },
      { keys: ["G", "T"], description: "Go to Triage" },
      { keys: ["G", "I"], description: "Go to Insights" },
      { keys: ["G", "A"], description: "Go to Agents" },
      { keys: ["G", "R"], description: "Go to Training" },
      { keys: ["G", "O"], description: "Go to Outbound" },
      { keys: ["G", "S"], description: "Go to Settings" },
    ],
  },
  {
    category: "Actions",
    items: [
      { keys: ["⌘", "K"], description: "Open command bar" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
      { keys: ["Esc"], description: "Close modal / panel" },
    ],
  },
  {
    category: "Call Logs",
    items: [
      { keys: ["⌘", "F"], description: "Focus search" },
      { keys: ["⌘", "E"], description: "Export to CSV" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-2 py-0.5 rounded-md border border-white/20 bg-white/5 text-[11px] font-mono text-ink/80 inline-flex items-center justify-center min-w-[1.5rem]">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Move focus to close button when modal opens
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
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-3 sm:inset-x-4 bottom-0 sm:bottom-auto sm:top-[10%] z-[91] mx-auto max-w-2xl"
            style={{
              paddingBottom: "env(safe-area-inset-bottom, 0)",
            }}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            <div className="glass-strong rounded-t-2xl sm:rounded-2xl border border-white/12 overflow-hidden max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)] overflow-y-auto overscroll-contain">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #4F1E7B22, #4F1E7B22)" }}
                  >
                    <Keyboard className="w-4 h-4 text-brand" />
                  </div>
                  <div>
                    <h2 className="text-sm font-medium text-ink">Keyboard shortcuts</h2>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
                      Quick navigation & actions
                    </p>
                  </div>
                </div>
                <button
                  ref={closeRef}
                  onClick={onClose}
                  aria-label="Close keyboard shortcuts"
                  className="w-11 h-11 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-ink/50 hover:text-ink hover:bg-white/8 border border-white/8 hover:border-white/20 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Shortcut grid */}
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {SHORTCUTS.map((section) => (
                    <div key={section.category}>
                      <h3 className="text-[9px] font-semibold uppercase tracking-[0.42em] text-muted/80 mb-3 flex items-center gap-2">
                        <span className="h-px flex-1 bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
                        {section.category}
                        <span className="h-px flex-1 bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
                      </h3>
                      <div className="space-y-2">
                        {section.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between gap-4 py-1">
                            <span className="text-[12px] text-ink/70">{item.description}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {item.keys.map((key, ki) => (
                                <Kbd key={ki}>{key}</Kbd>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-white/8 flex items-center justify-center gap-2 text-[10px] text-muted">
                <Kbd>?</Kbd>
                <span>
                  Press <strong className="text-ink/60">?</strong> anytime to show this panel
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
