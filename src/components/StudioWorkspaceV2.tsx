import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  Check,
  Cpu,
  FileImage,
  FileText,
  Loader2,
  Mic,
  Paperclip,
  Plus,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { authFetch, safeJson } from "../lib/api";
import {
  AGENTS_CHANGED_EVENT,
  useAgents,
  type WorkspaceAgentSummary,
} from "../contexts/AgentsContext";
import { AGENT_TOOL_CATALOG, type AgentToolName } from "../lib/agent-capabilities";
import OpenRouterModelPicker from "./OpenRouterModelPicker";
import WorkspaceShell from "./WorkspaceShell";
import { VoiceFieldSelect, type VoiceOption } from "./fleet-settings/VoiceSelector";
import { AgentGrid } from "./fleet/helpers";
import { PREMIUM_VOICES } from "./fleet/helpers";

type ChatMessage = { id: string; role: "assistant" | "user"; content: string };
type RuntimeConfig = {
  provider?: string | null;
  model?: string | null;
  temperature?: number | string | null;
};
type VoiceConfig = { voiceId?: string | null; provider?: string | null };
type Config = {
  personality?: string;
  directives?: Array<{ content?: string }>;
  knowledge?: Array<{ content?: string }>;
  flowConfig?: unknown[] | null;
  enabledTools?: AgentToolName[];
  runtime?: RuntimeConfig;
  voice?: VoiceConfig;
};
type Inspector =
  | "overview"
  | "identity"
  | "rules"
  | "facts"
  | "tone"
  | "actions"
  | "model"
  | "voice"
  | "assets";
type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "text" | "image";
  text?: string;
  dataUrl?: string;
  status: "ready" | "uploading" | "uploaded" | "error";
  error?: string;
};

const roles = ["scheduler", "sales", "customer_service", "receptionist", "custom"] as const;
const roleLabel = (role?: string | null) => role?.replace(/_/g, " ") || "Assistant";
const welcome = (name?: string): ChatMessage => ({
  id: `welcome-${name || "new"}`,
  role: "assistant",
  content: name
    ? `Tell ${name} what to do, what to avoid, or what to know. I'll save everything and make it ready.`
    : "Create an assistant, then tell it what to do in plain English.",
});
const isTextAsset = (file: File) =>
  file.type.startsWith("text/") || /\.(txt|md|csv|json|xml)$/i.test(file.name);
const readFile = (file: File, mode: "text" | "data-url") =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.onload = () => resolve(String(reader.result || ""));
    mode === "text" ? reader.readAsText(file) : reader.readAsDataURL(file);
  });

function runtimeValue(runtime?: RuntimeConfig): "managed" | string {
  if (!runtime?.provider || !runtime.model) return "managed";
  if (runtime.provider === "openrouter") return runtime.model;
  if (runtime.provider === "openai") return `openai/${runtime.model}`;
  if (runtime.provider === "google")
    return `google/${runtime.model.replace(/^gemini-/, "gemini-")}`;
  return "managed";
}

export default function StudioWorkspaceV2() {
  const { agents, loading, refresh } = useAgents();
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(params.get("agent") || "");
  const active = useMemo<WorkspaceAgentSummary | undefined>(
    () => agents.find((agent) => agent.id === selectedId) || agents[0],
    [agents, selectedId],
  );
  const [config, setConfig] = useState<Config>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]>("scheduler");
  const [brief, setBrief] = useState("");
  const [creating, setCreating] = useState(false);
  const [inspector, setInspector] = useState<Inspector>("overview");
  const [panelEntry, setPanelEntry] = useState("");
  const [savingPanel, setSavingPanel] = useState(false);
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [clonedVoices, setClonedVoices] = useState<VoiceOption[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const voiceCatalog = useMemo<VoiceOption[]>(
    () => [...clonedVoices, ...(PREMIUM_VOICES as VoiceOption[])],
    [clonedVoices],
  );

  const loadConfig = useCallback(async (agentId: string) => {
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`);
      const body = await safeJson(response);
      if (response.ok && body && typeof body === "object") setConfig(body as Config);
    } catch {
      setConfig({});
    }
  }, []);

  const selectAgent = useCallback(
    (agent: WorkspaceAgentSummary) => {
      setSelectedId(agent.id);
      setParams({ agent: agent.id });
      setMessages([welcome(agent.name)]);
      setConfig({});
      setInspector("overview");
      setAttachments([]);
      void loadConfig(agent.id);
    },
    [loadConfig, setParams],
  );

  useEffect(() => {
    if (!loading && !agents.length) setShowCreate(true);
  }, [agents.length, loading]);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/voices")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (cancelled || !body) return;
        const rows = Array.isArray((body as { voices?: unknown[] })?.voices)
          ? (body as { voices: unknown[] }).voices
          : Array.isArray(body)
            ? (body as unknown[])
            : [];
        setClonedVoices(
          rows
            .filter((voice): voice is { id: string; name?: string; provider?: string } =>
              Boolean(voice && typeof (voice as { id?: unknown }).id === "string"),
            )
            .map((voice) => ({
              id: voice.id,
              name: voice.name || "Cloned voice",
              provider: voice.provider || "11labs",
            })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    if (active.id !== selectedId) selectAgent(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key on the active id; `active` is memoized from the same inputs.
  }, [active?.id, selectedId, selectAgent]);

  async function extract(agentId: string, content: string) {
    const response = await authFetch("/api/train/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, message: content }),
    });
    const body = (await safeJson(response)) as {
      responseContent?: unknown;
      reply?: unknown;
    } | null;
    const reply =
      typeof body?.responseContent === "string"
        ? body.responseContent
        : typeof body?.reply === "string"
          ? body.reply
          : response.ok
            ? "Saved. What else should this agent know?"
            : "I could not save that yet. Please try again.";
    return { ok: response.ok, reply };
  }

  async function ingestAttachments(agentId: string) {
    const ready = attachments.filter((asset) => asset.status === "ready");
    const summaries: string[] = [];
    for (const asset of ready) {
      setAttachments((items) =>
        items.map((item) => (item.id === asset.id ? { ...item, status: "uploading" } : item)),
      );
      try {
        const response = await authFetch(
          `/api/agent-config/${encodeURIComponent(agentId)}/assets`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: asset.name,
              mimeType: asset.mimeType,
              text: asset.text,
              dataUrl: asset.dataUrl,
            }),
          },
        );
        const body = (await safeJson(response)) as { summary?: unknown; error?: unknown } | null;
        if (!response.ok)
          throw new Error(
            typeof body?.error === "string" ? body.error : "This asset could not be added.",
          );
        summaries.push(
          typeof body?.summary === "string"
            ? body.summary
            : `Added ${asset.name} to the agent profile.`,
        );
        setAttachments((items) =>
          items.map((item) => (item.id === asset.id ? { ...item, status: "uploaded" } : item)),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "This asset could not be added.";
        setAttachments((items) =>
          items.map((item) =>
            item.id === asset.id ? { ...item, status: "error", error: message } : item,
          ),
        );
      }
    }
    return summaries;
  }

  async function sendTraining(event?: FormEvent) {
    event?.preventDefault();
    if (
      !active ||
      sending ||
      (!composer.trim() && !attachments.some((asset) => asset.status === "ready"))
    )
      return;
    const content = composer.trim();
    const assetLabels = attachments
      .filter((asset) => asset.status === "ready")
      .map((asset) => `Attached ${asset.kind}: ${asset.name}`);
    setComposer("");
    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: [content, ...assetLabels].filter(Boolean).join("\n"),
      },
    ]);
    setSending(true);
    try {
      const assetSummaries = await ingestAttachments(active.id);
      const result = content
        ? await extract(active.id, content)
        : {
            ok: assetSummaries.length > 0,
            reply: assetSummaries.join(" ") || "No asset could be saved.",
          };
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: [assetSummaries.join(" "), content ? result.reply : ""]
            .filter(Boolean)
            .join(" "),
        },
      ]);
      if (result.ok || assetSummaries.length) await loadConfig(active.id);
      setAttachments((items) => items.filter((item) => item.status === "error"));
    } finally {
      setSending(false);
    }
  }

  async function createAgent(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    const cleanName = name.trim();
    const initialBrief = brief.trim();
    try {
      const response = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, role, deferPhoneProvision: true }),
      });
      const body = (await safeJson(response)) as { id?: string } | null;
      if (!response.ok || !body?.id) return;
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      refresh();
      setSelectedId(body.id);
      setParams({ agent: body.id });
      setShowCreate(false);
      setMessages([welcome(cleanName)]);
      if (initialBrief) {
        setMessages((current) => [
          ...current,
          { id: `brief-${body.id}`, role: "user", content: initialBrief },
        ]);
        const result = await extract(body.id, initialBrief);
        setMessages((current) => [
          ...current,
          { id: `brief-result-${body.id}`, role: "assistant", content: result.reply },
        ]);
      }
      await loadConfig(body.id);
      setName("");
      setBrief("");
    } finally {
      setCreating(false);
    }
  }

  async function savePanel() {
    if (!active || !panelEntry.trim() || savingPanel) return;
    const type =
      inspector === "rules"
        ? "directive"
        : inspector === "facts"
          ? "knowledge"
          : inspector === "tone"
            ? "personality"
            : null;
    if (!type) return;
    setSavingPanel(true);
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(active.id)}/manual`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, content: panelEntry.trim() }),
        },
      );
      if (response.ok) {
        setPanelEntry("");
        await loadConfig(active.id);
      }
    } finally {
      setSavingPanel(false);
    }
  }

  async function updateRuntime(value: "managed" | string) {
    if (!active || runtimeSaving) return;
    setRuntimeSaving(true);
    try {
      const payload =
        value === "managed"
          ? { provider: "", model: "", temperature: config.runtime?.temperature ?? null }
          : {
              provider: "openrouter",
              model: value.trim(),
              temperature: config.runtime?.temperature ?? null,
            };
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(active.id)}/runtime`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await safeJson(response)) as { runtime?: RuntimeConfig } | null;
      if (response.ok && body?.runtime)
        setConfig((current) => ({ ...current, runtime: body.runtime }));
    } finally {
      setRuntimeSaving(false);
    }
  }

  async function updateVoice(voiceId: string | null, provider?: string) {
    if (!active || voiceSaving) return;
    setVoiceSaving(true);
    const previous = config.voice;
    setConfig((current) => ({
      ...current,
      voice: { voiceId, provider: voiceId ? provider || "11labs" : null },
    }));
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(active.id)}/voice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, provider: voiceId ? provider || "11labs" : null }),
      });
      const body = (await safeJson(response)) as { voice?: VoiceConfig } | null;
      if (!response.ok) setConfig((current) => ({ ...current, voice: previous }));
      else if (body?.voice) setConfig((current) => ({ ...current, voice: body.voice }));
    } catch {
      setConfig((current) => ({ ...current, voice: previous }));
    } finally {
      setVoiceSaving(false);
    }
  }

  async function toggleTool(tool: AgentToolName) {
    if (!active) return;
    const current = config.enabledTools || [];
    const next = current.includes(tool)
      ? current.filter((name) => name !== tool)
      : [...current, tool];
    setConfig((value) => ({ ...value, enabledTools: next }));
    const response = await authFetch(`/api/agents/${encodeURIComponent(active.id)}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled_tools: next }),
    });
    const body = (await safeJson(response)) as { enabledTools?: AgentToolName[] } | null;
    if (!response.ok) setConfig((value) => ({ ...value, enabledTools: current }));
    else if (body?.enabledTools)
      setConfig((value) => ({ ...value, enabledTools: body.enabledTools }));
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const prepared = await Promise.all(
      files.slice(0, 4).map(async (file): Promise<Attachment> => {
        const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
        if (file.size > 3_000_000)
          return {
            id,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            kind: "text",
            status: "error",
            error: "Keep uploads under 3 MB.",
          };
        try {
          if (file.type.startsWith("image/"))
            return {
              id,
              name: file.name,
              mimeType: file.type,
              kind: "image",
              dataUrl: await readFile(file, "data-url"),
              status: "ready",
            };
          if (isTextAsset(file))
            return {
              id,
              name: file.name,
              mimeType: file.type || "text/plain",
              kind: "text",
              text: (await readFile(file, "text")).slice(0, 28_000),
              status: "ready",
            };
          return {
            id,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            kind: "text",
            status: "error",
            error: "Use a text document or PNG, JPG, WEBP, or GIF image.",
          };
        } catch {
          return {
            id,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            kind: "text",
            status: "error",
            error: "Could not read this asset.",
          };
        }
      }),
    );
    setAttachments((items) => [...items, ...prepared]);
  }

  const ruleCount = config.directives?.length || 0;
  const factCount = config.knowledge?.length || 0;
  const toneReady = Boolean(config.personality?.trim());
  const toolCount = config.enabledTools?.length || 0;
  const completion = [
    Boolean(active),
    ruleCount > 0,
    factCount > 0,
    toneReady,
    toolCount > 0,
  ].filter(Boolean).length;
  const readiness: Array<{ key: Inspector; label: string; done: boolean; detail: string }> = [
    {
      key: "identity",
      label: "Identity",
      done: Boolean(active),
      detail: active ? roleLabel(active.role) : "Name and role",
    },
    {
      key: "rules",
      label: "Rules",
      done: ruleCount > 0,
      detail: ruleCount ? `${ruleCount} saved` : "What to do and avoid",
    },
    {
      key: "facts",
      label: "Facts",
      done: factCount > 0,
      detail: factCount ? `${factCount} saved` : "What to know",
    },
    { key: "tone", label: "Tone", done: toneReady, detail: toneReady ? "Defined" : "How to sound" },
    {
      key: "actions",
      label: "Actions",
      done: toolCount > 0,
      detail: toolCount ? `${toolCount} enabled` : "What it can do",
    },
  ];
  const actionTools = AGENT_TOOL_CATALOG.filter((item) =>
    [
      "view_recent_interactions",
      "escalate_to_human",
      "send_email",
      "check_calendar_availability",
      "book_appointment",
      "crm_log_call",
      "send_slack_notification",
      "generate_zoom_link",
      "log_to_google_sheets",
      "log_to_excel",
      "meta_submit_lead",
      "enrich_lead",
    ].includes(item.name),
  );
  const modelValue = runtimeValue(config.runtime);
  const voiceLabel = config.voice?.voiceId
    ? voiceCatalog.find((voice) => voice.id === config.voice?.voiceId)?.name || "Custom voice"
    : "Automatic";

  const inspectorContent = (() => {
    if (!active)
      return (
        <p className="text-sm leading-6 text-muted-foreground">
          Choose or create an agent to begin.
        </p>
      );
    if (inspector === "identity")
      return (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">
            {active.name} is set up as a {roleLabel(active.role).toLowerCase()}. Use the chat below
            to train them, or check the progress on the right.
          </p>
          <div className="rounded-xl border border-border bg-muted p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-muted-foreground">
              AI Model
            </p>
            <p className="mt-1 text-sm font-semibold">
              {modelValue === "managed" ? "Automatic (best available)" : config.runtime?.model}
            </p>
            <button
              onClick={() => setInspector("model")}
              className="mt-2 text-xs font-semibold underline underline-offset-4"
            >
              Change
            </button>
          </div>
          <div className="rounded-xl border border-border bg-muted p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-muted-foreground">
              Voice
            </p>
            <p className="mt-1 truncate text-sm font-semibold">{voiceLabel}</p>
            <button
              onClick={() => setInspector("voice")}
              className="mt-2 text-xs font-semibold underline underline-offset-4"
            >
              Change
            </button>
          </div>
        </div>
      );
    if (inspector === "rules" || inspector === "facts" || inspector === "tone") {
      const labels = {
        rules: ["Rule", "Tell your assistant what to do or avoid."],
        facts: ["Fact", "Add information your assistant should know."],
        tone: ["Tone", "Describe how your assistant should sound."],
      } as const;
      const [heading, description] = labels[inspector];
      return (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          <textarea
            value={panelEntry}
            onChange={(event) => setPanelEntry(event.target.value)}
            placeholder={
              inspector === "rules"
                ? "Never quote final pricing without approval…"
                : inspector === "facts"
                  ? "We are open Monday–Friday, 8am–6pm…"
                  : "Warm, brief, clear, and never pushy…"
            }
            className="min-h-[116px] w-full resize-none rounded-xl border border-border bg-muted p-3 text-sm leading-6 outline-none"
          />
          <button
            disabled={!panelEntry.trim() || savingPanel}
            onClick={() => void savePanel()}
            className="workspace-btn-primary w-full justify-center px-3 py-2.5 disabled:opacity-40"
          >
            {savingPanel ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}Save{" "}
            {heading.toLowerCase()}
          </button>
        </div>
      );
    }
    if (inspector === "actions")
      return (
        <div className="space-y-2">
          <p className="text-sm leading-6 text-muted-foreground">
            Choose what your assistant can do. Only turn on what you need.
          </p>
          <div className="max-h-[330px] space-y-1.5 overflow-y-auto pr-1">
            {actionTools.map((tool) => {
              const enabled = (config.enabledTools || []).includes(tool.name);
              return (
                <button
                  key={tool.name}
                  onClick={() => void toggleTool(tool.name)}
                  className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${enabled ? "border-border bg-muted" : "border-border bg-card hover:border-foreground/15"}`}
                >
                  <span
                    className={`mt-0.5 grid h-4 w-4 place-items-center rounded border ${enabled ? "border-primary bg-primary text-white" : "border-border"}`}
                  >
                    {enabled ? <Check size={10} strokeWidth={3} /> : null}
                  </span>
                  <span>
                    <strong className="block text-xs">{tool.label}</strong>
                    <small className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                      {tool.description}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    if (inspector === "model")
      return (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">
            We use the best AI models automatically. Only change this if you have a specific need.
          </p>
          <OpenRouterModelPicker
            value={modelValue}
            onChange={(next) => void updateRuntime(next)}
            disabled={runtimeSaving}
          />
        </div>
      );
    if (inspector === "voice")
      return (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">
            Choose the voice {active.name} speaks with on calls. Leave on automatic and we'll pick a
            natural-sounding default.
          </p>
          <VoiceFieldSelect
            label="Main voice"
            value={config.voice?.voiceId}
            catalog={voiceCatalog}
            onSelect={(voiceId, provider) => void updateVoice(voiceId, provider)}
          />
          <p className="text-[11px] text-muted-foreground">
            {voiceSaving ? "Saving voice…" : `Current: ${voiceLabel}`}
          </p>
        </div>
      );
    if (inspector === "assets")
      return (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">
            Upload documents, menus, or images. Your assistant will learn from them.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted px-3 py-2.5 text-sm font-semibold hover:bg-muted"
          >
            <Paperclip size={15} />
            Add files or images
          </button>
          <div className="space-y-1.5">
            {attachments.length ? (
              attachments.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-muted">
                    {asset.kind === "image" ? <FileImage size={14} /> : <FileText size={14} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-xs">{asset.name}</strong>
                    <small className="block truncate text-[10px] text-muted-foreground">
                      {asset.status === "error" ? asset.error : asset.status}
                    </small>
                  </span>
                  <button
                    onClick={() =>
                      setAttachments((items) => items.filter((item) => item.id !== asset.id))
                    }
                    className="grid h-7 w-7 place-items-center rounded-lg hover:bg-muted"
                    aria-label={`Remove ${asset.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs leading-5 text-muted-foreground">
                No files added yet.
              </p>
            )}
          </div>
        </div>
      );
    return (
      <div className="space-y-3">
        <p className="text-sm leading-6 text-muted-foreground">
          Train your assistant by telling it what to do. Everything updates automatically.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["Rules", ruleCount],
            ["Facts", factCount],
            ["Actions", toolCount],
            ["Progress", `${completion}/5`],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-border bg-muted p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 text-lg font-semibold tracking-[-.04em]">{value}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => setInspector("model")}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold hover:bg-muted/70"
        >
          <span className="inline-flex items-center gap-2">
            <Cpu size={15} />
            AI Model
          </span>
          <span className="max-w-[58%] truncate text-xs font-medium text-muted-foreground">
            {modelValue === "managed" ? "Automatic" : modelValue}
          </span>
        </button>
        <button
          onClick={() => setInspector("voice")}
          className="mt-2 flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold hover:bg-muted/70"
        >
          <span className="inline-flex items-center gap-2">
            <Mic size={15} />
            Voice
          </span>
          <span className="max-w-[58%] truncate text-xs font-medium text-muted-foreground">
            {voiceLabel}
          </span>
        </button>
      </div>
    );
  })();

  return (
    <WorkspaceShell
      eyebrow="Build"
      title="Studio"
      contentClassName="pt-1 pb-0"
      action={
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="workspace-btn-primary px-3.5 py-2.5"
        >
          <Plus size={16} />
          New assistant
        </button>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
              {active?.name.slice(0, 1).toUpperCase() || "W"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-[-.02em]">
                {active?.name || "Create an assistant"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {completion === 5
                  ? "Ready to review"
                  : `${completion}/5 ready · teach in plain English`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setInspector("assets")}
              className="workspace-btn-secondary hidden px-3 py-1.5 text-xs sm:inline-flex sm:items-center sm:gap-1.5"
            >
              <Paperclip size={14} />
              Assets
            </button>
            <OpenRouterModelPicker
              compact
              value={modelValue}
              onChange={(next) => void updateRuntime(next)}
              disabled={runtimeSaving || !active}
            />
          </div>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
          <aside className="wl-stitch-card hidden min-h-0 flex-col p-3 xl:flex">
            <div className="flex items-center justify-between px-1">
              <p className="wl-stitch-label">Your assistants</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="text-primary hover:text-primary/80"
                aria-label="Create assistant"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="wl-scroll mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => selectAgent(agent)}
                  className={`wl-stitch-roster-card ${active?.id === agent.id ? "wl-stitch-roster-card--active" : ""}`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                    {agent.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-xs">{agent.name}</strong>
                    <small className="block truncate text-[10px] capitalize text-muted-foreground">
                      {roleLabel(agent.role)}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </aside>
          <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="wl-stitch-studio-glow" aria-hidden />
            <div className="wl-scroll relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2 sm:px-2">
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-3 sm:py-6">
                {messages.length <= 1 ? (
                  <div>
                    <h2 className="text-[clamp(1.25rem,1.8vw,1.5rem)] font-semibold tracking-[-.04em] text-foreground">
                      What should {active?.name || "your assistant"} help with?
                    </h2>
                    <p className="mt-1.5 max-w-md text-[13px] leading-5 text-muted-foreground">
                      Describe the job in plain English. We'll handle the setup.
                    </p>
                    <div className="mt-3 flex max-w-md flex-col gap-1">
                      {[
                        "Book meetings with interested people and follow up afterward.",
                        "Answer questions based on our info, and hand off anything tricky.",
                        "Make calls for me, wait on hold, and text me the answer.",
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setComposer(prompt)}
                          className="rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-left text-[11px] leading-[1.45] text-muted-foreground transition hover:border-border hover:bg-card hover:text-foreground/80"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`flex gap-2 ${message.role === "user" ? "justify-end" : ""}`}
                  >
                    {message.role === "assistant" ? (
                      <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent">
                        <Sparkles size={12} />
                      </span>
                    ) : null}
                    <p
                      className={`max-w-[min(88%,32rem)] whitespace-pre-wrap text-[13px] leading-6 ${message.role === "user" ? "rounded-2xl bg-primary px-3.5 py-2.5 text-white" : "text-foreground/90"}`}
                    >
                      {message.content}
                    </p>
                  </article>
                ))}
                {sending ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="animate-spin" size={14} />
                    Updating the agent profile…
                  </div>
                ) : null}
              </div>
            </div>
            <form className="relative z-10 shrink-0 px-1 pb-1 sm:px-2" onSubmit={sendTraining}>
              <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-xl border border-border bg-card/95 px-2 py-2 shadow-[0_4px_24px_color-mix(in_srgb,var(--wl-ink)_4%,transparent)]">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-foreground/70 hover:bg-muted"
                  aria-label="Attach files"
                >
                  <Paperclip size={16} />
                </button>
                <textarea
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  rows={1}
                  placeholder={
                    active
                      ? `Tell ${active.name} what to do, avoid, or know…`
                      : "Create an agent first…"
                  }
                  className="max-h-28 min-h-[2.25rem] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground/70"
                />
                <button
                  type="submit"
                  disabled={
                    !active ||
                    sending ||
                    (!composer.trim() && !attachments.some((asset) => asset.status === "ready"))
                  }
                  className="workspace-btn-primary grid h-9 w-9 shrink-0 place-items-center rounded-full p-0 disabled:opacity-40"
                  aria-label="Save instruction"
                >
                  <ArrowUp size={15} />
                </button>
              </div>
              {attachments.length ? (
                <div className="mx-auto mt-2 flex max-w-2xl flex-wrap gap-1.5">
                  {attachments.map((asset) => (
                    <span
                      key={asset.id}
                      className={`inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-1 text-[10px] ${asset.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-border bg-muted/70 text-foreground/60"}`}
                    >
                      {asset.kind === "image" ? <FileImage size={11} /> : <FileText size={11} />}
                      <span className="max-w-[150px] truncate">{asset.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((items) => items.filter((item) => item.id !== asset.id))
                        }
                        aria-label={`Remove ${asset.name}`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </form>
          </section>
          <aside className="wl-stitch-card hidden min-h-0 flex-col p-3 xl:flex">
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-1 pb-3">
              <div>
                <p className="wl-stitch-label">Build map</p>
                <p className="mt-0.5 text-xs font-semibold tracking-[-.02em]">Path to live</p>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {completion}/5
              </span>
            </div>
            <div className="mt-2 flex shrink-0 gap-3 overflow-x-auto border-b border-border pb-0">
              {readiness.slice(0, 3).map((step) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setInspector(step.key)}
                  className={`wl-stitch-build-map-tab whitespace-nowrap ${inspector === step.key ? "wl-stitch-build-map-tab--active" : ""}`}
                >
                  {step.label}
                </button>
              ))}
            </div>
            <div className="mt-2 shrink-0 space-y-0.5">
              {readiness.map((step) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setInspector(step.key)}
                  className={`flex w-full items-start gap-2 rounded-lg p-2 text-left transition ${inspector === step.key ? "bg-muted" : "hover:bg-muted/70"}`}
                >
                  <span
                    className={`mt-0.5 grid h-4 w-4 place-items-center rounded-full border ${step.done ? "border-primary bg-primary text-white" : "border-border text-transparent"}`}
                  >
                    <Check size={10} strokeWidth={3} />
                  </span>
                  <span>
                    <strong className="block text-[11px]">{step.label}</strong>
                    <small className="mt-0.5 block text-[10px] text-muted-foreground">
                      {step.detail}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <div className="wl-scroll mt-2 min-h-0 flex-1 overflow-y-auto border-t border-border pt-2">
              {inspectorContent}
            </div>
          </aside>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv,.json,.xml"
          multiple
          onChange={handleFiles}
        />
        {showCreate ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_srgb,var(--wl-ink)_20%,transparent)] p-4">
            <form onSubmit={createAgent} className="wl-stitch-auth-card w-full max-w-md shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="wl-stitch-label">New assistant</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-.04em]">
                    Start with one clear job.
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <label className="mt-5 block text-xs font-semibold">
                Name
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Casey"
                  className="wl-stitch-input mt-1.5"
                />
              </label>
              <label className="mt-4 block text-xs font-semibold">
                Role
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as (typeof roles)[number])}
                  className="wl-stitch-input mt-1.5 capitalize"
                >
                  {roles.map((item) => (
                    <option key={item} value={item}>
                      {roleLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 block text-xs font-semibold">
                First brief
                <textarea
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  placeholder="What should this assistant handle?"
                  className="wl-stitch-input mt-1.5 min-h-[96px] resize-none"
                />
              </label>
              <button
                disabled={!name.trim() || creating}
                className="workspace-btn-primary mt-5 w-full justify-center px-4 py-3 disabled:opacity-40"
              >
                {creating ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <WandSparkles size={16} />
                )}
                Create and open Studio
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
