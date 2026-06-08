import React, { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ShadButton } from "./ui/shadcn/ShadButton";

interface HelpTooltipProps {
  content: string;
  title?: string;
  placement?: "top" | "bottom" | "left" | "right";
  children?: React.ReactNode;
}

const PLACEMENT_CLASSES: Record<string, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

const PLACEMENT_INITIAL: Record<string, { y?: number; x?: number }> = {
  top: { y: 4 },
  bottom: { y: -4 },
  left: { x: 4 },
  right: { x: -4 },
};

const TOOLTIP_HEIGHT_GUARD = 120;

export function HelpTooltip({ content, title, placement = "top", children }: HelpTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [effectivePlacement, setEffectivePlacement] = useState(placement);
  const triggerRef = useRef<HTMLSpanElement>(null);

  // Viewport-aware placement: when the requested placement is "top" but the
  // trigger sits near the top edge (sticky headers, page tops), flip to
  // "bottom" so the tooltip doesn't get clipped above the visible area.
  // Mirror for "bottom" near the viewport bottom. This is the fix for the
  // "tab popouts get cut off" bug.
  useEffect(() => {
    if (!visible || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    if (placement === "top" && rect.top < TOOLTIP_HEIGHT_GUARD) {
      setEffectivePlacement("bottom");
    } else if (placement === "bottom" && window.innerHeight - rect.bottom < TOOLTIP_HEIGHT_GUARD) {
      setEffectivePlacement("top");
    } else {
      setEffectivePlacement(placement);
    }
  }, [visible, placement]);

  const initial = PLACEMENT_INITIAL[effectivePlacement];

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children ?? (
        <ShadButton
          type="button"
          disableAnimations
          variant="outline"
          size="icon"
          aria-label="Help"
          className="w-4 h-4 min-h-0 min-w-0 h-4 rounded-full wl-micro-meta--muted border-white/20 hover:border-brand/40 hover:text-brand after:hidden"
        >
          ?
        </ShadButton>
      )}

      <AnimatePresence>
        {visible && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, scale: 0.92, ...initial }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.92, ...initial }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={`absolute z-[200] max-w-xs pointer-events-none ${PLACEMENT_CLASSES[effectivePlacement]}`}
          >
            <div className="wl-panel-elevated rounded-md border px-3 py-2 shadow-xl wl-help-tooltip-surface">
              {title && (
                <p className="wl-label font-semibold text-ink mb-1 leading-tight">{title}</p>
              )}
              <p className="text-xs text-ink/70 leading-relaxed whitespace-normal">{content}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
