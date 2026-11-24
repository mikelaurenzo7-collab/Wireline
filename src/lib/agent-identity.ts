/**
 * Agent identity policy.
 *
 * This is the provider-agnostic identity layer that gives every agent a stable
 * in-app avatar for recognition across Studio, training, analytics, call logs,
 * and mobile surfaces. These deterministic SVG badges are not video presenters;
 * polished human/character Presence remains a separate, curated catalog layer.
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

// Backgrounds pull from the dark brand palette — violet, graphite, obsidian.
export const AGENT_FACE_GROUNDS: Ground[] = [
  ["#241B3D", "#150F26"],
  ["#2E2A3D", "#19161F"],
  ["#231D33", "#141021"],
  ["#2A2735", "#17151E"],
  ["#1F1B2E", "#110E1A"],
];

export const AGENT_FACE_HAIR = ["#241C15", "#3B2A1C", "#12100C", "#4A3524", "#5B4A3A", "#2A2320"];
export const AGENT_FACE_HAIR_STYLES: HairStyle[] = ["crop", "bob", "bun", "waves", "fade", "sweep"];

const AGENT_FACE_ACCENTS = [
  "var(--wireline-color-action-secondary-default, #C7CCD6)",
  "var(--wireline-color-action-primary-default, #A78BFA)",
];

export type AgentFaceConfig = {
  skin: Skin;
  ground: Ground;
  hair: string;
  hairStyle: HairStyle;
  accent: string;
};

export type AgentIdentityPersonaId = "front_desk" | "private_operator";

export type VideoPresenterProviderId =
  "liveavatar" | "heygen" | "tavus" | "d-id" | "simli" | "synthetic";

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
  private_operator: {
    id: "private_operator",
    label: "Personal Concierge",
    shortLabel: "Concierge Bot",
    defaultName: "Sarah",
    microcopy: "Screens callers, books for you, and briefs you privately.",
    promptDirective:
      "Sound discreet, concise, and protective of the principal's time. Take clear messages, book only what you are cleared to book, and never expose private context unnecessarily.",
  },
};

/**
 * `label` is the internal provider name — for admin, logs, and config only.
 * NEVER render `label` in customer-facing UI. Customer surfaces read
 * `surfaceLabel`, which stays in BotBound terms so swapping the underlying
 * engine never changes what a customer sees.
 */
export const VIDEO_PRESENTER_PROVIDERS: Record<
  VideoPresenterProviderId,
  {
    label: string;
    surfaceLabel: string;
    supportsLive: boolean;
    consentRequired: boolean;
    fallback: "agent_face";
  }
> = {
  liveavatar: {
    label: "LiveAvatar",
    surfaceLabel: "Identity badge",
    supportsLive: false,
    consentRequired: false,
    fallback: "agent_face",
  },
  heygen: {
    label: "HeyGen",
    surfaceLabel: "Identity badge",
    supportsLive: false,
    consentRequired: false,
    fallback: "agent_face",
  },
  tavus: {
    label: "Tavus",
    surfaceLabel: "Live video",
    supportsLive: true,
    consentRequired: true,
    fallback: "agent_face",
  },
  "d-id": {
    label: "D-ID",
    surfaceLabel: "Live video",
    supportsLive: true,
    consentRequired: true,
    fallback: "agent_face",
  },
  simli: {
    label: "Simli",
    surfaceLabel: "Live video",
    supportsLive: true,
    consentRequired: true,
    fallback: "agent_face",
  },
  synthetic: {
    label: "BotBound SVG",
    surfaceLabel: "Identity badge",
    supportsLive: false,
    consentRequired: false,
    fallback: "agent_face",
  },
};

// Stable FNV-1a string hash → deterministic in-app badge selection.
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

/**
 * One Bot, two postures. A business account gets the front-desk persona; a
 * personal account gets the private operator, which is privacy-first.
 */
export function personaForAgent(isBusinessAgent = false): AgentIdentityPersona {
  return isBusinessAgent
    ? AGENT_IDENTITY_PERSONAS.front_desk
    : AGENT_IDENTITY_PERSONAS.private_operator;
}

export function buildAgentIdentityPreview(input: {
  id?: string | null;
  name?: string | null;
  faceId?: string | null;
  isBusinessAgent?: boolean;
}): AgentIdentityPreview {
  const persona = personaForAgent(input.isBusinessAgent === true);
  const seed = normalizeFaceSeed(input.faceId || input.name || input.id || persona.defaultName);
  const providerPreference: VideoPresenterProviderId = "synthetic";
  const provider = VIDEO_PRESENTER_PROVIDERS[providerPreference];

  return {
    seed,
    persona,
    video: {
      providerPreference,
      status: "not_configured",
      headline: "Agent identity badge",
      description:
        "Stable in-app avatar for recognition in the Workspace, knowledge, insights, and call logs. Not a video presenter.",
      consentRequired: provider.consentRequired,
      fallback: provider.fallback,
    },
  };
}
