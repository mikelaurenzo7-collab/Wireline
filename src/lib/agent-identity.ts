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

export function normalizeFaceSeed(seed: string | null | undefined): string {
  return (seed || "agent").trim().replace(/\s+/g, " ") || "agent";
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
