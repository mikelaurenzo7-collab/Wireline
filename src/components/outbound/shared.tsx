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
  { textColor: string; bgColor: string; borderColor: string }
> = {
  draft: {
    textColor: "rgba(161,161,170,1)",
    bgColor: "rgba(0,0,0,0.05)",
    borderColor: "rgba(0,0,0,0.10)",
  },
  active: {
    textColor: "#059669",
    bgColor: "rgba(16,185,129,0.10)",
    borderColor: "rgba(16,185,129,0.30)",
  },
  paused: {
    textColor: "#d97706",
    bgColor: "rgba(245,158,11,0.10)",
    borderColor: "rgba(245,158,11,0.30)",
  },
  completed: {
    textColor: "#7c3aed",
    bgColor: "rgba(139,92,246,0.10)",
    borderColor: "rgba(139,92,246,0.30)",
  },
};
