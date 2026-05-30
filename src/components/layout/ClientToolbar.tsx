import type { ReactNode } from "react";
import { useState, useEffect, useRef } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "../../lib/utils";

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
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Page actions"
              className="md:hidden w-11 h-11 flex items-center justify-center text-muted border border-black/8 bg-paper/80 active:bg-black/5"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {open && actions && (
        <div className="fixed inset-0 z-[80] md:hidden">
          <button
            type="button"
            aria-label="Close actions"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            ref={sheetRef}
            className="absolute bottom-0 inset-x-0 glass-elevated border-t border-black/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-eyebrow">Actions</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>
            <div className="flex flex-col gap-2">{actions}</div>
          </div>
        </div>
      )}
    </>
  );
}
