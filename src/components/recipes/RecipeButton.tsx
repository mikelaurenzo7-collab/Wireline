/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
/**
 * Inline button that opens a recipe modal pre-filled with context.
 *
 * Usage:
 *   <RecipeButton recipe="brief" agentId="..." />
 */

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { RECIPE_META, type Recipe } from "./types";
import { RecipeModal } from "./RecipeModal";

export function RecipeButton({
  recipe,
  agentId,
  threadId,
  callId,
  initial,
  label,
  variant = "default",
  className,
}: {
  recipe: Recipe;
  agentId?: string;
  threadId?: string;
  callId?: string;
  initial?: Record<string, any>;
  label?: string;
  variant?: "default" | "ghost" | "compact";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const meta = RECIPE_META[recipe];

  const buttonStyles = {
    default:
      "rounded-full border-brand/30 text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.3em] text-brand hover:bg-brand/10 hover:border-brand/60",
    ghost: "rounded-full wl-label-muted hover:text-brand h-auto px-3 py-1.5",
    compact: "w-9 h-9 rounded-full border-brand/30 text-brand hover:bg-brand/10 after:hidden",
  };

  return (
    <>
      <ShadButton
        type="button"
        disableAnimations
        variant={variant === "ghost" ? "ghost" : "outline"}
        size={variant === "compact" ? "icon" : "sm"}
        onClick={() => setOpen(true)}
        className={cn(buttonStyles[variant], className)}
        title={meta.title}
      >
        <Sparkles className="w-3.5 h-3.5" />
        {variant !== "compact" && (label ?? meta.title)}
      </ShadButton>
      <AnimatePresence>
        {open && (
          <RecipeModal
            recipe={recipe}
            agentId={agentId}
            threadId={threadId}
            callId={callId}
            initial={initial}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
