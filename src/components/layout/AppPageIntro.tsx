import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";

interface AppPageIntroProps {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * In-app page header when a route does not use WorkspaceShell.
 * Mobile actions remain available without turning the title area into a crowded toolbar.
 */
export default function AppPageIntro({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: AppPageIntroProps) {
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);

  const closeActions = () => setMobileActionsOpen(false);

  useEffect(() => {
    if (!mobileActionsOpen) return;
    priorFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeActions();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        sheetRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) || [],
      ).filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
      priorFocusRef.current?.focus();
      priorFocusRef.current = null;
    };
  }, [mobileActionsOpen]);

  return (
    <>
      <div
        className={cn(
          "flex flex-col justify-between gap-4 border-b border-border pb-5 md:flex-row md:items-start md:pb-8",
          className,
        )}
      >
        <div className="w-full min-w-0 max-w-3xl flex-1 text-left">
          {eyebrow ? <p className="wl-overline mb-2">{eyebrow}</p> : null}
          <h1 className="wl-page-title text-balance">{title}</h1>
          {subtitle ? <div className="wl-page-copy mt-3 text-pretty">{subtitle}</div> : null}
        </div>
        {actions ? (
          <div className="mt-1 flex shrink-0 flex-wrap items-center gap-2 md:mt-0 md:justify-end">
            <div className="hidden flex-wrap items-center gap-3 md:flex">{actions}</div>
            <ShadButton
              ref={triggerRef}
              type="button"
              disableAnimations
              variant="outline"
              size="icon"
              onClick={() => setMobileActionsOpen(true)}
              aria-label="Page actions"
              aria-expanded={mobileActionsOpen}
              aria-controls="app-page-actions"
              className="wl-control-icon touch-press md:hidden"
            >
              <MoreHorizontal className="h-5 w-5" />
            </ShadButton>
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {mobileActionsOpen && actions ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.16 }}
              className="fixed inset-0 z-[200] bg-[color:var(--wl-focus)] md:hidden"
              onClick={closeActions}
              aria-hidden
            />
            <motion.div
              id="app-page-actions"
              ref={sheetRef}
              initial={reduceMotion ? false : { y: "100%" }}
              animate={{ y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-[201] rounded-t-[var(--radius-xl)] border border-border bg-card pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-24px_48px_-20px_rgba(11,28,48,0.28)] md:hidden"
              role="dialog"
              aria-labelledby="app-page-actions-title"
              aria-modal="true"
              tabIndex={-1}
            >
              <div className="flex justify-center py-3">
                <div className="h-1 w-10 rounded-full bg-border" aria-hidden />
              </div>
              <div className="flex items-center justify-between px-4 pb-3">
                <p id="app-page-actions-title" className="wl-overline">Actions</p>
                <ShadButton
                  ref={closeButtonRef}
                  type="button"
                  disableAnimations
                  variant="ghost"
                  size="icon"
                  onClick={closeActions}
                  className="wl-control-icon touch-press"
                  aria-label="Close actions"
                >
                  <X className="h-4 w-4" />
                </ShadButton>
              </div>
              <div className="flex flex-col gap-2 px-4 pb-4 [&_a]:min-h-[48px] [&_button]:min-h-[48px]">
                {actions}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
