import React, { useState, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";

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

export function HelpTooltip({
  content,
  title,
  placement = "top",
  children,
}: HelpTooltipProps) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const initial = PLACEMENT_INITIAL[placement];

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
        <button
          type="button"
          aria-label="Help"
          className="w-4 h-4 rounded-full border border-white/20 text-muted text-[9px] flex items-center justify-center hover:border-brand/40 hover:text-brand transition-all focus:outline-none focus:border-brand/60"
        >
          ?
        </button>
      )}

      <AnimatePresence>
        {visible && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, scale: 0.92, ...initial }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.92, ...initial }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={`absolute z-[200] max-w-xs pointer-events-none ${PLACEMENT_CLASSES[placement]}`}
          >
            <div
              className="glass-elevated rounded-lg border px-3 py-2 shadow-xl"
              style={{
                borderColor: "rgba(10, 200, 212, 0.20)",
                boxShadow: "0 1px 0 rgba(255,255,255,0.9) inset, 0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(10,200,212,0.06)",
              }}
            >
              {title && (
                <p className="text-[10px] font-semibold text-ink mb-1 leading-tight">{title}</p>
              )}
              <p className="text-xs text-ink/70 leading-relaxed whitespace-normal">{content}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

interface HelpBadgeProps {
  label: string;
  help: string;
  placement?: "top" | "bottom" | "left" | "right";
}

export function HelpBadge({ label, help, placement = "top" }: HelpBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <HelpTooltip content={help} placement={placement} />
    </span>
  );
}
