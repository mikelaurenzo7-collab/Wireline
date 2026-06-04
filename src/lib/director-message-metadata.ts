/**
 * Structured Director reply metadata — persisted alongside message content
 * so proposals, suggestions, and creative approvals survive reload.
 */
import type { DirectorIntegrationJob, DirectorProposedAction } from "./director-fleet-plan";
import type { ProposedAction, ProposedChange, ProposedToolToggle } from "./workspace-planner";

export type DirectorSuggestionKind =
  | "create_agent"
  | "focus_agent"
  | "view_ops"
  | "open_training"
  | "open_insights";

export interface DirectorSuggestionMeta {
  kind: DirectorSuggestionKind;
  label: string;
  agentId?: string;
}

export interface DirectorApprovalMeta {
  callId: string;
  name: "generate_logo" | "vectorize_logo" | "brand_pack_export";
  label: string;
  requiresApproval: boolean;
  approved?: boolean;
  input: Record<string, unknown>;
}

export interface DirectorPreviewMeta {
  conceptId: string;
  title: string;
  rationale: string;
  previewDataUrl: string;
  svg?: string;
}

export interface DirectorProposalsMeta {
  changes: ProposedChange[];
  toolToggles: ProposedToolToggle[];
  actions: (ProposedAction | DirectorProposedAction)[];
  integrationJobs: DirectorIntegrationJob[];
}

export interface DirectorMessageMetadata {
  suggestions?: DirectorSuggestionMeta[];
  approvals?: DirectorApprovalMeta[];
  previews?: DirectorPreviewMeta[];
  clarifyingQuestions?: string[];
  researchSources?: { title?: string; uri?: string }[];
  proposals?: DirectorProposalsMeta;
  model?: "sonnet" | "opus";
  thinkingDurationMs?: number;
  coachAgentId?: string;
  coachAgentName?: string;
  mode?: "fleet" | "coach";
  resolved?: Record<string, "done" | "dismissed">;
}

export function packDirectorMetadata(
  meta: DirectorMessageMetadata,
): Record<string, unknown> | null {
  const hasContent =
    (meta.suggestions?.length ?? 0) > 0 ||
    (meta.approvals?.length ?? 0) > 0 ||
    (meta.previews?.length ?? 0) > 0 ||
    (meta.clarifyingQuestions?.length ?? 0) > 0 ||
    (meta.researchSources?.length ?? 0) > 0 ||
    (meta.proposals &&
      (meta.proposals.changes.length > 0 ||
        meta.proposals.toolToggles.length > 0 ||
        meta.proposals.actions.length > 0 ||
        meta.proposals.integrationJobs.length > 0)) ||
    meta.model ||
    meta.thinkingDurationMs ||
    meta.coachAgentId ||
    meta.coachAgentName ||
    meta.mode ||
    (meta.resolved && Object.keys(meta.resolved).length > 0);

  if (!hasContent) return null;
  return meta as Record<string, unknown>;
}

export function parseDirectorMetadata(raw: unknown): DirectorMessageMetadata {
  if (!raw || typeof raw !== "object") return {};
  return raw as DirectorMessageMetadata;
}

export function buildDirectorMetadataFromTurn(
  data: Record<string, unknown>,
): DirectorMessageMetadata {
  const changes = Array.isArray(data.changes) ? (data.changes as ProposedChange[]) : [];
  const toolToggles = Array.isArray(data.toolToggles)
    ? (data.toolToggles as ProposedToolToggle[])
    : [];
  const actions = Array.isArray(data.actions)
    ? (data.actions as (ProposedAction | DirectorProposedAction)[])
    : [];
  const integrationJobs = Array.isArray(data.integrationJobs)
    ? (data.integrationJobs as DirectorIntegrationJob[])
    : [];
  const hasProposals =
    changes.length > 0 ||
    toolToggles.length > 0 ||
    actions.length > 0 ||
    integrationJobs.length > 0;

  return {
    suggestions: Array.isArray(data.suggestions)
      ? (data.suggestions as DirectorSuggestionMeta[])
      : undefined,
    approvals: Array.isArray(data.approvals)
      ? (data.approvals as DirectorApprovalMeta[])
      : undefined,
    previews: Array.isArray(data.previews) ? (data.previews as DirectorPreviewMeta[]) : undefined,
    clarifyingQuestions: Array.isArray(data.clarifyingQuestions)
      ? (data.clarifyingQuestions as string[])
      : undefined,
    researchSources: Array.isArray(data.researchSources)
      ? (data.researchSources as { title?: string; uri?: string }[])
      : undefined,
    proposals: hasProposals ? { changes, toolToggles, actions, integrationJobs } : undefined,
    model: (data.model as "sonnet" | "opus") || undefined,
    thinkingDurationMs: (data.thinkingDurationMs as number) || undefined,
    coachAgentId: (data.focusAgentId as string) || (data.coachAgentId as string) || undefined,
    coachAgentName: (data.focusAgentName as string) || (data.coachAgentName as string) || undefined,
    mode: (data.mode as "fleet" | "coach") || undefined,
  };
}

export function hydrateDirectorMessage<T extends { role: string; metadata?: unknown }>(
  message: T & { content: string; reasoning?: string | null },
): T & DirectorMessageMetadata & { proposals?: DirectorProposalsMeta; reasoning?: string } {
  const meta = parseDirectorMetadata(message.metadata);
  return {
    ...message,
    ...meta,
    reasoning: message.reasoning || undefined,
    proposals: meta.proposals,
  };
}
