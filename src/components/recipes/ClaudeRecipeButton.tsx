/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
/**
 * Inline button that opens a recipe modal pre-filled with context.
 *
 * Usage:
 *   <ClaudeRecipeButton recipe="brief" agentId="..." />
 */

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { RECIPE_META, type Recipe } from "./types";
import { RecipeModal } from "./RecipeModal";

export function ClaudeRecipeButton({
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
      "px-4 py-2.5 rounded-full glass border border-brand/30 text-[11px] uppercase tracking-[0.3em] text-brand hover:bg-brand/10 hover:border-brand/60 transition-all flex items-center gap-2",
    ghost:
      "px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.3em] text-muted hover:text-brand transition-colors flex items-center gap-1.5",
    compact:
      "w-9 h-9 rounded-full glass border border-brand/30 flex items-center justify-center text-brand hover:bg-brand/10 transition-all",
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(buttonStyles[variant], className)}
        title={meta.title}
      >
        <Sparkles className="w-3.5 h-3.5" />
        {variant !== "compact" && (label ?? meta.title)}
      </button>
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
