/**
 * TurnStratum — shared disclosure primitive for the Director Turn Ledger.
 * One accordion language for reasoning / actions / sources strata:
 * ShadButton header, aria-expanded + region semantics, chevron rotation,
 * reduced-motion-safe expand, and per-kind localStorage memory.
 */
import React, { useCallback, useEffect, useId, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { WL_DIRECTOR_CLASSES } from "../../lib/wireline-director-design";
import { ShadButton } from "../ui/shadcn/ShadButton";

export type TurnStratumKind = "reasoning" | "actions" | "sources";

const STORAGE_PREFIX = "wl-director-stratum:";

export function loadStratumPreference(kind: TurnStratumKind): boolean | null {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${kind}`);
    if (raw === "open") return true;
    if (raw === "closed") return false;
  } catch {
    /* private mode / blocked storage — fall back to defaults */
  }
  return null;
}

export function saveStratumPreference(kind: TurnStratumKind, open: boolean): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${kind}`, open ? "open" : "closed");
  } catch {
    /* best-effort */
  }
}

export interface TurnStratumProps {
  kind: TurnStratumKind;
  icon: React.ReactNode;
  label: string;
  /** Mono badge next to the label (duration, counts). */
  badge?: React.ReactNode;
  /** One-line digest shown while collapsed. */
  summary?: string;
  /** Controlled open state — overrides internal/persisted state when provided. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  /** Deep-analysis turns get the amber left-border treatment. */
  deep?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function TurnStratum({
  kind,
  icon,
  label,
  badge,
  summary,
  open,
  onOpenChange,
  defaultOpen = false,
  deep = false,
  className,
  children,
}: TurnStratumProps) {
  const reduceMotion = useReducedMotion();
  const regionId = useId();
  const [internalOpen, setInternalOpen] = useState<boolean>(
    () => loadStratumPreference(kind) ?? defaultOpen,
  );
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  // Keep internal state in sync when a controlled parent flips us.
  useEffect(() => {
    if (isControlled) setInternalOpen(open);
  }, [isControlled, open]);

  const handleToggle = useCallback(() => {
    const next = !isOpen;
    if (!isControlled) setInternalOpen(next);
    saveStratumPreference(kind, next);
    onOpenChange?.(next);
  }, [isOpen, isControlled, kind, onOpenChange]);

  return (
    <div
      className={cn(
        WL_DIRECTOR_CLASSES.turnStratum,
        deep && WL_DIRECTOR_CLASSES.turnStratumDeep,
        className,
      )}
    >
      <ShadButton
        type="button"
        variant="ghost"
        disableAnimations
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls={regionId}
        className={cn(WL_DIRECTOR_CLASSES.turnStratumHeader, "group")}
      >
        <span aria-hidden className="shrink-0 flex items-center justify-center">
          {icon}
        </span>
        <span className="wl-label text-brand/70 font-medium shrink-0">{label}</span>
        {badge}
        {!isOpen && summary && (
          <span className="flex-1 min-w-0 text-left wl-micro-meta--muted truncate ml-1">
            {summary}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "w-3 h-3 text-muted/50 ml-auto shrink-0 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </ShadButton>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={regionId}
            role="region"
            aria-label={label}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
