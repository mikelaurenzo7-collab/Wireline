import { useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { X, Keyboard } from "lucide-react";
import { ShadButton } from "./ui/shadcn/ShadButton";

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

const IS_APPLE =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
const CMD_KEY = IS_APPLE ? "⌘" : "Ctrl";

const SHORTCUTS = [
  {
    category: "Build",
    items: [
      { keys: ["G", "A"], description: "Go to Studio" },
      { keys: ["G", "K"], description: "Go to Training" },
      { keys: ["G", "C"], description: "Go to Wire" },
    ],
  },
  {
    category: "Run",
    items: [
      { keys: ["G", "O"], description: "Go to Recaps" },
      { keys: ["G", "L"], description: "Go to Pipeline" },
      { keys: ["G", "I"], description: "Go to Insights" },
      { keys: ["G", "P"], description: "Go to Phone" },
      { keys: ["G", "E"], description: "Go to Email" },
      { keys: ["G", "M"], description: "Go to SMS" },
      { keys: ["G", "S"], description: "Go to Settings" },
    ],
  },
  {
    category: "Studio",
    items: [{ keys: ["?"], description: "Open Studio co-pilot" }],
  },
  {
    category: "Actions",
    items: [
      { keys: [CMD_KEY, "K"], description: "Open command bar" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
      { keys: ["Esc"], description: "Close modal / panel" },
    ],
  },
  {
    category: "Phone",
    items: [
      { keys: [CMD_KEY, "F"], description: "Focus search" },
      { keys: [CMD_KEY, "E"], description: "Export to CSV" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-2 py-0.5 rounded-md border border-white/20 bg-white/5 text-[var(--wireline-typography-overline-size)] font-mono text-foreground/80 inline-flex items-center justify-center min-w-[1.5rem]">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    return () => {
      window.removeEventListener("keydown", handler);
      if (restoreFocusRef.current && document.contains(restoreFocusRef.current)) {
        restoreFocusRef.current.focus();
      }
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0.01 } } : { opacity: 0 }}
            transition={reduceMotion ? { duration: 0.01 } : { duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0.01 } }
                : { opacity: 0, scale: 0.96, y: 12 }
            }
            transition={
              reduceMotion ? { duration: 0.01 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }
            }
            className="fixed inset-x-3 sm:inset-x-4 bottom-0 sm:bottom-auto sm:top-[10%] z-[91] mx-auto max-w-2xl pb-[env(safe-area-inset-bottom,0)]"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="keyboard-shortcuts-title"
          >
            <div className="wl-panel-elevated rounded-t-md sm:rounded-md border border-white/12 overflow-hidden max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)] overflow-y-auto overscroll-contain">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center wl-shortcuts-icon">
                    <Keyboard aria-hidden="true" className="w-4 h-4 text-brand" />
                  </div>
                  <div>
                    <h2
                      id="keyboard-shortcuts-title"
                      className="text-sm font-medium text-foreground"
                    >
                      Keyboard shortcuts
                    </h2>
                    <p className="wl-label-muted">Quick navigation & actions</p>
                  </div>
                </div>
                <ShadButton
                  ref={closeRef}
                  type="button"
                  variant="ghost"
                  size="icon"
                  disableAnimations
                  onClick={onClose}
                  aria-label="Close keyboard shortcuts"
                  className="w-11 h-11 sm:w-8 sm:h-8 border border-white/8 hover:border-white/20"
                >
                  <X aria-hidden="true" className="w-3.5 h-3.5" />
                </ShadButton>
              </div>

              {/* Shortcut grid */}
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {SHORTCUTS.map((section) => (
                    <div key={section.category}>
                      <h3 className="wl-label text-muted/80 mb-3 flex items-center gap-2 font-semibold">
                        <span className="h-px flex-1 bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
                        {section.category}
                        <span className="h-px flex-1 bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
                      </h3>
                      <div className="space-y-2">
                        {section.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between gap-4 py-1">
                            <span className="text-[var(--wireline-typography-caption-size)] text-foreground/70">
                              {item.description}
                            </span>
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
              <div className="px-6 py-3 border-t border-white/8 flex items-center justify-center gap-2 wl-micro-meta--muted">
                <Kbd>?</Kbd>
                <span>
                  Press <strong className="text-foreground/70">?</strong> anytime to show this panel
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
