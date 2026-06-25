import { WL_DIRECTOR_CLASSES } from "../../lib/wireline-design-system";
import { motion, useReducedMotion } from "motion/react";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Checkbox } from "../ui/shadcn/Checkbox";
import { ShadButton } from "../ui/shadcn/ShadButton";

const TONE_CLASSES: Record<string, string> = {
  brand: "border-brand/25 bg-brand/[0.04]",
  emerald:
    "border-[color-mix(in_srgb,var(--wireline-color-status-success)_25%,transparent)] bg-brand/[0.04]",
  amber: "border-brand/30 bg-brand/[0.05]",
};

const TONE_ICON_CLASSES: Record<string, string> = {
  brand: "bg-brand/10 text-brand",
  emerald: "bg-brand/12 wl-text-success",
  amber: "bg-brand/12 text-brand-deep",
};

export interface ProposalCardProps {
  icon: React.ReactNode;
  tone: "brand" | "emerald" | "amber";
  title: string;
  detail?: string;
  stepLabel?: string;
  state?: "done" | "dismissed";
  busy: boolean;
  busyLabel?: string;
  approveLabel: string;
  consent?: { checked: boolean; onChange: (v: boolean) => void };
  onApprove: () => void;
  onDismiss: () => void;
}

export default function ProposalCard({
  icon,
  tone,
  title,
  detail,
  stepLabel,
  state,
  busy,
  busyLabel,
  approveLabel,
  consent,
  onApprove,
  onDismiss,
}: ProposalCardProps) {
  const reduceMotion = useReducedMotion();
  const approveDisabled = busy || (!!consent && !consent.checked);
  const isPending = !state;

  return (
    <motion.div
      layout
      data-proposal={isPending ? "true" : undefined}
      data-resolved={state ? "true" : undefined}
      whileHover={!state && !reduceMotion ? { scale: 1.01 } : {}}
      whileTap={!state && !reduceMotion ? { scale: 0.99 } : {}}
      animate={
        state ? { scale: 0.98, opacity: state === "dismissed" ? 0.5 : 1 } : { scale: 1, opacity: 1 }
      }
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        WL_DIRECTOR_CLASSES.proposalCard,
        WL_DIRECTOR_CLASSES.proposalRail,
        "rounded-md border px-3 py-2.5 pl-4 text-foreground transition-all duration-200",
        state === "dismissed" ? "border-white/8 bg-black/3" : TONE_CLASSES[tone],
        isPending && "hover:shadow-md cursor-default",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 shrink-0 flex w-6 h-6 items-center justify-center rounded-md",
            state === "dismissed" ? "bg-black/5 text-muted/60" : TONE_ICON_CLASSES[tone],
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          {stepLabel && (
            <p className={cn(WL_DIRECTOR_CLASSES.microLabel, "text-brand/70 mb-0.5")}>
              {stepLabel}
            </p>
          )}
          <p className="text-[12px] font-medium leading-snug">{title}</p>
          {detail && (
            <p className="mt-0.5 text-[11px] text-muted whitespace-pre-wrap break-words leading-relaxed">
              {detail}
            </p>
          )}
        </div>
      </div>
      {busy && (
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          className="mt-2 h-0.5 rounded-full bg-brand/20 overflow-hidden origin-left"
        >
          <motion.div
            className="h-full bg-brand rounded-full wl-w-40pct"
            animate={reduceMotion ? undefined : { x: ["-100%", "100%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      )}
      {state ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "mt-2 flex items-center gap-1.5 wl-label",
            state === "done" ? "wl-text-success" : "text-muted/70",
          )}
        >
          {state === "done" ? (
            <>
              <Check className="w-3 h-3" />
              <span>Successfully executed</span>
            </>
          ) : (
            <span>Dismissed</span>
          )}
        </motion.div>
      ) : (
        <>
          {consent && (
            <label className="mt-2.5 flex items-start gap-2 text-[11px] text-muted leading-snug cursor-pointer">
              <Checkbox
                checked={consent.checked}
                onChange={(e) => consent.onChange(e.target.checked)}
                className="mt-0.5 accent-brand"
              />
              <span>
                I confirm we have prior express written consent to call this number (TCPA).
              </span>
            </label>
          )}
          <div className="mt-2.5 flex items-center gap-2">
            <ShadButton
              type="button"
              size="sm"
              onClick={onApprove}
              disabled={approveDisabled}
              disableAnimations
              className="touch-press hover:scale-[1.02] h-8 text-[11px] gap-1.5"
            >
              {busy ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {busyLabel || "Executing…"}
                </>
              ) : (
                <>
                  <Check className="w-3 h-3" />
                  {approveLabel}
                </>
              )}
            </ShadButton>
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              disabled={busy}
              disableAnimations
              className="touch-press hover:scale-[1.02] h-8 text-[11px] text-muted"
            >
              <X className="w-3 h-3" />
              Dismiss
            </ShadButton>
          </div>
        </>
      )}
    </motion.div>
  );
}
