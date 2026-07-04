/**
 * Agent identity policy.
 *
 * This is the provider-agnostic identity layer that sits under the rendered
 * SVG face today and the live video presenter slot next. The UI should speak
 * in Wireline terms; providers such as HeyGen, Tavus, D-ID, or an internal
 * renderer stay implementation details behind this catalog.
 */
export type Skin = { base: string; shade: string };
export type Ground = [string, string];
export type HairStyle = "crop" | "bob" | "bun" | "waves" | "fade" | "sweep";

// Warm, brand-harmonized skin tones — deliberately cohesive, not random clip-art.
export const AGENT_FACE_SKINS: Skin[] = [
  { base: "#E7B48A", shade: "#C98F63" },
  { base: "#C88A5E", shade: "#A66B41" },
  { base: "#9A6842", shade: "#7C4F30" },
  { base: "#F0C9A6", shade: "#D6A57C" },
  { base: "#6E4A32", shade: "#553827" },
  { base: "#D89C6E", shade: "#B4774A" },
];

// Backgrounds pull from the dark brand palette — patina, copper, ink.
export const AGENT_FACE_GROUNDS: Ground[] = [
  ["#1E3A30", "#132420"],
  ["#3A2A1B", "#221812"],
  ["#22322C", "#15201C"],
  ["#33261A", "#1E1710"],
  ["#26302E", "#161d1b"],
];

export const AGENT_FACE_HAIR = ["#241C15", "#3B2A1C", "#12100C", "#4A3524", "#5B4A3A", "#2A2320"];
export const AGENT_FACE_HAIR_STYLES: HairStyle[] = ["crop", "bob", "bun", "waves", "fade", "sweep"];

const AGENT_FACE_ACCENTS = [
  "var(--wireline-color-action-secondary-default, #D4823F)",
  "var(--wireline-color-action-primary-default, #5BA98A)",
];

export type AgentFaceConfig = {
  skin: Skin;
  ground: Ground;
  hair: string;
  hairStyle: HairStyle;
  accent: string;
};

export type AgentIdentityPersonaId =
  | "front_desk"
  | "concierge_scheduler"
  | "revenue_operator"
  | "support_specialist"
  | "private_operator";

export type VideoPresenterProviderId = "heygen" | "tavus" | "d-id" | "simli" | "synthetic";

export type AgentIdentityPersona = {
  id: AgentIdentityPersonaId;
  label: string;
  shortLabel: string;
  defaultName: string;
  microcopy: string;
  promptDirective: string;
};

export type VideoPresenterPolicy = {
  providerPreference: VideoPresenterProviderId;
  status: "not_configured" | "ready" | "disabled" | "error";
  headline: string;
  description: string;
  consentRequired: boolean;
  fallback: "agent_face";
};

export type AgentIdentityPreview = {
  seed: string;
  persona: AgentIdentityPersona;
  video: VideoPresenterPolicy;
};

export const AGENT_IDENTITY_PERSONAS: Record<AgentIdentityPersonaId, AgentIdentityPersona> = {
  front_desk: {
    id: "front_desk",
    label: "Front Desk",
    shortLabel: "Warm operator",
    defaultName: "Front Desk",
    microcopy: "Greets, routes, books, and hands off cleanly.",
    promptDirective:
      "Sound calm, prepared, and accountable. Keep answers brief, confirm next steps, and hand off urgent callers without drama.",
  },
  concierge_scheduler: {
    id: "concierge_scheduler",
    label: "Scheduler",
    shortLabel: "Calendar pro",
    defaultName: "Sarah",
    microcopy: "Turns loose requests into booked time.",
    promptDirective:
      "Sound helpful and precise. Ask only for missing scheduling details, confirm the time plainly, and protect the user's calendar.",
  },
  revenue_operator: {
    id: "revenue_operator",
    label: "Sales Concierge",
    shortLabel: "Lead qualifier",
    defaultName: "Liam",
    microcopy: "Qualifies, captures intent, and routes hot leads.",
    promptDirective:
      "Sound sharp and commercially aware. Qualify fit quickly, capture buying intent, and escalate high-value prospects.",
  },
  support_specialist: {
    id: "support_specialist",
    label: "Support Desk",
    shortLabel: "Issue resolver",
    defaultName: "Support Desk",
    microcopy: "Finds the issue, logs it, and closes the loop.",
    promptDirective:
      "Sound steady and useful. Triage the issue, gather exact facts, explain next steps, and avoid overpromising.",
  },
  private_operator: {
    id: "private_operator",
    label: "Private Assistant",
    shortLabel: "Discreet assistant",
    defaultName: "Sarah",
    microcopy: "Answers unknowns and briefs you privately.",
    promptDirective:
      "Sound discreet, concise, and protective of the user's time. Take clear messages and never expose private context unnecessarily.",
  },
};

export const VIDEO_PRESENTER_PROVIDERS: Record<
  VideoPresenterProviderId,
  { label: string; supportsLive: boolean; consentRequired: boolean; fallback: "agent_face" }
> = {
  heygen: { label: "HeyGen", supportsLive: true, consentRequired: true, fallback: "agent_face" },
  tavus: { label: "Tavus", supportsLive: true, consentRequired: true, fallback: "agent_face" },
  "d-id": { label: "D-ID", supportsLive: true, consentRequired: true, fallback: "agent_face" },
  simli: { label: "Simli", supportsLive: true, consentRequired: true, fallback: "agent_face" },
  synthetic: { label: "Wireline SVG", supportsLive: false, consentRequired: false, fallback: "agent_face" },
};

// Stable FNV-1a string hash → deterministic face selection.
export function stableAgentHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function normalizeFaceSeed(seed: string | null | undefined): string {
  return (seed || "agent").trim().replace(/\s+/g, " ") || "agent";
}

export function faceConfigFor(seed: string): AgentFaceConfig {
  const h = stableAgentHash(normalizeFaceSeed(seed));
  return {
    skin: AGENT_FACE_SKINS[h % AGENT_FACE_SKINS.length],
    ground: AGENT_FACE_GROUNDS[(h >>> 3) % AGENT_FACE_GROUNDS.length],
    hair: AGENT_FACE_HAIR[(h >>> 6) % AGENT_FACE_HAIR.length],
    hairStyle: AGENT_FACE_HAIR_STYLES[(h >>> 9) % AGENT_FACE_HAIR_STYLES.length],
    accent: AGENT_FACE_ACCENTS[(h >>> 12) % AGENT_FACE_ACCENTS.length],
  };
}

export function personaForRole(
  role: string | null | undefined,
  isBusinessAgent = false,
): AgentIdentityPersona {
  const normalized = (role || "").trim().toLowerCase();
  if (!isBusinessAgent) return AGENT_IDENTITY_PERSONAS.private_operator;
  if (normalized === "sales" || normalized === "sdr") return AGENT_IDENTITY_PERSONAS.revenue_operator;
  if (normalized === "scheduler" || normalized === "appointment_scheduler")
    return AGENT_IDENTITY_PERSONAS.concierge_scheduler;
  if (normalized === "customer_service" || normalized === "support")
    return AGENT_IDENTITY_PERSONAS.support_specialist;
  return AGENT_IDENTITY_PERSONAS.front_desk;
}

export function buildAgentIdentityPreview(input: {
  id?: string | null;
  name?: string | null;
  role?: string | null;
  faceId?: string | null;
  isBusinessAgent?: boolean;
}): AgentIdentityPreview {
  const persona = personaForRole(input.role, input.isBusinessAgent === true);
  const seed = normalizeFaceSeed(input.faceId || input.name || input.id || persona.defaultName);
  const providerPreference: VideoPresenterProviderId = input.isBusinessAgent ? "heygen" : "synthetic";
  const provider = VIDEO_PRESENTER_PROVIDERS[providerPreference];

  return {
    seed,
    persona,
    video: {
      providerPreference,
      status: "not_configured",
      headline: input.isBusinessAgent ? "Live video slot ready" : "Private avatar identity",
      description: input.isBusinessAgent
        ? "Prepared for a consented live presenter while the face remains the fallback."
        : "Deterministic face now; live video stays off for personal agents by default.",
      consentRequired: provider.consentRequired,
      fallback: provider.fallback,
    },
  };
}
