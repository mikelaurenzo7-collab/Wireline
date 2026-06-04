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

export const CAMPAIGN_STATUS: Record<
  string,
  { text: string; bg: string; border: string; iconBorder: string }
> = {
  draft: {
    text: "text-muted",
    bg: "bg-black/5",
    border: "border-black/10",
    iconBorder: "border-black/8",
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
    text: "text-violet-600",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    iconBorder: "border-violet-500/30",
  },
};
