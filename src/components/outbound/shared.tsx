/**
 * Outbound domain — shared constants and types.
 * Extracted from the monolithic OutboundDialer.tsx.
 */

export type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  danger?: boolean;
  confirmLabel?: string;
};

export const CLOSED_CONFIRM: ConfirmState = {
  open: false,
  title: "",
  message: "",
  onConfirm: () => {},
};

/** Analytics outcome bar fill — brand/signal/destructive tokens only */
export function campaignOutcomeBarClass(status: string): string {
  if (status?.includes("Blocked")) return "bg-amber-500";
  if (status === "Failed" || status?.includes("Fail")) return "bg-destructive";
  if (status === "Completed") return "bg-[var(--wl-signal)]";
  if (status === "Queued") return "bg-brand/60";
  return "bg-muted-foreground/35";
}

export const CAMPAIGN_STATUS: Record<
  string,
  { text: string; bg: string; border: string; iconBorder: string }
> = {
  draft: {
    text: "text-muted",
    bg: "bg-black/5",
    border: "border-white/10",
    iconBorder: "border-white/8",
  },
  active: {
    text: "wl-text-success",
    bg: "wl-status-success",
    border: "border-[color-mix(in_srgb,var(--wl-signal)_30%,transparent)]",
    iconBorder: "border-[color-mix(in_srgb,var(--wl-signal)_30%,transparent)]",
  },
  paused: {
    text: "text-amber-600",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    iconBorder: "border-amber-500/30",
  },
  completed: {
    text: "text-brand",
    bg: "bg-brand/10",
    border: "border-brand/30",
    iconBorder: "border-brand/30",
  },
};
