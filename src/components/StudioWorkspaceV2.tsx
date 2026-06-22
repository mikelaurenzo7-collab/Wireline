import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  X,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import WorkspaceShell from "./WorkspaceShell";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";
import { authFetch, safeJson } from "../lib/api";
import type { AgentToolName } from "../lib/agent-capabilities";
import { AGENT_TOOL_CATALOG } from "../lib/agent-capabilities";
import { VoiceFieldSelect, type VoiceChoice } from "./VoiceFieldSelect";
import OpenRouterModelPicker from "./OpenRouterModelPicker";
import AgentBusinessProfile, { type BusinessProfile } from "./AgentBusinessProfile";
import RoleplaySandbox from "./RoleplaySandbox";

type Inspector =
  | "identity"
  | "rules"
  | "facts"
  | "tone"
  | "actions"
  | "model"
  | "voice"
  | "assets"
  | "business";

type Config = {
  directives?: Array<{ content?: string }>;
  knowledge?: Array<{ content?: string }>;
  personality?: string;
  enabledTools?: AgentToolName[];
  runtime?: { model?: string | null };
  voice?: { voiceId?: string | null; provider?: string | null };
  businessProfile?: BusinessProfile;
};

type Message = { id: string; role: "user" | "assistant"; content: string };
type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "text";
  status: "ready" | "error";
  dataUrl?: string;
  text?: string;
  error?: string;
};

type VoiceConfig = NonNullable<Config["voice"]>;

const voiceCatalog: VoiceChoice[] = [
  { id: "alloy", name: "Alloy", provider: "openai" },
  { id: "ash", name: "Ash", provider: "openai" },
  { id: "ballad", name: "Ballad", provider: "openai" },
  { id: "coral", name: "Coral", provider: "openai" },
  { id: "echo", name: "Echo", provider: "openai" },
  { id: "fable", name: "Fable", provider: "openai" },
  { id: "nova", name: "Nova", provider: "openai" },
  { id: "onyx", name: "Onyx", provider: "openai" },
  { id: "sage", name: "Sage", provider: "openai" },
  { id: "shimmer", name: "Shimmer", provider: "openai" },
];

function roleLabel(role?: string | null) {
  return (role || "assistant").replace(/_/g, " ");
}

function runtimeValue(runtime?: Config["runtime"]) {
  return runtime?.model || "managed";
}

function isTextAsset(file: File) {
  return (
    file.type.startsWith("text/") ||
    ["application/json", "application/xml", "text/csv"].includes(file.type) ||
    /\.(txt|md|csv|json|xml)$/i.test(file.name)
  );
}

async function readFile(file: File, mode: "text" | "data-url") {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result || ""));
    if (mode === "text") reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

export default function StudioWorkspaceV2() {
  const { agents, loading, refreshAgents } = useAgents();
  const [params, setParams] = useSearchParams();
  const [activeId, setActiveId] = useState(params.get("agent") || "");
  const [config, setConfig] = useState<Config>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [savingPanel, setSavingPanel] = useState(false);
  const [panelEntry, setPanelEntry] = useState("");
  const [inspector, setInspector] = useState<Inspector>("identity");
  const [showCreate, setShowCreate] = useState(params.get("create") === "1");
  const [name, setName] = useState("");
  const [role, setRole] = useState("custom");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<"train" | "simulate">("train");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = useMemo<WorkspaceAgentSummary | null>(() => {
    if (!agents.length) return null;
    return agents.find((agent) => agent.id === activeId) || agents[0];
  }, [activeId, agents]);

  useEffect(() => {
    if (!active) return;
    if (active.id !== activeId) {
      setActiveId(active.id);
      setParams((current) => {
        current.set("agent", active.id);
        return current;
      });
    }
  }, [active, activeId, setParams]);

  useEffect(() => {
    if (!active) {
      setConfig({});
      setMessages([]);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const [configResponse, messageResponse] = await Promise.all([
          authFetch(`/api/agent-config/${encodeURIComponent(active.id)}`),
          authFetch(`/api/agents/${encodeURIComponent(active.id)}/workspace/messages`),
        ]);
        const configPayload = (await safeJson(configResponse)) as Config | null;
        const messagePayload = (await safeJson(messageResponse)) as { messages?: Message[] } | null;
        if (!cancelled) {
          setConfig(configResponse.ok && configPayload ? configPayload : {});
          setMessages(messageResponse.ok && Array.isArray(messagePayload?.messages) ? messagePayload.messages : []);
        }
      } catch {
        if (!cancelled) {
          setConfig({});
          setMessages([]);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  async function loadConfig(id: string) {
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(id)}`);
      const payload = (await safeJson(response)) as Config | null;
      if (response.ok && payload) setConfig(payload);
    } catch {
      // Preserve current configuration if refresh fails.
    }
  }

  function selectAgent(agent: WorkspaceAgentSummary) {
    setActiveId(agent.id);
    setParams((current) => {
      current.set("agent", agent.id);
      current.delete("create");
      return current;
    });
    setMode("train");
    setInspector("identity");
  }

  async function createAgent(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const response = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, role, deferPhoneProvision: true }),
      });
      const payload = (await safeJson(response)) as { agent?: WorkspaceAgentSummary; error?: string } | null;
      if (!response.ok || !payload?.agent) {
        setCreateError(payload?.error || "Could not create that assistant.");
        return;
      }
      await refreshAgents();
      setShowCreate(false);
      setName("");
      setRole("custom");
      selectAgent(payload.agent);
    } catch {
      setCreateError("Could not create that assistant.");
    } finally {
      setCreating(false);
    }
  }

  async function sendTraining(event: FormEvent) {
    event.preventDefault();
    if (!active || sending) return;
    const text = composer.trim();
    const readyAssets = attachments.filter((asset) => asset.status === "ready");
    if (!text && !readyAssets.length) return;
    const optimistic: Message = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text || "Added training files.",
    };
    setMessages((current) => [...current, optimistic]);
    setComposer("");
    setSending(true);
    try {
      const response = await authFetch(`/api/train/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: active.id,
          prompt: text,
          attachments: readyAssets.map((asset) => ({
            name: asset.name,
            mime_type: asset.mimeType,
            kind: asset.kind,
            content: asset.kind === "image" ? asset.dataUrl : asset.text,
          })),
        }),
      });
      const payload = (await safeJson(response)) as { assistant_message?: string; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Training update failed.");
      setAttachments([]);
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimistic.id),
        optimistic,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload?.assistant_message || "Updated the assistant profile.",
        },
      ]);
      await loadConfig(active.id);
    } catch {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setComposer(text);
    } finally {
      setSending(false);
    }
  }

  async function savePanel() {
    if (!active || !panelEntry.trim() || savingPanel) return;
    setSavingPanel(true);
    try {
      if (inspector === "tone") {
        const response = await authFetch(`/api/agent-config/${encodeURIComponent(active.id)}/personality`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personality: panelEntry.trim() }),
        });
        if (!response.ok) throw new Error("Could not save tone.");
      } else {
        const response = await authFetch(`/api/agent-config/${encodeURIComponent(active.id)}/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: inspector === "rules" ? "directive" : "knowledge",
            content: panelEntry.trim(),
          }),
        });
        if (!response.ok) throw new Error("Could not save training.");
      }
      setPanelEntry("");
      await loadConfig(active.id);
    } finally {
      setSavingPanel(false);
    }
  }

  async function updateRuntime(model: string) {
    if (!active || runtimeSaving) return;
    const previous = config.runtime;
    setConfig((current) => ({ ...current, runtime: { ...current.runtime, model } }));
    setRuntimeSaving(true);
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(active.id)}/runtime`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const body = (await safeJson(response)) as { runtime?: Config["runtime"] } | null;
      if (!response.ok) setConfig((current) => ({ ...current, runtime: previous }));
      else if (body?.runtime) setConfig((current) => ({ ...current, runtime: body.runtime }));
    } catch {
      setConfig((current) => ({ ...current, runtime: previous }));
    } finally {
      setRuntimeSaving(false);
    }
  }

  async function updateVoice(voiceId: string | null, provider?: string | null) {
    if (!active || voiceSaving) return;
    const previous = config.voice;
    setConfig((current) => ({ ...current, voice: { voiceId, provider } }));
    setVoiceSaving(true);
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

  async function updateBusinessProfile(next: BusinessProfile) {
    if (!active) return;
    setConfig((current) => ({ ...current, businessProfile: next }));
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(active.id)}/business`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        },
      );
      const body = (await safeJson(response)) as { businessProfile?: BusinessProfile } | null;
      if (response.ok && body?.businessProfile) {
        setConfig((current) => ({ ...current, businessProfile: body.businessProfile }));
      } else {
        void loadConfig(active.id);
      }
    } catch {
      void loadConfig(active.id);
    }
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
