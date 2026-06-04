/**
 * DirectorWorkspace — the account-level "manager" chat surface.
 *
 * Redesigned to be the main show — Claude-style:
 * - Massive chat area with spacious message bubbles
 * - Prominent composer at bottom, centered, always visible
 * - Capability toggles as clever dropdown menus near composer
 * - Agent reasoning displayed prominently with lots of breathing room
 *
 * The Director sits ABOVE the individual agents: it's always available (even
 * before the operator owns a single agent) and acts as the strategist that
 * helps plan the fleet, decide what agents to hire, and coach them.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
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
  Paperclip,
  FileText,
  Brain,
  Plug,
  Phone,
  Calendar,
  Users,
  MessageCircle,
  Video,
  FileSignature,
  Search,
  ShoppingBag,
  Grid3X3,
  Megaphone,
  Table,
  SlidersHorizontal,
  Power,
  Mail,
  Wrench,
  Search as SearchIcon,
  Palette,
  Download,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import { authFetch, readApiJson } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { hydrateAgentsFromFleet, useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import { ThinkingDisplay } from "./ui/ThinkingDisplay";
import type { PipelineStep } from "./ui/LiveTaskPipeline";
import { ArtifactCard, type ArtifactType } from "./ui/ArtifactCard";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { Input } from "./ui/shadcn/Input";
import { Textarea } from "./ui/shadcn/Textarea";
import { useStreamingChat } from "../hooks/useStreamingChat";
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
import { INTEGRATION_STYLES } from "../lib/integration-activities";
import type { ToolIntegration } from "../lib/agent-capabilities";
import {
  DIRECTOR_EMPTY_HERO,
  DIRECTOR_STARTER_PROMPTS,
  WL_DIRECTOR_CLASSES,
} from "../lib/wireline-director-design";

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
}

interface DirectorArtifact {
  id: string;
  name: string;
  toolName: string;
  artifactType: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
  downloadUrl: string;
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
  reasoning?: string;
  thinkingDurationMs?: number;
  model?: "sonnet" | "opus";
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

const CONNECTOR_CATALOG = [
  { icon: Phone, id: "twilio", label: "Twilio", desc: "Voice & SMS" },
  { icon: Calendar, id: "calendar", label: "Calendar", desc: "Google / Outlook" },
  { icon: Users, id: "crm", label: "CRM", desc: "Salesforce / HubSpot" },
  { icon: MessageCircle, id: "slack", label: "Slack", desc: "Team notifications" },
  { icon: Video, id: "zoom", label: "Zoom", desc: "Meeting links" },
  { icon: FileSignature, id: "docusign", label: "DocuSign", desc: "Contracts" },
  { icon: Search, id: "apollo", label: "Apollo", desc: "Lead enrichment" },
  { icon: ShoppingBag, id: "shopify", label: "Shopify", desc: "E-commerce" },
  { icon: Grid3X3, id: "square", label: "Square", desc: "Payments & POS" },
  { icon: MessageCircle, id: "microsoft_teams", label: "MS Teams", desc: "Team notifications" },
  { icon: Table, id: "microsoft_excel", label: "Excel", desc: "Call logging" },
  { icon: Table, id: "google_sheets", label: "Google Sheets", desc: "Call logging" },
  { icon: Megaphone, id: "meta", label: "Meta CAPI", desc: "Lead attribution" },
] as const;

type MessageScene =
  | "creative"
  | "analysis"
  | "integration"
  | "training"
  | "comms"
  | "fleet"
  | "general";

const SCENE_PATTERNS: Array<{ scene: MessageScene; re: RegExp }> = [
  {
    scene: "creative",
    re: /\b(logo|brand.?pack|design|illustration|image|video|visual|color.?palette|generat.*image|creat.*visual|render|mockup|artwork|icon.?set|banner|thumbnail|svg|vectorize|brand.?kit|creative)\b/i,
  },
  {
    scene: "analysis",
    re: /\b(audit|research|competitor|analyz|metrics|report|insight|benchmark|forecast|trend|breakdown|assess|evaluat|pricing|market)\b/i,
  },
  {
    scene: "integration",
    re: /\b(shopify|crm|hubspot|salesforce|slack|twilio|square|calendar|docusign|zoom|excel|sheets|api|webhook|integration)\b/i,
  },
  {
    scene: "training",
    re: /\b(train|knowledge|playbook|instruction|learn|teach|script|guide|onboard|curriculum|module|lesson|practice)\b/i,
  },
  {
    scene: "comms",
    re: /\b(call|sms|outreach|follow.?up|campaign|broadcast|sequence|dial|ring)\b/i,
  },
  {
    scene: "fleet",
    re: /\b(agent|deploy|hire|configure|fleet|workforce|capability)\b/i,
  },
];

function detectMessageScene(
  content: string,
  previews?: DirectorPreview[],
  proposals?: DirectorMessage["proposals"],
): MessageScene {
  if (previews && previews.length > 0) return "creative";
  if (proposals?.integrationJobs && proposals.integrationJobs.length > 0) return "integration";
  for (const { scene, re } of SCENE_PATTERNS) {
    if (re.test(content)) return scene;
  }
  return "general";
}

const SCENE_META: Record<
  Exclude<MessageScene, "general">,
  { icon: React.ElementType; label: string; color: string; bg: string }
> = {
  creative: {
    icon: Palette,
    label: "Creative",
    color: "text-fuchsia-500",
    bg: "bg-fuchsia-500/8 border-fuchsia-500/20",
  },
  analysis: {
    icon: BarChart3,
    label: "Analysis",
    color: "text-blue-500",
    bg: "bg-blue-500/8 border-blue-500/20",
  },
  integration: {
    icon: Plug,
    label: "Integration",
    color: "text-emerald-500",
    bg: "bg-emerald-500/8 border-emerald-500/20",
  },
  training: {
    icon: GraduationCap,
    label: "Training",
    color: "text-amber-500",
    bg: "bg-amber-500/8 border-amber-500/20",
  },
  comms: {
    icon: MessageCircle,
    label: "Comms",
    color: "text-sky-500",
    bg: "bg-sky-500/8 border-sky-500/20",
  },
  fleet: {
    icon: Bot,
    label: "Fleet Ops",
    color: "text-brand",
    bg: "bg-brand/8 border-brand/20",
  },
};

export default function DirectorWorkspace({
  focusAgentId = null,
  onFocusAgentChange,
}: DirectorWorkspaceProps) {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { agents } = useAgents();
  const focusedAgent = focusAgentId ? agents.find((a) => a.id === focusAgentId) : undefined;
  const { error: toastError, success: toastSuccess } = useToast();
  const [messages, setMessages] = useState<DirectorMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [resolved, setResolved] = useState<Record<string, "done" | "dismissed">>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | undefined>();
  const [callConsent, setCallConsent] = useState<Record<string, boolean>>({});
  const [integrationLiveActions, setIntegrationLiveActions] = useState<IntegrationLiveAction[]>([]);
  const [liveSteps, setLiveSteps] = useState<DirectorLiveStep[]>([]);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [artifacts, setArtifacts] = useState<DirectorArtifact[]>([]);
  const [featureFlags, setFeatureFlags] = useState({
    toolExecution: true,
    creativeTools: true,
    artifactsPanel: true,
  });
  const [loadDegraded, setLoadDegraded] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const connectorsRef = useRef<HTMLDivElement | null>(null);
  const coachRef = useRef<HTMLDivElement | null>(null);
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const attachmentsRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSendRef = useRef<{ trimmed: string; optimisticId?: string } | null>(null);
  const liveSequenceKeyRef = useRef<string | null>(null);
  const sendNonStreamingRef = useRef<
    ((trimmed: string, optimisticId?: string) => Promise<void>) | null
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
        reasoning: (data.reasoning as string) || undefined,
        thinkingDurationMs: (data.thinkingDurationMs as number) || undefined,
        model: (data.model as "sonnet" | "opus") || undefined,
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
            });
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
      setIsSending(false);
      streamReset();
      pendingSendRef.current = null;
      inputRef.current?.focus();
    },
    onError: (msg, { streamEstablished: _streamEstablished }) => {
      const pending = pendingSendRef.current;
      if (pending?.trimmed) {
        void sendNonStreamingRef.current?.(pending.trimmed, pending.optimisticId);
        return;
      }
      void loadMessages();
      toastError("Stream interrupted", msg);
      setIsSending(false);
      streamReset();
      pendingSendRef.current = null;
      inputRef.current?.focus();
    },
  });

  const sendNonStreaming = useCallback(
    async (trimmed: string, optimisticId?: string, opts?: { skipOperatorPersist?: boolean }) => {
      try {
        const r = await authFetch("/api/director/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            ...(focusAgentId ? { focusAgentId } : {}),
            ...(opts?.skipOperatorPersist ? { skipOperatorPersist: true } : {}),
          }),
        });
        const parsed = await readApiJson<Record<string, unknown>>(r);
        if (!parsed.ok) throw new Error(parsed.error);
        appendDirectorReply(parsed.data);
      } catch {
        if (optimisticId) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
        setInput(trimmed);
        toastError("Couldn't send", "Try again in a moment");
      } finally {
        setIsSending(false);
        streamReset();
        pendingSendRef.current = null;
        inputRef.current?.focus();
      }
    },
    [appendDirectorReply, streamReset, toastError, focusAgentId],
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
        label: streamState.isDeep ? "Deep analysis (Opus)" : "Reasoning",
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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [
    messages,
    isSending,
    streamState.thinkingText,
    streamState.reply,
    streamState.phase,
    integrationLiveActions.length,
  ]);

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
    const handleClickOutside = (e: MouseEvent) => {
      if (connectorsRef.current && !connectorsRef.current.contains(e.target as Node)) {
        setConnectorsOpen(false);
      }
      if (coachRef.current && !coachRef.current.contains(e.target as Node)) {
        setCoachOpen(false);
      }
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
      if (attachmentsRef.current && !attachmentsRef.current.contains(e.target as Node)) {
        setAttachmentsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    async (text: string, opts?: { approval?: DirectorApproval }) => {
      const trimmed = text.trim();
      if ((!trimmed && !opts?.approval) || isSending) return;
      const optimistic: DirectorMessage | null = trimmed
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
      setConnectorsOpen(false);
      setCoachOpen(false);

      const payload = {
        content: trimmed,
        ...(focusAgentId ? { focusAgentId } : {}),
        ...(opts?.approval ? { approval: opts.approval } : {}),
      };

      // Use streaming for regular messages (no approvals — those stay non-streaming)
      if (!opts?.approval) {
        pendingSendRef.current = { trimmed, optimisticId: optimistic?.id };
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
    [isSending, toastError, streamSend, focusAgentId],
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
    if (!confirm("Clear your entire conversation with the Director?")) return;
    try {
      const r = await authFetch("/api/director/messages", { method: "DELETE" });
      if (!r.ok) throw new Error("Clear failed");
      setMessages([]);
      toastSuccess("Thread cleared", "Fresh start with your Director");
    } catch {
      toastError("Couldn't clear thread");
    }
  }, [toastError, toastSuccess]);

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

  return (
    <div data-testid="director-workspace" className="flex flex-col h-full min-h-0 bg-transparent">
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
              <span className="shrink-0 flex w-9 h-9 items-center justify-center rounded-full bg-gradient-to-br from-brand via-[#9B5CE0] to-brand-deep text-on-brand shadow-md shadow-brand/25 ring-1 ring-white/10 relative overflow-hidden group">
                <span
                  aria-hidden
                  className="absolute inset-0 pointer-events-none mix-blend-soft-light"
                  style={{
                    background:
                      "linear-gradient(145deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.06) 28%, transparent 52%, rgba(0,0,0,0.12) 78%)",
                  }}
                />
                <Compass className="w-4 h-4 relative z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]" />
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
                ) : (
                  "Always-on fleet manager"
                )}
              </p>
            </div>
          </div>
          <ShadButton
            type="button"
            variant="ghost"
            size="sm"
            disableAnimations
            onClick={clearThread}
            className="touch-press shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted hover:text-rose-600 hover:bg-rose-500/8 h-auto px-2.5 py-1.5"
            aria-label="Clear thread"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </ShadButton>
        </div>
      )}

      {/* Messages - isolated scroll viewport */}
      <div ref={scrollRef} className="flex-1 min-h-0 scroll-viewport px-4 py-8 space-y-6">
        {loadDegraded && !isLoading && (
          <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-[11px] text-destructive dark:text-destructive-foreground">
            Some Director data could not be loaded. Your thread may be incomplete — refresh to
            retry.
          </p>
        )}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-10 h-10 rounded-md bg-gradient-to-br from-brand/20 to-brand/10 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
            </div>
            <p className="text-[11px] text-muted uppercase tracking-[0.2em]">Loading thread</p>
          </div>
        ) : messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center pt-8 pb-4 max-w-lg mx-auto"
          >
            {/* Hero identity */}
            <div className={cn("relative mb-6", WL_DIRECTOR_CLASSES.heroOrb)}>
              <div className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150" />
              <span className="flex w-16 h-16 items-center justify-center rounded-md bg-gradient-to-br from-brand via-[#9B5CE0] to-brand-deep text-on-brand shadow-lg shadow-brand/25 ring-1 ring-white/10 relative overflow-hidden group">
                <span
                  aria-hidden
                  className="absolute inset-0 pointer-events-none mix-blend-soft-light"
                  style={{
                    background:
                      "linear-gradient(145deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 28%, transparent 52%, rgba(0,0,0,0.15) 78%)",
                  }}
                />
                <span
                  aria-hidden
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(125deg, transparent 20%, rgba(255,255,255,0.3) 42%, transparent 64%)",
                    transform: "translateX(-30%)",
                    animation: "medallion-facet 2.8s ease-in-out infinite",
                  }}
                />
                <Compass className="w-8 h-8 relative z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]" />
              </span>
            </div>

            <p className="text-[10px] uppercase tracking-[0.22em] text-brand/70 font-semibold mb-2">
              {DIRECTOR_EMPTY_HERO.eyebrow}
            </p>
            <h2 className="text-[22px] sm:text-[26px] font-bold text-ink tracking-[-0.03em] leading-tight mb-2">
              {DIRECTOR_EMPTY_HERO.title}{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-deep">
                {DIRECTOR_EMPTY_HERO.titleAccent}
              </span>
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

            {/* Starter prompts */}
            <div className="flex flex-wrap justify-center gap-2 w-full">
              {DIRECTOR_STARTER_PROMPTS.map((p) => (
                <ShadButton
                  key={p.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disableAnimations
                  title={p.intent}
                  onClick={() => send(p.label)}
                  className={cn(
                    "touch-press group h-auto text-left text-[11px] text-ink/80 px-3 py-2 gap-2",
                    WL_DIRECTOR_CLASSES.starterChip,
                  )}
                >
                  <span className="min-w-0">{p.label}</span>
                  <ArrowUpRight className="w-3 h-3 shrink-0 text-brand/50 group-hover:text-brand transition-colors" />
                </ShadButton>
              ))}
            </div>
          </motion.div>
        ) : (
          messages.map((m) => {
            const scene =
              m.role === "director"
                ? detectMessageScene(m.content, m.previews, m.proposals)
                : "general";
            const sceneMeta =
              scene !== "general" ? SCENE_META[scene as Exclude<MessageScene, "general">] : null;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className={cn("flex flex-col", m.role === "operator" ? "items-end" : "items-start")}
              >
                {/* Director avatar + scene badge */}
                {m.role === "director" && (
                  <div className="flex items-center gap-2 mb-2 ml-1">
                    <span className="shrink-0 flex w-7 h-7 items-center justify-center rounded-md bg-gradient-to-br from-brand via-[#9B5CE0] to-brand-deep text-on-brand shadow-sm shadow-brand/25 ring-1 ring-white/10 relative overflow-hidden group">
                      <span
                        aria-hidden
                        className="absolute inset-0 pointer-events-none mix-blend-soft-light"
                        style={{
                          background:
                            "linear-gradient(145deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.06) 28%, transparent 52%, rgba(0,0,0,0.12) 78%)",
                        }}
                      />
                      <Compass className="w-3.5 h-3.5 relative z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]" />
                    </span>
                    <span className="text-[10px] text-muted uppercase tracking-[0.14em] font-medium">
                      Director
                      {m.coachAgentName ? (
                        <span className="text-brand/70 normal-case tracking-normal">
                          {" "}
                          · coaching {m.coachAgentName}
                        </span>
                      ) : null}
                    </span>
                    {sceneMeta && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[8px] uppercase tracking-[0.14em] font-bold transition-colors",
                          sceneMeta.bg,
                          sceneMeta.color,
                        )}
                      >
                        <sceneMeta.icon className="w-2.5 h-2.5" />
                        {sceneMeta.label}
                      </motion.span>
                    )}
                  </div>
                )}

                {/* Message bubble */}
                <div
                  className={cn(
                    "max-w-[75%] min-w-[200px] rounded-md px-5 py-4 whitespace-pre-wrap break-words relative",
                    m.role === "operator"
                      ? cn(WL_DIRECTOR_CLASSES.operatorBubble, "text-white rounded-br-sm")
                      : cn(
                          WL_DIRECTOR_CLASSES.directorBubble,
                          "text-ink dark:text-foreground rounded-bl-sm",
                        ),
                  )}
                >
                  {/* Reasoning display - Claude style */}
                  {m.role === "director" && m.reasoning && (
                    <ThinkingDisplay
                      reasoning={m.reasoning}
                      thinkingDurationMs={m.thinkingDurationMs}
                      isDeep={m.model === "opus"}
                      animate={false}
                    />
                  )}

                  {m.role === "director" ? (
                    <>
                      <DirectorMessageBody content={m.content} />
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
                              onClick={() => void send(prior.content)}
                            >
                              Retry message
                            </ShadButton>
                          );
                        })()}
                    </>
                  ) : (
                    <p className="text-[14px] leading-relaxed">{m.content}</p>
                  )}

                  {m.role === "director" && m.proposals && (
                    <div className="mt-3 pt-3 border-t border-black/5 space-y-2">
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
                                    tone="emerald"
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
                              const agentId = job.agentId || resolveCoachAgentId(m) || focusAgentId;
                              return (
                                <ProposalCard
                                  key={key}
                                  icon={jobIcon}
                                  tone="brand"
                                  title={job.label}
                                  detail={[job.summary, job.query ? `Query: ${job.query}` : ""]
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

                  {/* Timestamp */}
                  {m.createdAt && (
                    <div className="mt-2 pt-1 border-t border-black/5 flex justify-end">
                      <time
                        dateTime={m.createdAt}
                        className={cn(
                          "text-[9px] font-mono tabular-nums",
                          m.role === "operator" ? "text-white/50" : "text-muted/50",
                        )}
                      >
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  )}
                </div>

                {/* Suggestions */}
                {m.suggestions && m.suggestions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 ml-1">
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
                          className="group h-auto text-[11px] font-medium text-brand rounded-full border-brand/20 bg-brand/[0.04] px-3 py-1.5 hover:bg-brand/10 hover:border-brand/40"
                        >
                          <Icon className="w-3 h-3" />
                          {s.label}
                          <ArrowUpRight className="w-2.5 h-2.5 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
                        </ShadButton>
                      );
                    })}
                  </div>
                )}

                {m.researchSources && m.researchSources.length > 0 && (
                  <div className="mt-3 ml-1 flex flex-wrap gap-2 max-w-[560px]">
                    <span className="text-[10px] uppercase tracking-[0.25em] text-muted w-full">
                      Web sources
                    </span>
                    {m.researchSources.map((s, i) =>
                      s.uri ? (
                        <a
                          key={`${s.uri}-${i}`}
                          href={s.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] rounded-full border border-brand/20 bg-brand/[0.04] px-3 py-1 text-brand hover:bg-brand/10"
                        >
                          {s.title || "Source"}
                        </a>
                      ) : (
                        <span
                          key={`${s.title}-${i}`}
                          className="text-[11px] rounded-full border border-black/10 px-3 py-1 text-muted"
                        >
                          {s.title || "Source"}
                        </span>
                      ),
                    )}
                  </div>
                )}

                {m.role === "director" &&
                  m.id === lastDirectorMessageId &&
                  m.clarifyingQuestions &&
                  m.clarifyingQuestions.length > 0 && (
                    <div className="mt-3 ml-1 flex flex-wrap gap-2 max-w-[560px]">
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
                          className="h-auto text-[11px] text-left rounded-full border-brand/20 bg-brand/[0.04] px-3 py-1.5 hover:bg-brand/10"
                        >
                          {q}
                        </ShadButton>
                      ))}
                    </div>
                  )}

                {m.approvals && m.approvals.length > 0 && (
                  <div className="mt-3 ml-1 space-y-2 w-full max-w-[560px]">
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

                {m.previews && m.previews.length > 0 && (
                  <div className="mt-4 ml-1 w-full max-w-[720px]">
                    {/* Gallery header */}
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-fuchsia-500/10 to-violet-500/10 border border-fuchsia-500/20">
                        <Sparkles className="w-3 h-3 text-fuchsia-500" />
                        <span className="text-[9px] uppercase tracking-[0.12em] font-bold text-fuchsia-600 dark:text-fuchsia-400">
                          {m.previews.length} concept{m.previews.length !== 1 ? "s" : ""} generated
                        </span>
                      </span>
                    </div>

                    <div
                      className={cn(
                        "grid gap-3",
                        m.previews.length === 1 ? "grid-cols-1 max-w-[420px]" : "sm:grid-cols-2",
                      )}
                    >
                      {m.previews.map((p) => (
                        <motion.div
                          key={p.conceptId}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="group relative rounded-md border border-brand/12 bg-white/90 dark:bg-[#1a1225]/60 overflow-hidden shadow-sm hover:shadow-xl hover:border-brand/25 transition-all duration-300"
                        >
                          {/* Image canvas with hover overlay */}
                          <div className="relative overflow-hidden bg-[repeating-conic-gradient(#f0f0f0_0%_25%,#ffffff_0%_50%)] dark:bg-[repeating-conic-gradient(#1a1a2e_0%_25%,#0f0c17_0%_50%)] bg-[length:16px_16px]">
                            {p.previewDataUrl ? (
                              <>
                                <img
                                  src={p.previewDataUrl}
                                  alt={p.title || "Logo concept"}
                                  className="w-full aspect-square object-contain p-6 transition-transform duration-500 group-hover:scale-[1.03]"
                                />
                                {/* Glassmorphic download overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/5 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-end pb-5 gap-2">
                                  <a
                                    href={p.previewDataUrl}
                                    download={`${p.title || "concept"}.png`}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/95 backdrop-blur-sm text-[11px] font-semibold text-ink shadow-xl hover:bg-white transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Download PNG
                                  </a>
                                  {p.svg && (
                                    <a
                                      href={`data:image/svg+xml;base64,${btoa(p.svg)}`}
                                      download={`${p.title || "concept"}.svg`}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-sm text-[10px] font-medium text-ink/80 hover:bg-white/90 transition-colors"
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
                              <div className="w-full aspect-square flex items-center justify-center bg-gradient-to-br from-brand/5 to-fuchsia-500/5">
                                <div className="text-center space-y-2">
                                  <Palette className="w-10 h-10 text-brand/20 mx-auto" />
                                  <p className="text-[10px] text-muted/60">Generating preview…</p>
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
                                  className="px-2.5 py-1 rounded-md text-[10px] font-semibold border border-fuchsia-500/25 bg-fuchsia-500/5 text-fuchsia-600 hover:bg-fuchsia-500/10"
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
              </motion.div>
            );
          })
        )}

        {/* Live streaming — mission control panel */}
        {isSending && (
          <DirectorLiveSession
            phase={streamState.phase === "idle" ? "connecting" : streamState.phase}
            isDeep={streamState.isDeep}
            model={streamState.model}
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
        )}
      </div>

      {featureFlags.artifactsPanel &&
        artifacts.length > 0 &&
        (() => {
          const imageArts = artifacts.filter(
            (a) =>
              a.mimeType?.startsWith("image/") ||
              a.artifactType === "svg" ||
              a.artifactType === "image",
          );
          const fileArts = artifacts.filter(
            (a) =>
              !a.mimeType?.startsWith("image/") &&
              a.artifactType !== "svg" &&
              a.artifactType !== "image",
          );
          return (
            <div className="shrink-0 px-4 pb-2">
              <div className="max-w-3xl mx-auto rounded-md border border-brand/15 bg-white/80 dark:bg-black/15 backdrop-blur-sm p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted font-semibold">
                      <FileText className="w-3 h-3 text-brand/60" />
                      Generated artifacts
                    </span>
                    <span className="text-[10px] text-muted/50 font-mono tabular-nums">
                      {artifacts.length} file{artifacts.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {/* Image artifact thumbnails — the actual logos/visuals */}
                {imageArts.length > 0 && (
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.16em] text-fuchsia-500/70 font-semibold mb-2 flex items-center gap-1.5">
                      <ImageIcon className="w-3 h-3" />
                      Media · {imageArts.length} image{imageArts.length !== 1 ? "s" : ""}
                    </p>
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                      {imageArts.slice(0, 12).map((a) => (
                        <div
                          key={a.id}
                          className="group relative rounded-md border border-brand/10 overflow-hidden bg-[repeating-conic-gradient(#f0f0f0_0%_25%,#ffffff_0%_50%)] dark:bg-[repeating-conic-gradient(#1a1a2e_0%_25%,#0f0c17_0%_50%)] bg-[length:12px_12px] aspect-square"
                        >
                          <img
                            src={a.downloadUrl}
                            alt={a.name}
                            className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                          {/* Hover overlay with download */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col items-center justify-end pb-2">
                            <a
                              href={a.downloadUrl}
                              download={a.name}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-sm text-[9px] font-semibold text-ink shadow-lg hover:bg-white transition-colors"
                            >
                              <Download className="w-2.5 h-2.5" />
                              Download
                            </a>
                          </div>
                          {/* File info strip */}
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-2 pt-3 pb-1.5 opacity-100 group-hover:opacity-0 transition-opacity">
                            <p className="text-[8px] text-white/90 font-medium truncate leading-tight">
                              {a.name}
                            </p>
                          </div>
                          {/* Format badge */}
                          <div className="absolute top-1.5 right-1.5 px-1 py-0.5 rounded bg-black/40 backdrop-blur-sm text-[7px] font-mono text-white/80 uppercase font-bold">
                            {a.mimeType?.split("/")[1]?.replace("+xml", "") || a.artifactType}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Non-image artifacts */}
                {fileArts.length > 0 && (
                  <div className={cn(imageArts.length > 0 && "pt-2 border-t border-brand/8")}>
                    {imageArts.length > 0 && (
                      <p className="text-[9px] uppercase tracking-[0.16em] text-muted/60 font-semibold mb-2 flex items-center gap-1.5">
                        <FileText className="w-3 h-3" />
                        Files · {fileArts.length}
                      </p>
                    )}
                    <div className="grid gap-2 max-h-48 overflow-auto sm:grid-cols-2">
                      {fileArts.slice(0, 12).map((a) => (
                        <ArtifactCard
                          key={a.id}
                          name={a.name}
                          type={a.artifactType as ArtifactType}
                          mimeType={a.mimeType}
                          sizeBytes={a.sizeBytes}
                          downloadUrl={a.downloadUrl}
                          metadata={a.metadata}
                          className="w-full"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* Composer - prominent at bottom, Claude-style */}
      <div className="shrink-0 px-4 pb-6 pt-2">
        <div className="max-w-3xl mx-auto">
          {/* Connectors dropdown */}
          <div ref={connectorsRef} className="relative mb-2">
            <AnimatePresence>
              {connectorsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-0 right-0 mb-2 rounded-md bg-popover text-popover-foreground backdrop-blur-md border border-border shadow-2xl p-2 z-20"
                >
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border mb-1">
                    <Plug className="w-3.5 h-3.5 text-brand" />
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                      Connectors
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 max-h-[40vh] overflow-y-auto">
                    {CONNECTOR_CATALOG.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-md hover:bg-muted/40 group"
                      >
                        <span className="w-7 h-7 rounded-md bg-brand/15 flex items-center justify-center shrink-0">
                          <c.icon className="w-3.5 h-3.5 text-brand" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-foreground truncate">
                            {c.label}
                          </p>
                          <p className="text-[9px] text-muted-foreground truncate">{c.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 pt-1.5 border-t border-border">
                    <a
                      href="/integrations"
                      className="flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-brand hover:text-brand/80 transition-colors"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                      Manage integrations
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Main composer — specular depth treatment */}
          <div
            className={cn(
              "relative transition-all duration-300",
              WL_DIRECTOR_CLASSES.composerDock,
              isSending && "ring-1 ring-brand/20",
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
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={3}
              disabled={isSending}
              placeholder={
                isSending
                  ? "Director is working…"
                  : focusedAgent
                    ? `Coach ${focusedAgent.name} via Director…`
                    : "Message Director…"
              }
              className="w-full resize-none border-0 bg-transparent shadow-none text-[14px] text-foreground placeholder:text-muted-foreground/50 outline-none px-5 py-4 leading-relaxed disabled:opacity-60 focus-visible:ring-0"
            />

            {/* Bottom bar with actions */}
            <div className="flex items-center justify-between px-4 pb-3">
              <div className="flex items-center gap-2">
                {/* Left side - connectors toggle */}
                <ShadButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disableAnimations
                  onClick={() => setConnectorsOpen(!connectorsOpen)}
                  className={cn(
                    "h-auto gap-1.5 px-3 py-1.5 rounded-md text-[11px]",
                    connectorsOpen && "bg-brand/10 text-brand border-brand/30",
                  )}
                >
                  <Plug className="w-3.5 h-3.5" />
                  <span>Connectors</span>
                  <ChevronDown
                    className={cn("w-3 h-3 transition-transform", connectorsOpen && "rotate-180")}
                  />
                </ShadButton>

                {/* Coach — select agent to configure */}
                <div className="relative" ref={coachRef}>
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => setCoachOpen(!coachOpen)}
                    className={cn(
                      "h-auto gap-1.5 px-3 py-1.5 rounded-md text-[11px]",
                      (coachOpen || focusAgentId) && "bg-brand/10 text-brand border-brand/30",
                    )}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>{focusedAgent ? focusedAgent.name : "Coach"}</span>
                    <ChevronDown
                      className={cn("w-3 h-3 transition-transform", coachOpen && "rotate-180")}
                    />
                  </ShadButton>
                  <AnimatePresence>
                    {coachOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-2 w-56 rounded-md bg-popover text-popover-foreground backdrop-blur-md border border-border shadow-2xl p-1 z-20 max-h-[40vh] overflow-y-auto"
                      >
                        <ShadButton
                          type="button"
                          variant="ghost"
                          disableAnimations
                          onClick={() => {
                            onFocusAgentChange?.(null);
                            setCoachOpen(false);
                          }}
                          className={cn(
                            "w-full justify-start gap-2 px-3 py-2 h-auto text-[11px] rounded-md",
                            !focusAgentId && "bg-brand/8 text-brand font-medium",
                          )}
                        >
                          Fleet only
                        </ShadButton>
                        {agents.map((a) => (
                          <ShadButton
                            key={a.id}
                            type="button"
                            variant="ghost"
                            disableAnimations
                            onClick={() => {
                              onFocusAgentChange?.(a.id);
                              setCoachOpen(false);
                            }}
                            className={cn(
                              "w-full justify-start gap-2 px-3 py-2 h-auto rounded-md",
                              focusAgentId === a.id && "bg-brand/8",
                            )}
                          >
                            <span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-[10px] font-bold flex items-center justify-center shrink-0">
                              {a.name.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[11px] font-semibold truncate">
                                {a.name}
                              </span>
                              <span className="block text-[9px] text-muted-foreground truncate">
                                {a.role?.replace(/_/g, " ") || "Agent"}
                              </span>
                            </span>
                          </ShadButton>
                        ))}
                        {agents.length === 0 && (
                          <p className="px-3 py-2 text-[10px] text-muted-foreground">
                            Deploy an agent first
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {focusAgentId && (
                  <div className="relative" ref={toolsRef}>
                    <ShadButton
                      type="button"
                      variant="outline"
                      size="sm"
                      disableAnimations
                      onClick={() => setToolsOpen(!toolsOpen)}
                      className={cn(
                        "h-auto gap-1.5 px-3 py-1.5 rounded-md text-[11px]",
                        toolsOpen && "bg-brand/10 text-brand border-brand/30",
                      )}
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      <span>Abilities</span>
                      {enabledTools.length > 0 && (
                        <span className="text-[9px] opacity-70">({enabledTools.length})</span>
                      )}
                      <ChevronDown
                        className={cn("w-3 h-3 transition-transform", toolsOpen && "rotate-180")}
                      />
                    </ShadButton>
                    <AnimatePresence>
                      {toolsOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                          className="absolute bottom-full left-0 mb-2 w-64 rounded-md bg-popover text-popover-foreground backdrop-blur-md border border-border shadow-2xl p-2 z-20 max-h-[40vh] overflow-y-auto"
                        >
                          <p className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                            {enabledTools.length > 0
                              ? `${enabledTools.length} active for ${focusedAgent?.name || "agent"}`
                              : "No abilities enabled"}
                          </p>
                          {enabledTools.length === 0 ? (
                            <p className="px-2 py-2 text-[11px] text-muted-foreground">
                              Ask the Director to turn on capabilities.
                            </p>
                          ) : (
                            enabledTools.map((tool) => {
                              const meta = AGENT_TOOL_CATALOG.find((t) => t.name === tool);
                              return (
                                <div
                                  key={tool}
                                  className="px-2 py-1.5 text-[11px] text-foreground rounded-md"
                                >
                                  {meta?.label || tool}
                                </div>
                              );
                            })
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Hidden file input */}
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={onFilePick}
                  className="hidden"
                />

                {/* Attachments dropdown toggle */}
                <div className="relative" ref={attachmentsRef}>
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => setAttachmentsOpen(!attachmentsOpen)}
                    disabled={isUploading || isSending}
                    className={cn(
                      "h-auto gap-1.5 px-3 py-1.5 rounded-md text-[11px]",
                      attachmentsOpen && "bg-brand/10 text-brand border-brand/30",
                    )}
                  >
                    {isUploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                    ) : (
                      <Paperclip className="w-3.5 h-3.5" />
                    )}
                    <span>Attach</span>
                    <ChevronDown
                      className={cn(
                        "w-3 h-3 transition-transform",
                        attachmentsOpen && "rotate-180",
                      )}
                    />
                  </ShadButton>

                  <AnimatePresence>
                    {attachmentsOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-2 w-48 rounded-md bg-popover text-popover-foreground backdrop-blur-md border border-border shadow-2xl p-1 z-20"
                      >
                        <ShadButton
                          type="button"
                          variant="ghost"
                          disableAnimations
                          onClick={() => {
                            setAttachmentsOpen(false);
                            fileInputRef.current?.click();
                          }}
                          className="w-full justify-start gap-2 px-3 py-2 h-auto rounded-md"
                        >
                          <FileText className="w-4 h-4 text-brand" />
                          <div>
                            <span className="block text-[11px] font-semibold text-foreground">
                              Document
                            </span>
                            <span className="block text-[9px] text-muted-foreground">
                              PDFs & files
                            </span>
                          </div>
                        </ShadButton>

                        <ShadButton
                          type="button"
                          variant="ghost"
                          disableAnimations
                          onClick={() => {
                            setAttachmentsOpen(false);
                            toastSuccess("Added to knowledge", "Global context updated");
                          }}
                          className="w-full justify-start gap-2 px-3 py-2 h-auto rounded-md"
                        >
                          <Brain className="w-4 h-4 text-brand" />
                          <div>
                            <span className="block text-[11px] font-semibold text-foreground">
                              Context
                            </span>
                            <span className="block text-[9px] text-muted-foreground">
                              Add a global rule
                            </span>
                          </div>
                        </ShadButton>

                        <ShadButton
                          type="button"
                          variant="ghost"
                          disableAnimations
                          onClick={() => {
                            setAttachmentsOpen(false);
                            toastSuccess("Skill learned", "New ability registered");
                          }}
                          className="w-full justify-start gap-2 px-3 py-2 h-auto rounded-md"
                        >
                          <GraduationCap className="w-4 h-4 text-brand" />
                          <div>
                            <span className="block text-[11px] font-semibold text-foreground">
                              Instruction
                            </span>
                            <span className="block text-[9px] text-muted-foreground">
                              Add a playbook
                            </span>
                          </div>
                        </ShadButton>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Right side - send */}

              <div className="flex items-center gap-2">
                <ShadButton
                  type="button"
                  size="sm"
                  disableAnimations
                  onClick={() => send(input)}
                  disabled={!input.trim() || isSending}
                  aria-label="Send message"
                  className="touch-press gap-2 px-4 py-2 h-auto text-[12px] font-semibold shadow-md shadow-brand/25"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Send</span>
                </ShadButton>
              </div>
            </div>
          </div>

          {/* Subtle hint */}
          <p className="text-center text-[9px] text-muted/60 mt-2 uppercase tracking-[0.12em]">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
