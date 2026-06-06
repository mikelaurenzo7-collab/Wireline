/**
 * DirectorWorkspace — the account-level "manager" chat surface.
 *
 * Mission-control chat: compact thread, inline composer accessories (never
 * overlaying messages), and prominent reasoning + approval cards.
 *
 * The Director sits ABOVE the individual agents: it's always available (even
 * before the operator owns a single agent) and acts as the strategist that
 * helps plan the fleet, decide what agents to hire, and coach them.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  Send,
  Loader2,
  Trash2,
  Plus,
  Bot,
  Activity,
  GraduationCap,
  BarChart3,
  ArrowUpRight,
  Compass,
  ChevronDown,
  FileText,
  Plug,
  Phone,
  MessageCircle,
  SlidersHorizontal,
  Power,
  Mail,
  Search as SearchIcon,
  Palette,
  Download,
  Sparkles,
  LayoutTemplate,
} from "lucide-react";
import { authFetch, DIRECTOR_STITCH_REQUEST_TIMEOUT_MS, readApiJson } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { hydrateAgentsFromFleet, useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { useBranding } from "../contexts/BrandingContext";
import {
  hasConfiguredTenantBranding,
  stitchBrandingFromSnake,
} from "../lib/director-stitch-branding";
import { cn } from "../lib/utils";
import FleetSetupNudge from "./FleetSetupNudge";
import { ThinkingDisplay } from "./ui/ThinkingDisplay";
import type { PipelineStep } from "./ui/LiveTaskPipeline";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { Input } from "./ui/shadcn/Input";
import { Textarea } from "./ui/shadcn/Textarea";
import { useStreamingChat } from "../hooks/useStreamingChat";
import {
  isSubstantiveDirectorPayload,
  isSubstantiveDirectorReply,
  operatorTurnHasDirectorReply,
} from "../lib/director-reply-utils";
import ProposalCard from "./chat/ProposalCard";
import { AGENT_TOOL_CATALOG } from "../lib/agent-capabilities";
import type { ProposedAction, ProposedChange, ProposedToolToggle } from "../lib/workspace-planner";
import type { DirectorIntegrationJob, DirectorProposedAction } from "../lib/director-fleet-plan";
import DirectorLiveSession, {
  advanceLiveStepsForPhase,
  buildDirectorLiveSteps,
  type DirectorLiveStep,
} from "./director/DirectorLiveSession";
import {
  planIntegrationLiveScript,
  startIntegrationLiveSequence,
  buildLiveActionsFromProposals,
  type IntegrationLiveAction,
} from "../lib/integration-live-scripts";
import { DirectorMessageBody } from "./director/DirectorMessageBody";
import { DirectorDeliverableDownload } from "./director/DirectorDeliverableDownload";
import type { DirectorDeliverableArtifactMeta } from "../lib/director-message-metadata";
import { DirectorCapabilityCatalog } from "./director/DirectorCapabilityCatalog";
import { SignalOrbFrame } from "./ui/SignalOrbFrame";
import { DirectorComposerAccessory } from "./director/DirectorComposerAccessory";
import { DirectorComposerContextStrip } from "./director/DirectorComposerContextStrip";
import { DirectorComposerToolbar } from "./director/DirectorComposerToolbar";
import { DirectorUsageIndicator } from "./director/DirectorUsageIndicator";
import { DirectorResearchSources } from "./director/DirectorResearchSources";
import { DirectorStarterPrompts } from "./director/DirectorStarterPrompts";
import DirectorArtifactsPanel, { type DirectorArtifact } from "./director/DirectorArtifactsPanel";
import DirectorStitchPreviewTeaser from "./director/DirectorStitchPreviewTeaser";
import DirectorStitchLiveSession from "./director/DirectorStitchLiveSession";
import { findLatestStitchPreview, isStitchPreview } from "../lib/director-stitch-preview";
import {
  buildStitchPreviewPageUrl,
  stitchPreviewPageUrlIsValid,
} from "../lib/director-stitch-preview-route";
import { wantsStitchMediaRequest } from "../lib/director-stitch-intent";
import { INTEGRATION_STYLES } from "../lib/integration-activities";
import type { ToolIntegration } from "../lib/agent-capabilities";
import {
  DIRECTOR_EMPTY_HERO,
  DIRECTOR_SCENE_BADGES,
  DIRECTOR_CAPABILITY_PILLS,
  DIRECTOR_LOADING_COPY,
  DIRECTOR_COMPOSER_HINTS,
  DIRECTOR_COMPOSER_CONTEXT,
  LIVE_FEED_LABELS,
  WL_APP_CLASSES,
  WIRELINE_STITCH_UI,
  WL_DIRECTOR_CLASSES,
  type ComposerAccessoryKind,
} from "../lib/wireline-director-design";
import { wantsDeepAnalysis } from "../lib/director-deep-analysis";
import {
  DEFAULT_DIRECTOR_MODEL_SELECTION,
  type DirectorChatModelSelection,
} from "../lib/director-model-selection";
import LoadingDots from "./ui/LoadingDots";
import {
  detectDirectorMessageScene,
  type DirectorMessageScene,
} from "../lib/director-message-scene";

type SuggestionKind =
  | "create_agent"
  | "focus_agent"
  | "view_ops"
  | "open_training"
  | "open_insights";

interface DirectorSuggestion {
  kind: SuggestionKind;
  label: string;
  agentId?: string;
}

interface DirectorApproval {
  callId: string;
  name: "generate_logo" | "vectorize_logo" | "brand_pack_export";
  label: string;
  requiresApproval: boolean;
  approved?: boolean;
  input: Record<string, unknown>;
}

interface DirectorPreview {
  conceptId: string;
  title: string;
  rationale: string;
  previewDataUrl: string;
  svg?: string;
  kind?: "logo" | "stitch";
  htmlDownloadUrl?: string;
  imageDownloadUrl?: string;
  deviceType?: "DESKTOP" | "MOBILE" | "TABLET" | "AGNOSTIC";
}

interface DirectorMessage {
  id: string;
  role: "operator" | "director";
  content: string;
  createdAt: string;
  suggestions?: DirectorSuggestion[];
  approvals?: DirectorApproval[];
  previews?: DirectorPreview[];
  clarifyingQuestions?: string[];
  researchSources?: { title?: string; uri?: string }[];
  deliverableArtifact?: DirectorDeliverableArtifactMeta;
  reasoning?: string;
  thinkingDurationMs?: number;
  model?: "sonnet" | "opus";
  modelLabel?: string;
  modelProvider?: "wireline" | "openrouter";
  modelId?: string;
  coachAgentId?: string;
  coachAgentName?: string;
  proposals?: {
    changes: ProposedChange[];
    toolToggles: ProposedToolToggle[];
    actions: (ProposedAction | DirectorProposedAction)[];
    integrationJobs: DirectorIntegrationJob[];
  };
}

export interface DirectorWorkspaceProps {
  focusAgentId?: string | null;
  onFocusAgentChange?: (agentId: string | null) => void;
}

const SUGGESTION_ICON: Record<SuggestionKind, React.ElementType> = {
  create_agent: Plus,
  focus_agent: Bot,
  view_ops: Activity,
  open_training: GraduationCap,
  open_insights: BarChart3,
};

const SCENE_ICONS: Record<Exclude<DirectorMessageScene, "general">, React.ElementType> = {
  design: LayoutTemplate,
  creative: Palette,
  analysis: BarChart3,
  integration: Plug,
  training: GraduationCap,
  comms: MessageCircle,
  fleet: Bot,
  document: FileText,
  code: FileText,
};

export default function DirectorWorkspace({
  focusAgentId = null,
  onFocusAgentChange,
}: DirectorWorkspaceProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const reduceMotion = useReducedMotion();
  const { user, loading: authLoading } = useAuth();
  const { branding } = useBranding();
  const { agents } = useAgents();
  const focusedAgent = focusAgentId ? agents.find((a) => a.id === focusAgentId) : undefined;
  const { error: toastError, success: toastSuccess } = useToast();
  const [messages, setMessages] = useState<DirectorMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [composerAccessory, setComposerAccessory] = useState<ComposerAccessoryKind | null>(null);
  const [forceDeep, setForceDeep] = useState(false);
  const [chatModelSelection, setChatModelSelection] = useState<DirectorChatModelSelection>(
    DEFAULT_DIRECTOR_MODEL_SELECTION,
  );
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [resolved, setResolved] = useState<Record<string, "done" | "dismissed">>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | undefined>();
  const [callConsent, setCallConsent] = useState<Record<string, boolean>>({});
  const [integrationLiveActions, setIntegrationLiveActions] = useState<IntegrationLiveAction[]>([]);
  const [liveSteps, setLiveSteps] = useState<DirectorLiveStep[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [artifacts, setArtifacts] = useState<DirectorArtifact[]>([]);
  const [featureFlags, setFeatureFlags] = useState({
    toolExecution: true,
    creativeTools: true,
    artifactsPanel: true,
    stitchMedia: true,
  });
  const [stitchRendering, setStitchRendering] = useState(false);
  const [stitchPrompt, setStitchPrompt] = useState("");
  const [useStitchAccountBranding, setUseStitchAccountBranding] = useState(true);
  const stitchBrandingAvailable = hasConfiguredTenantBranding(stitchBrandingFromSnake(branding));
  const [loadDegraded, setLoadDegraded] = useState(false);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerDockRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSendRef = useRef<{ trimmed: string; optimisticId?: string } | null>(null);
  const lastStreamOperatorRef = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const liveSequenceKeyRef = useRef<string | null>(null);
  const sendNonStreamingRef = useRef<
    | ((
        trimmed: string,
        optimisticId?: string,
        opts?: { skipOperatorPersist?: boolean },
      ) => Promise<void>)
    | null
  >(null);

  const appendDirectorReply = useCallback(
    (data: Record<string, unknown>) => {
      const changes = Array.isArray(data.changes) ? (data.changes as ProposedChange[]) : [];
      const toolToggles = Array.isArray(data.toolToggles)
        ? (data.toolToggles as ProposedToolToggle[])
        : [];
      const actions = Array.isArray(data.actions) ? (data.actions as DirectorProposedAction[]) : [];
      const integrationJobs = Array.isArray(data.integrationJobs)
        ? (data.integrationJobs as DirectorIntegrationJob[])
        : [];
      const hasProposals =
        changes.length > 0 ||
        toolToggles.length > 0 ||
        actions.length > 0 ||
        integrationJobs.length > 0;

      const reply: DirectorMessage = {
        id: `director-${Date.now()}`,
        role: "director",
        content: (data.reply as string) || "(empty reply)",
        createdAt: new Date().toISOString(),
        suggestions: Array.isArray(data.suggestions)
          ? (data.suggestions as DirectorSuggestion[])
          : undefined,
        approvals: Array.isArray(data.approvals)
          ? (data.approvals as DirectorApproval[])
          : undefined,
        previews: Array.isArray(data.previews) ? (data.previews as DirectorPreview[]) : undefined,
        clarifyingQuestions: Array.isArray(data.clarifyingQuestions)
          ? (data.clarifyingQuestions as string[])
          : undefined,
        researchSources: Array.isArray(data.researchSources)
          ? (data.researchSources as { title?: string; uri?: string }[])
          : undefined,
        deliverableArtifact:
          data.deliverableArtifact && typeof data.deliverableArtifact === "object"
            ? (data.deliverableArtifact as DirectorDeliverableArtifactMeta)
            : undefined,
        reasoning: (data.reasoning as string) || undefined,
        thinkingDurationMs: (data.thinkingDurationMs as number) || undefined,
        model: (data.model as "sonnet" | "opus") || undefined,
        modelLabel: typeof data.modelLabel === "string" ? data.modelLabel : undefined,
        modelProvider:
          data.modelProvider === "wireline" || data.modelProvider === "openrouter"
            ? data.modelProvider
            : undefined,
        modelId: typeof data.modelId === "string" ? data.modelId : undefined,
        coachAgentId: (data.focusAgentId as string) || focusAgentId || undefined,
        coachAgentName: (data.focusAgentName as string) || focusedAgent?.name || undefined,
        proposals: hasProposals ? { changes, toolToggles, actions, integrationJobs } : undefined,
      };
      setMessages((prev) => [...prev, reply]);
      if (Array.isArray(data.artifacts)) setArtifacts(data.artifacts as DirectorArtifact[]);
    },
    [focusAgentId, focusedAgent?.name],
  );

  const loadMessages = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setMessages([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await authFetch("/api/director/messages");
          if (r.status === 401 || r.status === 403) return;
          if (!r.ok) {
            const parsed = await readApiJson(r);
            throw new Error(!parsed.ok ? parsed.error : "Failed to load messages");
          }
          const data = await r.json();
          setLoadDegraded(data.degraded === true);
          setMessages(Array.isArray(data.messages) ? data.messages : []);
          setArtifacts(Array.isArray(data.artifacts) ? data.artifacts : []);
          if (Array.isArray(data.fleet)) {
            hydrateAgentsFromFleet(
              data.fleet
                .filter((a: { id?: unknown }) => typeof a?.id === "string" && a.id)
                .map((a: { id: string; name?: string | null; role?: string | null }) => ({
                  id: a.id,
                  name: a.name || "Untitled agent",
                  role: a.role ?? null,
                })),
            );
          }
          if (data.featureFlags && typeof data.featureFlags === "object") {
            setFeatureFlags({
              toolExecution: data.featureFlags.toolExecution !== false,
              creativeTools: data.featureFlags.creativeTools !== false,
              artifactsPanel: data.featureFlags.artifactsPanel !== false,
              stitchMedia: data.featureFlags.stitchMedia !== false,
            });
          }
          if (data.chatModelPreference) {
            setChatModelSelection(data.chatModelPreference as DirectorChatModelSelection);
          }
          if (data.degraded && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 600));
            continue;
          }
          return;
        } catch (e) {
          if (attempt === 1) throw e;
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }
    } catch {
      setLoadDegraded(true);
      toastError("Couldn't load the Director", "Check connection and refresh");
    } finally {
      setIsLoading(false);
    }
  }, [authLoading, toastError, user]);

  // Streaming chat integration
  const {
    state: streamState,
    send: streamSend,
    reset: streamReset,
    isStreaming,
  } = useStreamingChat("/api/director/messages/stream", {
    onComplete: (data) => {
      const integrationJobs = Array.isArray(data.integrationJobs)
        ? (data.integrationJobs as DirectorIntegrationJob[])
        : [];
      const actions = Array.isArray(data.actions) ? (data.actions as DirectorProposedAction[]) : [];
      if (integrationJobs.length > 0 || actions.length > 0) {
        setIntegrationLiveActions(buildLiveActionsFromProposals({ integrationJobs, actions }));
      }
      appendDirectorReply(data);
      if (
        !data.deliverableArtifact &&
        typeof data.reply === "string" &&
        data.reply.length > 2_000
      ) {
        window.setTimeout(() => void loadMessages(), 2_500);
      }
      if (Array.isArray(data.artifacts)) {
        setArtifacts((prev) => {
          const incoming = data.artifacts as DirectorArtifact[];
          const ids = new Set(incoming.map((a) => a.id));
          return [...incoming, ...prev.filter((a) => !ids.has(a.id))];
        });
      }
      setIsSending(false);
      streamReset();
      pendingSendRef.current = null;
      lastStreamOperatorRef.current = null;
      inputRef.current?.focus();
    },
    onError: (msg, { streamEstablished, partialReply }) => {
      const pending = pendingSendRef.current;
      const operatorProbe = pending?.trimmed ?? lastStreamOperatorRef.current ?? "";

      if (isSubstantiveDirectorPayload(partialReply)) {
        appendDirectorReply(partialReply!);
        setIsSending(false);
        streamReset();
        pendingSendRef.current = null;
        lastStreamOperatorRef.current = null;
        inputRef.current?.focus();
        return;
      }

      const directorReplyExists = (text: string) => {
        const probe = text.trim();
        if (!probe) return false;
        const msgs = messagesRef.current;
        const operatorIdx = msgs.findIndex(
          (m) => m.role === "operator" && m.content.trim() === probe,
        );
        if (operatorIdx >= 0) {
          return msgs
            .slice(operatorIdx + 1)
            .some((m) => m.role === "director" && isSubstantiveDirectorReply(m.content));
        }
        const last = msgs[msgs.length - 1];
        return last?.role === "director" && isSubstantiveDirectorReply(last.content);
      };

      const recoverFromPersistedTurn = async (): Promise<boolean> => {
        for (let waitMs of [400, 900, 1600]) {
          await loadMessages();
          if (directorReplyExists(operatorProbe)) return true;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        await loadMessages();
        return directorReplyExists(operatorProbe);
      };

      if (pending?.trimmed) {
        void (async () => {
          if (await recoverFromPersistedTurn()) {
            setIsSending(false);
            streamReset();
            pendingSendRef.current = null;
            lastStreamOperatorRef.current = null;
            inputRef.current?.focus();
            return;
          }
          void sendNonStreamingRef.current?.(pending.trimmed, pending.optimisticId, {
            skipOperatorPersist: streamEstablished,
          });
        })();
        return;
      }

      void (async () => {
        if (await recoverFromPersistedTurn()) {
          setIsSending(false);
          streamReset();
          pendingSendRef.current = null;
          lastStreamOperatorRef.current = null;
          inputRef.current?.focus();
          return;
        }
        toastError("Stream interrupted", msg);
        setIsSending(false);
        streamReset();
        pendingSendRef.current = null;
        lastStreamOperatorRef.current = null;
        inputRef.current?.focus();
      })();
    },
  });

  const recoverPersistedDirectorReply = useCallback(
    async (trimmed: string, requireStitch: boolean): Promise<boolean> => {
      const waits = [400, 900, 1600, 3000, 5000, 8000, 12_000, 18_000];
      for (const waitMs of waits) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        const r = await authFetch("/api/director/messages");
        if (!r.ok) continue;
        const data = await r.json();
        const msgs = Array.isArray(data.messages) ? data.messages : [];
        if (
          !operatorTurnHasDirectorReply(msgs, trimmed, {
            requireStitch: requireStitch,
          })
        ) {
          continue;
        }
        setMessages(msgs);
        if (Array.isArray(data.artifacts)) setArtifacts(data.artifacts);
        return true;
      }
      return false;
    },
    [],
  );

  const sendNonStreaming = useCallback(
    async (
      trimmed: string,
      optimisticId?: string,
      opts?: {
        skipOperatorPersist?: boolean;
        timeoutMs?: number;
        recoverPersistedReply?: boolean;
        requireStitchReply?: boolean;
      },
    ) => {
      try {
        const r = await authFetch("/api/director/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeoutMs: opts?.timeoutMs,
          body: JSON.stringify({
            content: trimmed,
            ...(focusAgentId ? { focusAgentId } : {}),
            ...(opts?.skipOperatorPersist ? { skipOperatorPersist: true } : {}),
            ...(featureFlags.stitchMedia && wantsStitchMediaRequest(trimmed)
              ? {
                  stitchOptions: {
                    useAccountBranding: stitchBrandingAvailable && useStitchAccountBranding,
                  },
                }
              : {}),
            ...(!focusAgentId &&
            chatModelSelection.provider === "wireline" &&
            (forceDeep || wantsDeepAnalysis(trimmed))
              ? { forceDeep: true }
              : {}),
            modelSelection: chatModelSelection,
          }),
        });
        const parsed = await readApiJson<Record<string, unknown>>(r);
        if (!parsed.ok) throw new Error(parsed.error);
        appendDirectorReply(parsed.data);
      } catch {
        if (opts?.recoverPersistedReply) {
          const recovered = await recoverPersistedDirectorReply(
            trimmed,
            opts.requireStitchReply === true,
          );
          if (recovered) return;
        }
        if (optimisticId) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
        setInput(trimmed);
        toastError(
          opts?.requireStitchReply ? "Stitch didn't finish in time" : "Couldn't send",
          opts?.requireStitchReply
            ? "Your render may still land in this thread — refresh in a moment or try again."
            : "Try again in a moment",
        );
      } finally {
        setIsSending(false);
        streamReset();
        pendingSendRef.current = null;
        inputRef.current?.focus();
      }
    },
    [
      appendDirectorReply,
      recoverPersistedDirectorReply,
      streamReset,
      toastError,
      focusAgentId,
      forceDeep,
      chatModelSelection,
      featureFlags.stitchMedia,
      stitchBrandingAvailable,
      useStitchAccountBranding,
    ],
  );
  sendNonStreamingRef.current = sendNonStreaming;

  // Pipeline steps derived from streaming state
  const streamPipeline: PipelineStep[] = (() => {
    if (!isStreaming && streamState.phase === "idle") return [];
    const steps: PipelineStep[] = [];
    const phase = streamState.phase;

    steps.push({
      id: "connect",
      label: "Connecting to Director",
      status: phase === "connecting" ? "active" : "done",
    });
    if (phase === "thinking" || phase === "replying" || phase === "done") {
      steps.push({
        id: "thinking",
        label: streamState.modelDisplayLabel
          ? streamState.modelDisplayLabel
          : streamState.isDeep
            ? "Deep analysis (Opus)"
            : "Reasoning",
        status: phase === "thinking" ? "active" : "done",
        detail:
          phase === "thinking" && streamState.thinkingText ? "Live reasoning stream" : undefined,
        elapsedMs: phase === "thinking" ? undefined : streamState.thinkingDurationMs,
      });
    }
    if (phase === "replying" || phase === "done") {
      steps.push({
        id: "reply",
        label: "Composing reply",
        status: phase === "replying" ? "active" : "done",
        detail: phase === "replying" ? "Structuring output & proposals" : undefined,
      });
    }
    return steps;
  })();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setMessages([]);
      return;
    }
    loadMessages();
  }, [authLoading, loadMessages, user]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setPinnedToBottom(distance < 96);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isLoading, messages.length]);

  useEffect(() => {
    if (!pinnedToBottom || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [
    messages,
    isSending,
    streamState.thinkingText,
    streamState.reply,
    streamState.phase,
    integrationLiveActions.length,
    pinnedToBottom,
  ]);

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
    setPinnedToBottom(true);
  }, [reduceMotion]);

  useEffect(() => {
    if (!focusAgentId) {
      setEnabledTools([]);
      return;
    }
    void authFetch(`/api/agents/${encodeURIComponent(focusAgentId)}/workspace/messages`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.agent?.enabledTools) setEnabledTools(data.agent.enabledTools);
      })
      .catch(() => undefined);
  }, [focusAgentId]);

  useEffect(() => {
    if (focusAgentId) return;
    setComposerAccessory((prev) => (prev === "coach" || prev === "tools" ? null : prev));
  }, [focusAgentId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (composerDockRef.current?.contains(e.target as Node)) return;
      setComposerAccessory(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!composerAccessory) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setComposerAccessory(null);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [composerAccessory]);

  const [composerHintIndex, setComposerHintIndex] = useState(0);
  useEffect(() => {
    if (reduceMotion || isSending || input.trim()) return;
    const timer = setInterval(() => {
      setComposerHintIndex((i) => (i + 1) % DIRECTOR_COMPOSER_HINTS.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [isSending, input, reduceMotion]);

  useEffect(() => {
    const prompt = searchParams.get("prompt")?.trim();
    if (!prompt) return;
    setInput(prompt);
    inputRef.current?.focus();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("prompt");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const pickCapabilityExample = useCallback(
    (text: string) => {
      setInput(text);
      if (!focusAgentId && wantsDeepAnalysis(text)) setForceDeep(true);
      setComposerAccessory(null);
      inputRef.current?.focus();
    },
    [focusAgentId],
  );

  const toggleComposerAccessory = useCallback((kind: ComposerAccessoryKind) => {
    setComposerAccessory((prev) => (prev === kind ? null : kind));
  }, []);

  const clearCoachFocus = useCallback(() => {
    onFocusAgentChange?.(null);
    setComposerAccessory((prev) => (prev === "coach" || prev === "tools" ? null : prev));
  }, [onFocusAgentChange]);

  const runSuggestion = useCallback(
    (s: DirectorSuggestion) => {
      switch (s.kind) {
        case "create_agent":
          navigate("/agents");
          break;
        case "focus_agent":
          if (s.agentId) onFocusAgentChange?.(s.agentId);
          break;
        case "view_ops":
          navigate("/ops");
          break;
        case "open_training": {
          const target = s.agentId || focusAgentId || agents[0]?.id;
          navigate(target ? `/training?agent=${encodeURIComponent(target)}` : "/training");
          break;
        }
        case "open_insights":
          navigate("/insights");
          break;
      }
    },
    [navigate, onFocusAgentChange, focusAgentId, agents],
  );

  const send = useCallback(
    async (text: string, opts?: { approval?: DirectorApproval; isRetry?: boolean }) => {
      const trimmed = text.trim();
      if ((!trimmed && !opts?.approval) || isSending) return;
      if (opts?.isRetry) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last?.role === "director" &&
            /trouble responding|can't respond right now/i.test(last.content)
          ) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
      const optimistic: DirectorMessage | null =
        trimmed && !opts?.isRetry
          ? {
              id: `tmp-${Date.now()}`,
              role: "operator",
              content: trimmed,
              createdAt: new Date().toISOString(),
            }
          : null;
      if (optimistic) setMessages((prev) => [...prev, optimistic]);
      if (trimmed) setInput("");
      setIsSending(true);
      setComposerAccessory(null);

      const stitchOptions =
        featureFlags.stitchMedia && wantsStitchMediaRequest(trimmed)
          ? { useAccountBranding: stitchBrandingAvailable && useStitchAccountBranding }
          : undefined;

      const payload = {
        content: trimmed,
        ...(focusAgentId ? { focusAgentId } : {}),
        ...(opts?.approval ? { approval: opts.approval } : {}),
        ...(opts?.isRetry ? { skipOperatorPersist: true } : {}),
        ...(stitchOptions ? { stitchOptions } : {}),
        ...(!focusAgentId &&
        chatModelSelection.provider === "wireline" &&
        (forceDeep || wantsDeepAnalysis(trimmed))
          ? { forceDeep: true }
          : {}),
        modelSelection: chatModelSelection,
      };

      const useStitchPost =
        !opts?.approval && trimmed && featureFlags.stitchMedia && wantsStitchMediaRequest(trimmed);

      if (useStitchPost) {
        pendingSendRef.current = { trimmed, optimisticId: optimistic?.id };
        setStitchPrompt(trimmed);
        setStitchRendering(true);
        try {
          await sendNonStreaming(trimmed, optimistic?.id, {
            timeoutMs: DIRECTOR_STITCH_REQUEST_TIMEOUT_MS,
            recoverPersistedReply: true,
            requireStitchReply: true,
          });
        } finally {
          setStitchRendering(false);
          setStitchPrompt("");
        }
        return;
      }

      // Use streaming for regular messages (no approvals — those stay non-streaming)
      if (!opts?.approval) {
        pendingSendRef.current = { trimmed, optimisticId: optimistic?.id };
        lastStreamOperatorRef.current = trimmed;
        streamSend(payload);
        return;
      }

      // Fallback: non-streaming for approval responses
      try {
        const r = await authFetch("/api/director/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error("Send failed");
        const data = await r.json();
        const reply: DirectorMessage = {
          id: `director-${Date.now()}`,
          role: "director",
          content: data.reply || "(empty reply)",
          createdAt: new Date().toISOString(),
          suggestions: Array.isArray(data.suggestions) ? data.suggestions : undefined,
          approvals: Array.isArray(data.approvals) ? data.approvals : undefined,
          previews: Array.isArray(data.previews) ? data.previews : undefined,
          reasoning: data.reasoning,
          thinkingDurationMs: data.thinkingDurationMs,
          model: data.model,
          modelLabel: typeof data.modelLabel === "string" ? data.modelLabel : undefined,
          modelProvider:
            data.modelProvider === "wireline" || data.modelProvider === "openrouter"
              ? data.modelProvider
              : undefined,
          modelId: typeof data.modelId === "string" ? data.modelId : undefined,
        };
        setMessages((prev) => [...prev, reply]);
        if (Array.isArray(data.artifacts)) setArtifacts(data.artifacts);
      } catch {
        if (optimistic) setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        if (trimmed) setInput(trimmed);
        toastError("Couldn't send", "Try again in a moment");
      } finally {
        setIsSending(false);
        inputRef.current?.focus();
      }
    },
    [
      isSending,
      toastError,
      streamSend,
      sendNonStreaming,
      focusAgentId,
      forceDeep,
      chatModelSelection,
      featureFlags.stitchMedia,
      stitchBrandingAvailable,
      useStitchAccountBranding,
    ],
  );

  const markResolved = (key: string, state: "done" | "dismissed") =>
    setResolved((prev) => ({ ...prev, [key]: state }));

  const resolveCoachAgentId = (message: DirectorMessage) =>
    message.coachAgentId || focusAgentId || null;

  const resolveActionAgentId = (
    action: ProposedAction | DirectorProposedAction,
    message: DirectorMessage,
  ) =>
    ("agentId" in action && action.agentId) ||
    message.coachAgentId ||
    focusAgentId ||
    agents[0]?.id ||
    null;

  useEffect(() => {
    if (!isSending && !isStreaming) {
      liveSequenceKeyRef.current = null;
      setIntegrationLiveActions([]);
      return;
    }

    const message = pendingSendRef.current?.trimmed ?? "";
    const sequenceKey = `${message}::${enabledTools.join(",")}`;
    if (liveSequenceKeyRef.current === sequenceKey) return;
    liveSequenceKeyRef.current = sequenceKey;

    const script = planIntegrationLiveScript({ message, enabledTools });
    return startIntegrationLiveSequence(script, setIntegrationLiveActions);
  }, [isSending, isStreaming, enabledTools]);

  useEffect(() => {
    if (!isSending && !isStreaming) {
      setLiveSteps([]);
      return;
    }
    const base = buildDirectorLiveSteps({
      hasIntegrations: enabledTools.some((t) =>
        AGENT_TOOL_CATALOG.some((c) => c.name === t && c.integration),
      ),
      coachAgentName: focusedAgent?.name,
      fleetSize: agents.length,
    });
    setLiveSteps(advanceLiveStepsForPhase(base, streamState.phase));
  }, [streamState.phase, isSending, isStreaming, enabledTools, focusedAgent?.name, agents.length]);

  const approveChange = useCallback(
    async (key: string, change: ProposedChange, agentId: string) => {
      setBusyKey(key);
      setBusyLabel("Applying configuration…");
      try {
        const r = await authFetch(
          `/api/agents/${encodeURIComponent(agentId)}/workspace/apply-change`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field: change.field, value: change.value }),
          },
        );
        if (!r.ok) throw new Error("Apply failed");
        markResolved(key, "done");
        toastSuccess("Updated", `${change.label} saved`);
      } catch {
        toastError("Couldn't apply change", "Try again in a moment");
      } finally {
        setBusyKey(null);
      }
    },
    [toastSuccess, toastError],
  );

  const approveToggle = useCallback(
    async (key: string, toggle: ProposedToolToggle, agentId: string) => {
      setBusyKey(key);
      setBusyLabel(toggle.enable ? "Connecting capability…" : "Disconnecting…");
      try {
        const r = await authFetch(
          `/api/agents/${encodeURIComponent(agentId)}/workspace/toggle-tool`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: toggle.tool, enable: toggle.enable }),
          },
        );
        if (!r.ok) throw new Error("Toggle failed");
        const data = await r.json();
        if (agentId === focusAgentId && Array.isArray(data.enabledTools)) {
          setEnabledTools(data.enabledTools);
        }
        markResolved(key, "done");
        toastSuccess(toggle.enable ? "Capability on" : "Capability off", toggle.label);
      } catch {
        toastError("Couldn't update capability", "Try again in a moment");
      } finally {
        setBusyKey(null);
      }
    },
    [focusAgentId, toastSuccess, toastError],
  );

  const approveAction = useCallback(
    async (key: string, action: ProposedAction | DirectorProposedAction, agentId: string) => {
      setBusyKey(key);
      setBusyLabel(
        action.kind === "make_call"
          ? "Connecting call…"
          : action.kind === "send_text_message"
            ? "Sending text…"
            : "Sending email…",
      );
      try {
        const fleetAction: DirectorProposedAction = {
          ...action,
          agentId: ("agentId" in action && action.agentId) || agentId,
        };
        const r = await authFetch("/api/director/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "comms",
            action: fleetAction,
            hasExpressWrittenConsent: !!callConsent[key],
          }),
        });
        const parsed = await readApiJson<{ output?: string; error?: string }>(r);
        if (!parsed.ok) throw new Error(parsed.error);
        markResolved(key, "done");
        toastSuccess("Done", parsed.data.output || action.label);
      } catch (err) {
        toastError("Couldn't run action", err instanceof Error ? err.message : "Try again");
      } finally {
        setBusyKey(null);
      }
    },
    [callConsent, toastSuccess, toastError],
  );

  const approveIntegration = useCallback(
    async (key: string, job: DirectorIntegrationJob, agentId?: string | null) => {
      setBusyKey(key);
      setBusyLabel("Running integration…");
      try {
        const r = await authFetch("/api/director/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "integration",
            job: { ...job, agentId: job.agentId || agentId || undefined },
          }),
        });
        const parsed = await readApiJson<{ output?: string; error?: string }>(r);
        if (!parsed.ok) throw new Error(parsed.error);
        markResolved(key, "done");
        if (parsed.data.output) {
          setMessages((prev) => [
            ...prev,
            {
              id: `director-${Date.now()}`,
              role: "director",
              content: parsed.data.output || "",
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        toastSuccess("Integration complete", job.label);
      } catch (err) {
        toastError("Integration failed", err instanceof Error ? err.message : "Try again");
      } finally {
        setBusyKey(null);
      }
    },
    [toastSuccess, toastError],
  );

  const clearThread = useCallback(async () => {
    if (isClearing) return;
    if (
      !confirm("Clear your Director conversation and generated artifacts? This cannot be undone.")
    ) {
      return;
    }
    setIsClearing(true);
    try {
      const r = await authFetch("/api/director/messages", { method: "DELETE" });
      if (!r.ok) throw new Error("Clear failed");
      setMessages([]);
      setArtifacts([]);
      setResolved({});
      setComposerAccessory(null);
      setForceDeep(false);
      setIntegrationLiveActions([]);
      setLiveSteps([]);
      setInput("");
      toastSuccess("Thread cleared", "Conversation and artifacts removed");
    } catch {
      toastError("Couldn't clear thread", "Please try again");
    } finally {
      setIsClearing(false);
    }
  }, [isClearing, toastError, toastSuccess]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const onFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toastError("PDF only for now", "Other file types coming soon");
      e.target.value = "";
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      toastError("File too large", "Keep PDFs under 30MB");
      e.target.value = "";
      return;
    }
    setIsUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error("Read failed"));
        reader.readAsDataURL(file);
      });

      const endpoint = focusAgentId
        ? `/api/agents/${encodeURIComponent(focusAgentId)}/workspace/files`
        : "/api/director/files";

      const r = await authFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64, fileName: file.name }),
      });
      const parsed = await readApiJson<{ reply?: string; inserted?: number; error?: string }>(r);
      if (!parsed.ok) throw new Error(parsed.error);

      if (parsed.data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `director-${Date.now()}`,
            role: "director",
            content: parsed.data.reply || "",
            createdAt: new Date().toISOString(),
            coachAgentId: focusAgentId || undefined,
            coachAgentName: focusedAgent?.name,
          },
        ]);
      }
      toastSuccess(
        "Document ingested",
        focusAgentId
          ? `${parsed.data.inserted ?? 0} knowledge items added for ${focusedAgent?.name || "agent"}`
          : `${parsed.data.inserted ?? 0} items extracted — ask me to summarize or apply`,
      );
    } catch (err) {
      toastError("Upload failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const respondToApproval = (approval: DirectorApproval, approved: boolean) => {
    send("", {
      approval: {
        ...approval,
        approved,
      },
    });
  };

  const lastDirectorMessageId = [...messages].reverse().find((m) => m.role === "director")?.id;
  const latestStitchPreview = findLatestStitchPreview(messages);

  return (
    <div
      data-testid="director-workspace"
      className={cn("flex flex-col h-full min-h-0", WL_APP_CLASSES.missionCanvas)}
    >
      {/* Minimal header - just identity */}
      {messages.length > 0 && (
        <div
          className={cn(
            "shrink-0 flex items-center justify-between px-6 py-3 border-b border-brand/6",
            WL_DIRECTOR_CLASSES.threadHeader,
          )}
        >
          <div className="flex items-center gap-2.5">
            <span className="wl-orbit" data-active={isSending}>
              <span className="shrink-0 flex w-9 h-9 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/20 relative overflow-hidden">
                <Compass className="w-4 h-4 relative z-10" />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent" />
              </span>
            </span>
            <div>
              <p className="text-[13px] font-semibold text-ink leading-tight tracking-[-0.01em]">
                Director
              </p>
              <p className="wl-label text-muted leading-tight">
                {isSending ? (
                  <span className="inline-flex items-center gap-1.5 text-brand/80">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/50" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand" />
                    </span>
                    {streamState.isDeep
                      ? "Deep analysis running"
                      : streamState.phase === "replying"
                        ? "Drafting response"
                        : "Mission control active"}
                  </span>
                ) : focusedAgent ? (
                  `Coaching ${focusedAgent.name}`
                ) : integrationLiveActions.length > 0 && isSending ? (
                  `Fleet channel · ${integrationLiveActions.filter((a) => a.status === "success").length}/${integrationLiveActions.length}`
                ) : (
                  "Always-on fleet manager"
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {latestStitchPreview &&
              stitchPreviewPageUrlIsValid(latestStitchPreview.preview) &&
              !isSending && (
                <ShadButton
                  asChild
                  variant="ghost"
                  size="sm"
                  disableAnimations
                  className="touch-press shrink-0 text-[10px] uppercase tracking-[0.14em] text-brand hover:text-brand-deep hover:bg-brand/8 h-auto px-2.5 py-1.5 border border-brand/15"
                >
                  <Link
                    to={buildStitchPreviewPageUrl(latestStitchPreview.preview)}
                    aria-label={WIRELINE_STITCH_UI.previewSideEntryLabel}
                  >
                    <LayoutTemplate className="w-3 h-3" />
                    <span className="hidden sm:inline">
                      {WIRELINE_STITCH_UI.previewSideEntryLabel}
                    </span>
                  </Link>
                </ShadButton>
              )}
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              disableAnimations
              onClick={clearThread}
              disabled={isClearing}
              className="touch-press shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted hover:text-rose-600 hover:bg-rose-500/8 h-auto px-2.5 py-1.5"
              aria-label="Clear thread"
            >
              {isClearing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
              <span>Clear</span>
            </ShadButton>
          </div>
        </div>
      )}

      {/* Messages - isolated scroll viewport */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 scroll-viewport wl-scroll-edge wl-director-thread-scroll px-3 sm:px-4 py-5"
        >
          {loadDegraded && !isLoading && (
            <p className="rounded-md border border-brand/20 bg-brand/[0.06] px-3 py-2 text-[11px] text-ink/80 dark:text-foreground/85">
              Some Director data could not be loaded. Your thread may be incomplete — refresh to
              retry.
            </p>
          )}
          {isLoading ? (
            <div className="wl-director-loading" role="status" aria-live="polite">
              <SignalOrbFrame className="wl-director-loading-orb" size="sm" withBloom>
                <div className="flex w-12 h-12 items-center justify-center rounded-md border border-brand/20 bg-brand/[0.08]">
                  <LoadingDots />
                </div>
              </SignalOrbFrame>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/80">
                {DIRECTOR_LOADING_COPY.headline}
              </p>
              <p className="text-[11px] text-muted">{DIRECTOR_LOADING_COPY.sub}</p>
            </div>
          ) : messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "flex flex-col items-center text-center pt-6 sm:pt-8 pb-4",
                WL_DIRECTOR_CLASSES.emptyHero,
              )}
            >
              {/* Hero identity */}
              <SignalOrbFrame
                className={cn("mb-6", WL_DIRECTOR_CLASSES.heroOrb)}
                size="lg"
                withBloom
                refined
              >
                <span className="flex w-16 h-16 items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-[0_8px_28px_-10px_rgba(59,21,76,0.35)] ring-1 ring-white/15 relative overflow-hidden">
                  <Compass className="w-8 h-8 relative z-10" strokeWidth={1.75} />
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent"
                  />
                </span>
              </SignalOrbFrame>

              <p className={cn(WL_APP_CLASSES.proEyebrow, "text-brand/75 mb-2")}>
                {DIRECTOR_EMPTY_HERO.eyebrow}
              </p>
              <h2
                className={cn(
                  WL_APP_CLASSES.proTitle,
                  "text-[1.35rem] sm:text-[1.65rem] mb-2 max-w-md text-balance",
                )}
              >
                {DIRECTOR_EMPTY_HERO.title}{" "}
                <span className="text-brand">{DIRECTOR_EMPTY_HERO.titleAccent}</span>
              </h2>

              {agents.length > 0 ? (
                <p className="text-[13px] text-muted mb-5 leading-relaxed max-w-md">
                  {DIRECTOR_EMPTY_HERO.subtitleWithFleet(agents.length)}
                </p>
              ) : (
                <p className="text-[13px] text-muted mb-5 leading-relaxed max-w-md">
                  {DIRECTOR_EMPTY_HERO.subtitleNoFleet}
                </p>
              )}

              <p className={cn(WL_APP_CLASSES.proEyebrow, "text-brand/65 mb-2.5")}>
                {DIRECTOR_EMPTY_HERO.capabilityEyebrow}
              </p>
              <div className="flex flex-wrap justify-center gap-1.5 mb-6 max-w-md">
                {DIRECTOR_CAPABILITY_PILLS.map((pill, i) => (
                  <motion.span
                    key={pill.id}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.35 + i * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="wl-capability-pill"
                  >
                    {pill.label}
                  </motion.span>
                ))}
              </div>

              {agents.length === 0 ? (
                <FleetSetupNudge className="wl-director-empty-section mb-6 max-w-md w-full" />
              ) : null}

              <DirectorStarterPrompts onSelect={(label) => void send(label)} className="mb-6" />

              <div className="wl-director-empty-section w-full mb-6">
                <p className={cn(WL_APP_CLASSES.proEyebrow, "text-brand/65 mb-2.5")}>
                  {DIRECTOR_EMPTY_HERO.discoverEyebrow}
                </p>
                <DirectorCapabilityCatalog
                  variant="empty"
                  onPickExample={(text) => {
                    pickCapabilityExample(text);
                  }}
                />
              </div>

              {agents.length > 0 ? (
                <FleetSetupNudge className="wl-director-empty-section max-w-md w-full" />
              ) : null}
            </motion.div>
          ) : (
            <div className={cn(WL_DIRECTOR_CLASSES.threadColumn, "space-y-2.5")}>
              {messages.map((m) => {
                const scene =
                  m.role === "director"
                    ? detectDirectorMessageScene(m.content, m.previews, m.proposals)
                    : "general";
                const sceneKey =
                  scene !== "general" ? (scene as Exclude<DirectorMessageScene, "general">) : null;
                const sceneBadge = sceneKey ? DIRECTOR_SCENE_BADGES[sceneKey] : null;
                const SceneIcon = sceneKey ? SCENE_ICONS[sceneKey] : null;
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      "flex flex-col w-full",
                      m.role === "operator" ? "items-end" : "items-start",
                    )}
                  >
                    <div
                      className={cn(
                        m.role === "operator"
                          ? WL_DIRECTOR_CLASSES.operatorMessageStack
                          : WL_DIRECTOR_CLASSES.messageStack,
                      )}
                    >
                      {/* Director avatar + scene badge */}
                      {m.role === "director" && (
                        <div className="flex items-center gap-1.5 mb-1 ml-0.5">
                          <span className="shrink-0 flex w-6 h-6 items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/15">
                            <Compass className="w-3 h-3" />
                          </span>
                          <span className="text-[9px] text-muted uppercase tracking-[0.12em] font-medium">
                            Director
                            {m.coachAgentName ? (
                              <span className="text-brand/70 normal-case tracking-normal">
                                {" "}
                                · coaching {m.coachAgentName}
                              </span>
                            ) : null}
                          </span>
                          {sceneBadge && SceneIcon && (
                            <motion.span
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={cn(
                                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[7px] uppercase tracking-[0.12em] font-bold transition-colors wl-scene-pulse",
                                sceneBadge.bg,
                                sceneBadge.color,
                              )}
                            >
                              <SceneIcon className="w-2 h-2" />
                              {sceneBadge.label}
                            </motion.span>
                          )}
                        </div>
                      )}

                      {/* Message bubble */}
                      <div
                        className={cn(
                          WL_DIRECTOR_CLASSES.messageBubble,
                          "rounded-md whitespace-pre-wrap break-words relative",
                          m.role === "operator"
                            ? cn(
                                "wl-director-message--operator",
                                WL_DIRECTOR_CLASSES.operatorBubble,
                                "text-white rounded-br-sm",
                              )
                            : cn(
                                WL_DIRECTOR_CLASSES.directorBubble,
                                WL_DIRECTOR_CLASSES.assistantMessage,
                                "text-ink dark:text-foreground rounded-bl-sm",
                              ),
                        )}
                      >
                        {/* Reasoning display - Claude style */}
                        {m.role === "director" && m.reasoning && (
                          <ThinkingDisplay
                            reasoning={m.reasoning}
                            thinkingDurationMs={m.thinkingDurationMs}
                            isDeep={m.model === "opus" && m.modelProvider !== "openrouter"}
                            animate={false}
                          />
                        )}

                        {m.role === "director" ? (
                          <>
                            <DirectorMessageBody content={m.content} />
                            {m.deliverableArtifact?.downloadUrl && (
                              <DirectorDeliverableDownload artifact={m.deliverableArtifact} />
                            )}
                            {/trouble responding|can't respond right now/i.test(m.content) &&
                              (() => {
                                const idx = messages.findIndex((msg) => msg.id === m.id);
                                const prior = idx > 0 ? messages[idx - 1] : null;
                                if (prior?.role !== "operator") return null;
                                return (
                                  <ShadButton
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="mt-3 h-8 px-3 text-[11px] uppercase tracking-[0.12em] border border-brand/25 text-brand hover:bg-brand/8"
                                    disabled={isSending}
                                    onClick={() => void send(prior.content, { isRetry: true })}
                                  >
                                    Retry message
                                  </ShadButton>
                                );
                              })()}
                          </>
                        ) : (
                          <p className="text-[12px] leading-snug">{m.content}</p>
                        )}

                        {m.role === "director" && m.proposals && (
                          <div className="mt-2 pt-2 border-t border-black/5 space-y-1.5">
                            {(() => {
                              const workflowTotal =
                                m.proposals.actions.length + m.proposals.integrationJobs.length;
                              const coachTotal =
                                m.proposals.changes.length + m.proposals.toolToggles.length;
                              const pendingTotal = workflowTotal + coachTotal;
                              return pendingTotal > 0 ? (
                                <div className="rounded-md border border-brand/15 bg-brand/[0.04] px-3 py-2 mb-1">
                                  <p className="text-[10px] uppercase tracking-[0.16em] text-brand font-semibold">
                                    {workflowTotal > 0
                                      ? LIVE_FEED_LABELS.proposal
                                      : "Proposed agent updates"}
                                  </p>
                                  <p className="text-[10px] text-muted mt-0.5 leading-relaxed">
                                    {LIVE_FEED_LABELS.proposalCount(pendingTotal)} ·{" "}
                                    {LIVE_FEED_LABELS.proposalHint}
                                  </p>
                                </div>
                              ) : null;
                            })()}
                            {(() => {
                              const workflowTotal =
                                m.proposals.actions.length + m.proposals.integrationJobs.length;
                              const stepLabelFor = (step?: number) =>
                                step && workflowTotal > 1
                                  ? `Step ${step} of ${workflowTotal}`
                                  : undefined;
                              return (
                                <>
                                  {resolveCoachAgentId(m) &&
                                    m.proposals.changes.map((c, i) => {
                                      const key = `${m.id}:change:${i}`;
                                      const agentId = resolveCoachAgentId(m)!;
                                      return (
                                        <ProposalCard
                                          key={key}
                                          icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
                                          tone="brand"
                                          title={c.label}
                                          detail={c.summary || c.value}
                                          state={resolved[key]}
                                          busy={busyKey === key}
                                          busyLabel={busyKey === key ? busyLabel : undefined}
                                          approveLabel="Apply"
                                          onApprove={() => approveChange(key, c, agentId)}
                                          onDismiss={() => markResolved(key, "dismissed")}
                                        />
                                      );
                                    })}
                                  {resolveCoachAgentId(m) &&
                                    m.proposals.toolToggles.map((t, i) => {
                                      const key = `${m.id}:toggle:${i}`;
                                      const agentId = resolveCoachAgentId(m)!;
                                      return (
                                        <ProposalCard
                                          key={key}
                                          icon={<Power className="w-3.5 h-3.5" />}
                                          tone="brand"
                                          title={`${t.enable ? "Turn on" : "Turn off"} ${t.label}`}
                                          detail={t.reason}
                                          state={resolved[key]}
                                          busy={busyKey === key}
                                          busyLabel={busyKey === key ? busyLabel : undefined}
                                          approveLabel={t.enable ? "Enable" : "Disable"}
                                          onApprove={() => approveToggle(key, t, agentId)}
                                          onDismiss={() => markResolved(key, "dismissed")}
                                        />
                                      );
                                    })}
                                  {m.proposals.actions.map((a, i) => {
                                    const key = `${m.id}:action:${i}`;
                                    const agentId = resolveActionAgentId(a, m);
                                    if (!agentId) return null;
                                    const aIcon =
                                      a.kind === "make_call" ? (
                                        <Phone className="w-3.5 h-3.5" />
                                      ) : a.kind === "send_text_message" ? (
                                        <MessageCircle className="w-3.5 h-3.5" />
                                      ) : (
                                        <Mail className="w-3.5 h-3.5" />
                                      );
                                    const detail = [
                                      a.to
                                        ? `To: ${a.customerName ? `${a.customerName} · ` : ""}${a.to}`
                                        : "",
                                      a.subject ? `Subject: ${a.subject}` : "",
                                      a.body || a.context || "",
                                    ]
                                      .filter(Boolean)
                                      .join("\n");
                                    return (
                                      <ProposalCard
                                        key={key}
                                        icon={aIcon}
                                        tone="amber"
                                        title={a.label}
                                        detail={detail}
                                        stepLabel={stepLabelFor(a.step)}
                                        state={resolved[key]}
                                        busy={busyKey === key}
                                        busyLabel={busyKey === key ? busyLabel : undefined}
                                        approveLabel={
                                          a.kind === "make_call"
                                            ? "Place call"
                                            : a.kind === "send_text_message"
                                              ? "Send text"
                                              : "Send email"
                                        }
                                        consent={
                                          a.kind === "make_call"
                                            ? {
                                                checked: !!callConsent[key],
                                                onChange: (v) =>
                                                  setCallConsent((prev) => ({ ...prev, [key]: v })),
                                              }
                                            : undefined
                                        }
                                        onApprove={() => approveAction(key, a, agentId)}
                                        onDismiss={() => markResolved(key, "dismissed")}
                                      />
                                    );
                                  })}
                                  {m.proposals.integrationJobs.map((job, i) => {
                                    const key = `${m.id}:integration:${i}`;
                                    const catalogEntry = AGENT_TOOL_CATALOG.find(
                                      (c) => c.name === job.tool,
                                    );
                                    const integrationKey = catalogEntry?.integration as
                                      | ToolIntegration
                                      | undefined;
                                    const jobIcon = integrationKey ? (
                                      (INTEGRATION_STYLES[integrationKey]?.icon ?? (
                                        <SearchIcon className="w-3.5 h-3.5" />
                                      ))
                                    ) : (
                                      <SearchIcon className="w-3.5 h-3.5" />
                                    );
                                    const agentId =
                                      job.agentId || resolveCoachAgentId(m) || focusAgentId;
                                    return (
                                      <ProposalCard
                                        key={key}
                                        icon={jobIcon}
                                        tone="brand"
                                        title={job.label}
                                        detail={[
                                          job.summary,
                                          job.query ? `Query: ${job.query}` : "",
                                        ]
                                          .filter(Boolean)
                                          .join("\n")}
                                        stepLabel={stepLabelFor(job.step)}
                                        state={resolved[key]}
                                        busy={busyKey === key}
                                        busyLabel={busyKey === key ? busyLabel : undefined}
                                        approveLabel="Run"
                                        onApprove={() => approveIntegration(key, job, agentId)}
                                        onDismiss={() => markResolved(key, "dismissed")}
                                      />
                                    );
                                  })}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {m.createdAt && (
                        <time
                          dateTime={m.createdAt}
                          className={cn(
                            WL_DIRECTOR_CLASSES.messageMeta,
                            m.role === "operator" && "wl-director-message-meta--operator",
                          )}
                        >
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                      )}

                      {m.suggestions && m.suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 w-full min-w-0">
                          {m.suggestions.map((s, i) => {
                            const Icon = SUGGESTION_ICON[s.kind];
                            return (
                              <ShadButton
                                key={`${s.kind}-${i}`}
                                type="button"
                                variant="outline"
                                size="sm"
                                disableAnimations
                                onClick={() => runSuggestion(s)}
                                title={s.label}
                                className="group !inline-flex h-auto min-h-8 w-full sm:w-auto max-w-full justify-start text-left text-[11px] font-medium text-brand rounded-md border-brand/20 bg-brand/[0.04] px-3 py-1.5 hover:bg-brand/10 hover:border-brand/40 !whitespace-normal overflow-visible"
                              >
                                <Icon className="w-3 h-3 shrink-0" />
                                <span className="min-w-0 flex-1 text-pretty leading-snug break-words">
                                  {s.label}
                                </span>
                                <ArrowUpRight className="w-2.5 h-2.5 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
                              </ShadButton>
                            );
                          })}
                        </div>
                      )}

                      {m.researchSources && m.researchSources.length > 0 && (
                        <DirectorResearchSources sources={m.researchSources} />
                      )}

                      {m.role === "director" &&
                        m.id === lastDirectorMessageId &&
                        m.clarifyingQuestions &&
                        m.clarifyingQuestions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 w-full min-w-0">
                            {m.clarifyingQuestions.map((q) => (
                              <ShadButton
                                key={q}
                                type="button"
                                variant="outline"
                                size="sm"
                                disableAnimations
                                onClick={() => {
                                  setInput(q.replace(/\?$/, "") + " — ");
                                  inputRef.current?.focus();
                                }}
                                className="!inline-flex h-auto min-h-8 w-full sm:w-auto max-w-full justify-start text-[11px] text-left rounded-md border-brand/20 bg-brand/[0.04] px-3 py-1.5 hover:bg-brand/10 !whitespace-normal overflow-visible"
                              >
                                <span className="min-w-0 flex-1 text-pretty leading-snug break-words">
                                  {q}
                                </span>
                              </ShadButton>
                            ))}
                          </div>
                        )}

                      {m.approvals && m.approvals.length > 0 && (
                        <div className="space-y-1.5 w-full">
                          {m.approvals.map((a) => (
                            <div
                              key={a.callId}
                              className="rounded-[12px] border border-brand/20 bg-brand/[0.04] px-3 py-2"
                            >
                              <p className="text-[11px] text-muted mb-2">{a.label}</p>
                              <div className="flex items-center gap-2">
                                <ShadButton
                                  onClick={() => respondToApproval(a, true)}
                                  className="px-3 py-1.5 rounded-[10px] text-[11px] font-semibold bg-brand text-white"
                                  disabled={isSending}
                                >
                                  Approve
                                </ShadButton>
                                <ShadButton
                                  onClick={() => respondToApproval(a, false)}
                                  className="px-3 py-1.5 rounded-[10px] text-[11px] font-semibold border border-brand/20 text-muted"
                                  disabled={isSending}
                                >
                                  Decline
                                </ShadButton>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {m.previews && m.previews.length > 0 && isStitchPreview(m.previews[0]) && (
                        <DirectorStitchPreviewTeaser preview={m.previews[0]} />
                      )}

                      {m.previews && m.previews.length > 0 && !isStitchPreview(m.previews[0]) && (
                        <div className="w-full">
                          {/* Gallery header */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-brand/10 to-brand-deep/10 border border-brand/25">
                              <Sparkles className="w-3 h-3 text-brand" />
                              <span className="text-[9px] uppercase tracking-[0.12em] font-bold text-brand">
                                {m.previews.length} concept{m.previews.length !== 1 ? "s" : ""}{" "}
                                generated
                              </span>
                            </span>
                          </div>

                          <div
                            className={cn(
                              "grid gap-2",
                              m.previews.length === 1 ? "grid-cols-1" : "grid-cols-2",
                            )}
                          >
                            {m.previews.map((p) => (
                              <motion.div
                                key={p.conceptId}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="group relative rounded-md border border-brand/12 bg-paper/95 dark:bg-velvet/60 overflow-hidden shadow-sm hover:shadow-xl hover:border-brand/25 transition-all duration-300"
                              >
                                {/* Image canvas with hover overlay */}
                                <div className="relative overflow-hidden wl-checkerboard bg-[length:16px_16px]">
                                  {p.previewDataUrl ? (
                                    <>
                                      <img
                                        src={p.previewDataUrl}
                                        alt={p.title || "Logo concept"}
                                        className="w-full aspect-square object-contain p-3 transition-transform duration-500 group-hover:scale-[1.03]"
                                      />
                                      {/* Glassmorphic download overlay */}
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/5 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-end pb-5 gap-2">
                                        <a
                                          href={p.previewDataUrl}
                                          download={`${p.title || "concept"}.png`}
                                          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-paper/95 backdrop-blur-sm text-[11px] font-semibold text-ink shadow-xl hover:bg-paper transition-colors"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Download className="w-3.5 h-3.5" />
                                          Download PNG
                                        </a>
                                        {p.svg && (
                                          <a
                                            href={`data:image/svg+xml;base64,${btoa(p.svg)}`}
                                            download={`${p.title || "concept"}.svg`}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paper/85 backdrop-blur-sm text-[10px] font-medium text-ink/80 hover:bg-paper/95 transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Download className="w-3 h-3" />
                                            SVG
                                          </a>
                                        )}
                                      </div>
                                      {/* Format badge */}
                                      <div className="absolute top-2.5 right-2.5 flex gap-1">
                                        {p.svg && (
                                          <span className="px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-[8px] font-mono text-white/90 uppercase font-bold">
                                            SVG
                                          </span>
                                        )}
                                        <span className="px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-[8px] font-mono text-white/90 uppercase font-bold">
                                          PNG
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="w-full aspect-square flex items-center justify-center bg-gradient-to-br from-brand/5 to-brand-deep/5">
                                      <div className="text-center space-y-2">
                                        <Palette className="w-10 h-10 text-brand/20 mx-auto" />
                                        <p className="text-[10px] text-muted/60">
                                          Generating preview…
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Info & quick actions */}
                                <div className="px-3.5 py-3 space-y-2.5 border-t border-brand/8">
                                  <div>
                                    <p className="text-[12px] font-semibold text-ink leading-tight">
                                      {p.title}
                                    </p>
                                    <p className="text-[10px] text-muted/70 line-clamp-2 mt-0.5 leading-relaxed">
                                      {p.rationale}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {p.svg && (
                                      <ShadButton
                                        onClick={() =>
                                          respondToApproval(
                                            {
                                              callId: `vectorize-${p.conceptId}`,
                                              name: "vectorize_logo",
                                              label: "Vectorize concept",
                                              requiresApproval: true,
                                              input: { concept_id: p.conceptId, svg: p.svg },
                                            },
                                            true,
                                          )
                                        }
                                        className="px-2.5 py-1 rounded-md text-[10px] font-semibold border border-brand/25 bg-brand/5 text-brand hover:bg-brand/10"
                                      >
                                        <Sparkles className="w-2.5 h-2.5" />
                                        Vectorize
                                      </ShadButton>
                                    )}
                                    {p.svg && (
                                      <ShadButton
                                        onClick={() =>
                                          respondToApproval(
                                            {
                                              callId: `pack-${p.conceptId}`,
                                              name: "brand_pack_export",
                                              label: "Export brand pack",
                                              requiresApproval: true,
                                              input: {
                                                concept_id: p.conceptId,
                                                concept_name: p.title,
                                                svg: p.svg,
                                              },
                                            },
                                            true,
                                          )
                                        }
                                        className="px-2.5 py-1 rounded-md text-[10px] font-semibold border border-brand/20 bg-brand/5 text-brand hover:bg-brand/10"
                                      >
                                        <Download className="w-2.5 h-2.5" />
                                        Export pack
                                      </ShadButton>
                                    )}
                                    <ShadButton
                                      onClick={() =>
                                        setInput(
                                          `Refine concept ${p.title}: keep the core shape but adjust typography.`,
                                        )
                                      }
                                      className="px-2.5 py-1 rounded-md text-[10px] border border-black/10 hover:border-brand/20 hover:bg-brand/5"
                                    >
                                      Edit
                                    </ShadButton>
                                    <ShadButton
                                      onClick={() =>
                                        setInput(
                                          `Regenerate 3 new options from ${p.title} with stronger contrast.`,
                                        )
                                      }
                                      className="px-2.5 py-1 rounded-md text-[10px] border border-black/10 hover:border-brand/20 hover:bg-brand/5"
                                    >
                                      Regenerate
                                    </ShadButton>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Wireline Design render — dedicated live panel (non-streaming POST) */}
          {isSending && stitchRendering && (
            <div className={WL_DIRECTOR_CLASSES.threadColumn}>
              <DirectorStitchLiveSession operatorPrompt={stitchPrompt} />
            </div>
          )}

          {/* Live streaming — mission control panel */}
          {isSending && !stitchRendering && (
            <div className={WL_DIRECTOR_CLASSES.threadColumn}>
              <DirectorLiveSession
                phase={streamState.phase === "idle" ? "connecting" : streamState.phase}
                isDeep={streamState.isDeep}
                model={streamState.model}
                modelDisplayLabel={streamState.modelDisplayLabel}
                coachAgentName={focusedAgent?.name}
                thinkingText={streamState.thinkingText}
                thinkingDurationMs={streamState.thinkingDurationMs}
                replyPreview={
                  typeof streamState.reply?.reply === "string" ? streamState.reply.reply : undefined
                }
                pipelineSteps={streamPipeline}
                integrationActions={integrationLiveActions}
                liveSteps={liveSteps}
              />
            </div>
          )}
        </div>

        {!pinnedToBottom && messages.length > 0 && (
          <ShadButton
            type="button"
            variant="ghost"
            size="sm"
            disableAnimations
            onClick={scrollToLatest}
            className={cn(WL_DIRECTOR_CLASSES.scrollToBottom, "touch-press")}
            aria-label="Jump to latest messages"
          >
            <ChevronDown className="w-3.5 h-3.5" aria-hidden />
            Latest
          </ShadButton>
        )}
      </div>

      {featureFlags.artifactsPanel && artifacts.length > 0 && (
        <DirectorArtifactsPanel artifacts={artifacts} />
      )}

      {/* Composer — accessory panel sits above toolbar so chat stays readable */}
      <div className="relative z-30 shrink-0 px-4 pb-6 pt-2">
        <div className={cn(WL_DIRECTOR_CLASSES.composerColumn, "relative")} ref={composerDockRef}>
          <DirectorUsageIndicator className="absolute -top-1 right-0 z-40" />
          <div
            className={cn(
              "relative transition-all duration-300",
              WL_DIRECTOR_CLASSES.composerDock,
              isSending && "ring-1 ring-brand/20",
              composerAccessory && "wl-composer-dock--accessory-open",
            )}
          >
            {isSending && (
              <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-[inherit]">
                <motion.div
                  className="h-full bg-gradient-to-r from-brand/20 via-brand to-brand/20"
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            )}

            <DirectorComposerContextStrip
              focusAgentName={focusedAgent?.name}
              onClearCoach={focusAgentId ? clearCoachFocus : undefined}
            />

            <Textarea
              ref={inputRef}
              data-testid="director-composer"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              disabled={isSending}
              aria-describedby="director-composer-send-hint"
              title={DIRECTOR_COMPOSER_CONTEXT.sendHint}
              placeholder={
                isSending
                  ? "Director is working…"
                  : focusedAgent
                    ? `Coach ${focusedAgent.name} via Director…`
                    : DIRECTOR_COMPOSER_HINTS[composerHintIndex]
              }
              className={cn(
                WL_DIRECTOR_CLASSES.composerInput,
                "w-full resize-none border-0 bg-transparent shadow-none text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none px-4 py-3 leading-normal disabled:opacity-60 focus-visible:ring-0",
              )}
            />
            <span id="director-composer-send-hint" className="sr-only">
              {DIRECTOR_COMPOSER_CONTEXT.sendHint}
            </span>

            <DirectorComposerAccessory
              active={composerAccessory}
              onClose={() => setComposerAccessory(null)}
              agents={agents}
              focusAgentId={focusAgentId ?? null}
              focusedAgentName={focusedAgent?.name}
              enabledTools={enabledTools}
              isUploading={isUploading}
              reduceMotion={reduceMotion ?? false}
              onPickCapability={pickCapabilityExample}
              onSelectCoach={(agentId) => {
                onFocusAgentChange?.(agentId);
                if (agentId) setForceDeep(false);
                setComposerAccessory(null);
              }}
              onPickDocument={() => {
                setComposerAccessory(null);
                fileInputRef.current?.click();
              }}
              onPickContextRule={() => {
                setComposerAccessory(null);
                setInput("Add this standing rule to my fleet context: ");
                inputRef.current?.focus();
              }}
              onPickPlaybookInstruction={() => {
                setComposerAccessory(null);
                setInput("Coach my agents on this playbook: ");
                inputRef.current?.focus();
              }}
            />

            <div className={cn("px-3 pb-3", WL_DIRECTOR_CLASSES.composerSendRow)}>
              <DirectorComposerToolbar
                activeAccessory={composerAccessory}
                onToggle={toggleComposerAccessory}
                focusAgentId={focusAgentId ?? null}
                focusedAgentName={focusedAgent?.name}
                enabledToolsCount={enabledTools.length}
                isUploading={isUploading}
                isSending={isSending}
                forceDeep={forceDeep}
                onToggleForceDeep={() => setForceDeep((v) => !v)}
                chatModelSelection={chatModelSelection}
                onChatModelChange={setChatModelSelection}
                stitchMediaEnabled={featureFlags.stitchMedia}
                useStitchAccountBranding={useStitchAccountBranding}
                onToggleStitchAccountBranding={() => setUseStitchAccountBranding((v) => !v)}
                stitchBrandingAvailable={stitchBrandingAvailable}
              />

              <Input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={onFilePick}
                className="hidden"
              />

              <div className="flex items-center gap-2 shrink-0">
                <DirectorUsageIndicator className="sm:hidden shrink-0" />
                <ShadButton
                  type="button"
                  size="sm"
                  disableAnimations
                  onClick={() => send(input)}
                  disabled={!input.trim() || isSending}
                  aria-label="Send message"
                  className={cn(
                    WL_DIRECTOR_CLASSES.composerSendBtn,
                    "touch-press app-primary-action gap-2 px-4 shadow-md shadow-brand/25",
                  )}
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Send</span>
                </ShadButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
