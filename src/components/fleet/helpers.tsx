/**
 * Fleet helpers — extracted from FleetSettings.tsx as part of the
 * god-file slicing pass (May 2026 audit). These are pure
 * presentational utilities + constants with no shared state.
 *
 * Why a dedicated `components/fleet/` directory:
 *   FleetSettings.tsx is 2K+ LOC. Slicing it safely needs a clear
 *   home for the children that will be extracted next pass — the
 *   roster list, the agent detail editor, and the role/voice
 *   pickers. Putting helpers here first establishes the pattern.
 *
 * Re-exports stay in FleetSettings.tsx so InsightsView and
 * DeployAgentModal continue importing from there without churn:
 *
 *     // FleetSettings.tsx
 *     export { PREMIUM_VOICES, DEFAULT_VOICE_BY_GENDER, AGENT_ROLES } from "./fleet/helpers";
 *
 * No behavior change. ~230 LOC moved.
 */
import { cn } from "../../lib/utils";

/** Tiny SVG sparkline — renders a 7-value array as a smooth path. */
export function Sparkline({
  data,
  width = 64,
  height = 24,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pts = data.map(
    (v, i) =>
      [(i / (data.length - 1)) * width, height - (v / max) * (height - 2) - 1] as [number, number],
  );
  const d = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id="sp-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8B3FD6" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#8B3FD6" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      <path
        d={d}
        fill="none"
        stroke="url(#sp-grad)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.5" fill="url(#sp-grad)" />
      ))}
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PREMIUM_VOICES catalog — ElevenLabs + OpenAI voices offered in the
// agent deploy modal and the agent editor's voice picker. Curated for
// reception / sales / customer-service archetypes (warm, confident,
// clear). Custom cloned voices land alongside this list at runtime.
// ──────────────────────────────────────────────────────────────────────
export const PREMIUM_VOICES = [
  // 11labs — female
  {
    id: "bIHbv24MWmeRgasZH58o",
    provider: "11labs",
    name: "Rachel (Calm & Professional)",
    gender: "female",
  },
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    provider: "11labs",
    name: "Sarah (Upbeat & Conversational)",
    gender: "female",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    provider: "11labs",
    name: "Sarah Soft (Warm & Approachable)",
    gender: "female",
  },
  {
    id: "XB0fDUnXU5powFXDhCwa",
    provider: "11labs",
    name: "Charlotte (British, Refined)",
    gender: "female",
  },
  // 11labs — male
  {
    id: "TX3LPaxmHKxFdv7VOQHJ",
    provider: "11labs",
    name: "Liam (Confident & Energetic)",
    gender: "male",
  },
  {
    id: "nPczCjzI2devNBz1zQrb",
    provider: "11labs",
    name: "Brian (Deep & Narrative)",
    gender: "male",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    provider: "11labs",
    name: "Adam (Authoritative & Warm)",
    gender: "male",
  },
  // OpenAI
  { id: "alloy", provider: "openai", name: "Alex (Neutral & Energetic)", gender: "neutral" },
  { id: "nova", provider: "openai", name: "Nova (Polite & Corporate)", gender: "female" },
  { id: "echo", provider: "openai", name: "Marcus (Authoritative & Warm)", gender: "male" },
  { id: "shimmer", provider: "openai", name: "Chloe (Clear & Articulate)", gender: "female" },
];

/** Default voice id per gender for the quick deploy modal. */
export const DEFAULT_VOICE_BY_GENDER = {
  female: "EXAVITQu4vr4xnSDxMaL", // 11labs Sarah Soft — warm + approachable, broad fit
  male: "TX3LPaxmHKxFdv7VOQHJ", // 11labs Liam — confident + energetic, broad fit
} as const;

// ──────────────────────────────────────────────────────────────────────
// AGENT_ROLES — role metadata. Mirrors ROLE_PERSONALITY_TEMPLATES on
// the server. The `tw` object holds Tailwind classes pre-composed so
// callers don't string-concat color stems at render time.
// ──────────────────────────────────────────────────────────────────────
export const AGENT_ROLES = [
  {
    value: "sales",
    label: "Sales",
    description: "Closes deals and drives revenue",
    color: "amber",
    tw: {
      bg: "bg-amber-500/10",
      text: "text-amber-600",
      border: "border-amber-500/25",
      dot: "bg-amber-500",
    },
  },
  {
    value: "customer_service",
    label: "Customer Service",
    description: "Handles inbound issues and support",
    color: "emerald",
    tw: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-600",
      border: "border-emerald-500/25",
      dot: "bg-emerald-500",
    },
  },
  {
    value: "scheduler",
    label: "Scheduler",
    description: "Books appointments and manages calendars",
    color: "violet",
    tw: {
      bg: "bg-violet-500/10",
      text: "text-violet-600",
      border: "border-violet-500/25",
      dot: "bg-violet-500",
    },
  },
  {
    value: "collections",
    label: "Collections",
    description: "Handles payment follow-ups and recovery",
    color: "rose",
    tw: {
      bg: "bg-rose-500/10",
      text: "text-rose-600",
      border: "border-rose-500/25",
      dot: "bg-rose-500",
    },
  },
  {
    value: "technical_support",
    label: "Technical Support",
    description: "Diagnoses and resolves technical issues",
    color: "blue",
    tw: {
      bg: "bg-blue-500/10",
      text: "text-blue-600",
      border: "border-blue-500/25",
      dot: "bg-blue-500",
    },
  },
  {
    value: "lead_qualifier",
    label: "Lead Qualifier",
    description: "Screens and scores inbound prospects",
    color: "orange",
    tw: {
      bg: "bg-amber-500/10",
      text: "text-amber-600",
      border: "border-amber-500/25",
      dot: "bg-amber-500",
    },
  },
  {
    value: "receptionist",
    label: "Receptionist",
    description: "Routes calls and creates first impressions",
    color: "cyan",
    tw: {
      bg: "bg-cyan-500/10",
      text: "text-cyan-600",
      border: "border-cyan-500/25",
      dot: "bg-cyan-500",
    },
  },
  {
    value: "marketing",
    label: "Marketing",
    description: "Nurtures prospects and runs campaigns",
    color: "purple",
    tw: {
      bg: "bg-purple-500/10",
      text: "text-purple-600",
      border: "border-purple-500/25",
      dot: "bg-purple-500",
    },
  },
] as const;

export type RoleValue = (typeof AGENT_ROLES)[number]["value"];

/** Look up a role's metadata; falls back to customer_service. */
export function getRoleMeta(role?: string) {
  return AGENT_ROLES.find((r) => r.value === role) ?? AGENT_ROLES[1];
}

/** Small badge for the role in lists and detail views. */
export function RoleBadge({ role, size = "sm" }: { role?: string; size?: "xs" | "sm" }) {
  const meta = getRoleMeta(role);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border leading-none",
        meta.tw.bg,
        meta.tw.text,
        meta.tw.border,
        size === "xs"
          ? "text-[8px] uppercase tracking-[0.22em] px-1.5 py-0.5"
          : "text-[9px] uppercase tracking-[0.22em] px-2 py-0.5",
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", meta.tw.dot)} />
      {meta.label}
    </span>
  );
}
