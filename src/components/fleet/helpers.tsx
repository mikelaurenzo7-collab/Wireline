/**
 * Role metadata for agent roster surfaces (Insights leaderboard). The `tw`
 * object holds Tailwind classes pre-composed so callers don't string-concat
 * color stems at render time. Purple + cream family only.
 */
const ROLE_TW = {
  brand: {
    bg: "bg-brand/10",
    text: "text-brand",
    border: "border-brand/25",
    dot: "bg-brand",
  },
  brandDeep: {
    bg: "bg-brand-deep/10",
    text: "text-brand-deep",
    border: "border-brand-deep/25",
    dot: "bg-brand-deep",
  },
  brandSoft: {
    bg: "bg-brand/8",
    text: "text-brand",
    border: "border-brand/20",
    dot: "bg-brand/70",
  },
  success: {
    bg: "wl-status-success",
    text: "wl-text-success",
    border: "border-[color-mix(in_srgb,var(--wireline-color-status-success)_25%,transparent)]",
    dot: "bg-brand",
  },
  critical: {
    bg: "bg-rose-500/10",
    text: "text-rose-600",
    border: "border-rose-500/25",
    dot: "bg-rose-500",
  },
} as const;

export const AGENT_ROLES = [
  {
    value: "sales",
    label: "Sales",
    description: "Closes deals and drives revenue",
    color: "brand",
    tw: ROLE_TW.brand,
  },
  {
    value: "customer_service",
    label: "Customer Service",
    description: "Handles inbound issues and support",
    color: "brandSoft",
    tw: ROLE_TW.brandSoft,
  },
  {
    value: "scheduler",
    label: "Scheduler",
    description: "Books appointments and manages calendars",
    color: "brandDeep",
    tw: ROLE_TW.brandDeep,
  },
  {
    value: "collections",
    label: "Collections",
    description: "Handles payment follow-ups and recovery",
    color: "critical",
    tw: ROLE_TW.critical,
  },
  {
    value: "technical_support",
    label: "Technical Support",
    description: "Diagnoses and resolves technical issues",
    color: "brandSoft",
    tw: ROLE_TW.brandSoft,
  },
  {
    value: "lead_qualifier",
    label: "Lead Qualifier",
    description: "Screens and scores inbound prospects",
    color: "brandDeep",
    tw: ROLE_TW.brandDeep,
  },
  {
    value: "receptionist",
    label: "Receptionist",
    description: "Routes calls and creates first impressions",
    color: "brandSoft",
    tw: ROLE_TW.brandSoft,
  },
  {
    value: "personal_assistant",
    label: "Personal Assistant",
    description: "Protects principal time and handles personal logistics",
    color: "brandDeep",
    tw: ROLE_TW.brandDeep,
  },
  {
    value: "marketing",
    label: "Marketing",
    description: "Nurtures prospects and runs campaigns",
    color: "brand",
    tw: ROLE_TW.brand,
  },
] as const;

export type RoleValue = (typeof AGENT_ROLES)[number]["value"];
