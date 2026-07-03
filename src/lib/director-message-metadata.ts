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

export type DirectorPreviewKind = "logo" | "stitch";

export interface DirectorPreviewMeta {
  conceptId: string;
  title: string;
  rationale: string;
  previewDataUrl: string;
  svg?: string;
  kind?: DirectorPreviewKind;
  htmlDownloadUrl?: string;
  imageDownloadUrl?: string;
  /** Persisted artifact row ids — used to mint fresh signed preview URLs in the UI. */
  htmlArtifactId?: string;
  imageArtifactId?: string;
  deviceType?: "DESKTOP" | "MOBILE" | "TABLET" | "AGNOSTIC";
  renderId?: string;
}

export interface DirectorProposalsMeta {
  changes: ProposedChange[];
  toolToggles: ProposedToolToggle[];
  actions: (ProposedAction | DirectorProposedAction)[];
  integrationJobs: DirectorIntegrationJob[];
}

export type DirectorTurnActionKind = "research" | "tool" | "deep" | "design" | "retry" | "compose";

export type DirectorTurnActionStatus = "running" | "done" | "failed";

/** One entry in the per-turn mission log — what the Director actually did. */
export interface DirectorTurnActionMeta {
  id: string;
  kind: DirectorTurnActionKind;
  label: string;
  detail?: string;
  durationMs?: number;
  status: DirectorTurnActionStatus;
}

export interface DirectorDeliverableArtifactMeta {
  id: string;
  name: string;
  artifactType: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl?: string;
}

export interface DirectorStitchSessionMeta {
  projectId: string;
  screenId: string;
  projectTitle?: string;
  deviceType?: DirectorPreviewMeta["deviceType"];
  renderId?: string;
  userMessage?: string;
}

export type DirectorStitchSessionLookup = Pick<
  DirectorStitchSessionMeta,
  "projectId" | "screenId"
> &
  Partial<Pick<DirectorStitchSessionMeta, "renderId" | "deviceType">>;

export interface DirectorMessageMetadata {
  suggestions?: DirectorSuggestionMeta[];
  approvals?: DirectorApprovalMeta[];
  previews?: DirectorPreviewMeta[];
  clarifyingQuestions?: string[];
  researchSources?: { title?: string; uri?: string }[];
  turnActions?: DirectorTurnActionMeta[];
  deliverableArtifact?: DirectorDeliverableArtifactMeta;
  stitchSession?: DirectorStitchSessionMeta;
  stitchAssetsPending?: boolean;
  proposals?: DirectorProposalsMeta;
  model?: "sonnet" | "opus";
  modelLabel?: string;
  modelProvider?: "wireline" | "openrouter";
  modelId?: string;
  thinkingDurationMs?: number;
  coachAgentId?: string;
  coachAgentName?: string;
  mode?: "Assistants" | "coach";
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
    (meta.turnActions?.length ?? 0) > 0 ||
    Boolean(meta.deliverableArtifact?.id) ||
    Boolean(meta.stitchSession?.projectId) ||
    meta.stitchAssetsPending === true ||
    (meta.proposals &&
      (meta.proposals.changes.length > 0 ||
        meta.proposals.toolToggles.length > 0 ||
        meta.proposals.actions.length > 0 ||
        meta.proposals.integrationJobs.length > 0)) ||
    meta.model ||
    meta.modelLabel ||
    meta.modelProvider ||
    meta.modelId ||
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
    turnActions: Array.isArray(data.turnActions)
      ? (data.turnActions as DirectorTurnActionMeta[])
      : undefined,
    deliverableArtifact:
      data.deliverableArtifact && typeof data.deliverableArtifact === "object"
        ? (data.deliverableArtifact as DirectorDeliverableArtifactMeta)
        : undefined,
    stitchSession:
      data.stitchSession && typeof data.stitchSession === "object"
        ? (data.stitchSession as DirectorStitchSessionMeta)
        : undefined,
    stitchAssetsPending: data.stitchAssetsPending === true ? true : undefined,
    proposals: hasProposals ? { changes, toolToggles, actions, integrationJobs } : undefined,
    model: (data.model as "sonnet" | "opus") || undefined,
    modelLabel: typeof data.modelLabel === "string" ? data.modelLabel : undefined,
    modelProvider:
      data.modelProvider === "wireline" || data.modelProvider === "openrouter"
        ? data.modelProvider
        : undefined,
    modelId: typeof data.modelId === "string" ? data.modelId : undefined,
    thinkingDurationMs: (data.thinkingDurationMs as number) || undefined,
    coachAgentId: (data.focusAgentId as string) || (data.coachAgentId as string) || undefined,
    coachAgentName: (data.focusAgentName as string) || (data.coachAgentName as string) || undefined,
    mode: (data.mode as "Assistants" | "coach") || undefined,
  };
}

export function stitchSessionMatches(
  meta: DirectorMessageMetadata,
  session: DirectorStitchSessionLookup,
): boolean {
  const candidate = meta.stitchSession;
  if (!candidate) return false;
  if (candidate.projectId !== session.projectId || candidate.screenId !== session.screenId) {
    return false;
  }
  if (session.deviceType && candidate.deviceType && candidate.deviceType !== session.deviceType) {
    return false;
  }
  if (session.renderId) return candidate.renderId === session.renderId;
  if (candidate.renderId) return false;
  return true;
}

export function completedStitchPreviewsForSession(
  meta: DirectorMessageMetadata,
  session: DirectorStitchSessionLookup,
): DirectorPreviewMeta[] | null {
  if (!stitchSessionMatches(meta, session)) return null;
  const previews = (meta.previews ?? []).filter(
    (preview) =>
      preview.conceptId === session.screenId &&
      preview.kind === "stitch" &&
      (!session.renderId || preview.renderId === session.renderId) &&
      (!session.deviceType || !preview.deviceType || preview.deviceType === session.deviceType),
  );
  return previews.length > 0 ? previews : null;
}

export function mergeCompletedStitchPreviewMetadata(
  meta: DirectorMessageMetadata,
  session: DirectorStitchSessionLookup,
  previews: DirectorPreviewMeta[],
): DirectorMessageMetadata | null {
  if (!stitchSessionMatches(meta, session) || previews.length === 0) return null;
  const nextPreviews = [
    ...(meta.previews ?? []).filter(
      (preview) =>
        preview.kind !== "stitch" ||
        preview.conceptId !== session.screenId ||
        (session.renderId ? preview.renderId !== session.renderId : Boolean(preview.renderId)) ||
        (session.deviceType && preview.deviceType && preview.deviceType !== session.deviceType),
    ),
    ...previews,
  ];
  const next: DirectorMessageMetadata = {
    ...meta,
    previews: nextPreviews,
    stitchSession: {
      ...(meta.stitchSession ?? {}),
      projectId: session.projectId,
      screenId: session.screenId,
      renderId: session.renderId ?? meta.stitchSession?.renderId,
      deviceType: session.deviceType ?? meta.stitchSession?.deviceType,
    },
  };
  delete next.stitchAssetsPending;
  return next;
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
