import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
 * In-app page header when a route does not use PageShell (e.g. Command Center).
 * Matches PageShell editorial hierarchy; mobile uses a bottom sheet for actions.
 */
export default function AppPageIntro({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: AppPageIntroProps) {
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileActionsOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileActionsOpen]);

  useEffect(() => {
    if (!mobileActionsOpen) return;
    closeButtonRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileActionsOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mobileActionsOpen]);

  return (
    <>
      <div className={cn("flex flex-col items-center text-center gap-2 pb-2 md:pb-3", className)}>
        <div className="min-w-0 w-full max-w-2xl">
          <div className="lg:hidden">
            {eyebrow && <p className="wl-label text-brand/80 mb-1 wl-reveal">{eyebrow}</p>}
            <h1 className="page-title-aurora font-display italic text-xl sm:text-2xl md:text-[1.65rem] leading-tight tracking-tight text-balance hero-headline-glow">
              {title}
            </h1>
          </div>
          {subtitle && (
            <div className="mt-1.5 lg:mt-0 text-caption max-w-2xl text-pretty">{subtitle}</div>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
            <div className="hidden md:flex flex-wrap items-center gap-2">{actions}</div>
            <ShadButton
              type="button"
              disableAnimations
              variant="outline"
              size="icon"
              onClick={() => setMobileActionsOpen(true)}
              aria-label="Page actions"
              className="touch-press hover:scale-[1.05] md:hidden rounded-md text-muted wl-panel after:hidden"
            >
              <MoreHorizontal className="w-5 h-5" />
            </ShadButton>
          </div>
        )}
      </div>

      <AnimatePresence>
        {mobileActionsOpen && actions && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] md:hidden"
              onClick={() => setMobileActionsOpen(false)}
              aria-hidden
            />
            <motion.div
              ref={sheetRef}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-[201] wl-panel-elevated rounded-t-[1.35rem] border-t border-black/10 md:hidden pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-24px_48px_-20px_rgba(30,0,48,0.35),0_1px_0_rgba(255,255,255,0.75)_inset]"
              role="dialog"
              aria-label="Page actions"
              aria-modal="true"
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-brand/25" aria-hidden />
              </div>
              <div className="flex items-center justify-between px-4 pb-3">
                <p className="text-eyebrow">Actions</p>
                <ShadButton
                  ref={closeButtonRef}
                  type="button"
                  disableAnimations
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileActionsOpen(false)}
                  className="touch-press hover:scale-[1.05] w-11 h-11 rounded-md text-ink/70 hover:text-ink hover:bg-black/5 after:hidden"
                  aria-label="Close actions"
                >
                  <X className="w-4 h-4" />
                </ShadButton>
              </div>
              <div className="px-4 pb-4 flex flex-col gap-2 [&_button]:min-h-[48px] [&_a]:min-h-[48px]">
                {actions}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
