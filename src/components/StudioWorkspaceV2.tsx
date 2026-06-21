import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, Cpu, FileImage, FileText, Loader2, Paperclip, Plus, ShieldCheck, Sparkles, WandSparkles, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { authFetch, safeJson } from "../lib/api";
import { AGENTS_CHANGED_EVENT, useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";
import { AGENT_TOOL_CATALOG, type AgentToolName } from "../lib/agent-capabilities";
import OpenRouterModelPicker from "./OpenRouterModelPicker";
import WorkspaceShell from "./WorkspaceShell";

type ChatMessage = { id: string; role: "assistant" | "user"; content: string };
type RuntimeConfig = { provider?: string | null; model?: string | null; temperature?: number | string | null };
type Config = { personality?: string; directives?: Array<{ content?: string }>; knowledge?: Array<{ content?: string }>; flowConfig?: unknown[] | null; enabledTools?: AgentToolName[]; runtime?: RuntimeConfig };
type Inspector = "overview" | "identity" | "rules" | "facts" | "tone" | "actions" | "model" | "assets";
type Attachment = { id: string; name: string; mimeType: string; kind: "text" | "image"; text?: string; dataUrl?: string; status: "ready" | "uploading" | "uploaded" | "error"; error?: string };

const roles = ["scheduler", "sales", "customer_service", "receptionist", "custom"] as const;
const roleLabel = (role?: string | null) => role?.replace(/_/g, " ") || "Assistant";
const welcome = (name?: string): ChatMessage => ({ id: `welcome-${name || "new"}`, role: "assistant", content: name ? `Teach ${name} the job in plain English. I will turn clear guidance into rules, facts, tone, and scoped actions.` : "Create an agent, then teach it the job in plain English." });
const isTextAsset = (file: File) => file.type.startsWith("text/") || /\.(txt|md|csv|json|xml)$/i.test(file.name);
const readFile = (file: File, mode: "text" | "data-url") => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not read this file.")); reader.onload = () => resolve(String(reader.result || "")); mode === "text" ? reader.readAsText(file) : reader.readAsDataURL(file); });

function runtimeValue(runtime?: RuntimeConfig): "managed" | string {
  if (!runtime?.provider || !runtime.model) return "managed";
  if (runtime.provider === "openrouter") return runtime.model;
  if (runtime.provider === "openai") return `openai/${runtime.model}`;
  if (runtime.provider === "google") return `google/${runtime.model.replace(/^gemini-/, "gemini-")}`;
  return "managed";
}

export default function StudioWorkspaceV2() {
  const { agents, loading, refresh } = useAgents();
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(params.get("agent") || "");
  const active = useMemo<WorkspaceAgentSummary | undefined>(() => agents.find((agent) => agent.id === selectedId) || agents[0], [agents, selectedId]);
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConfig = useCallback(async (agentId: string) => {
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`);
      const body = await safeJson(response);
      if (response.ok && body && typeof body === "object") setConfig(body as Config);
    } catch {
      setConfig({});
    }
  }, []);

  const selectAgent = useCallback((agent: WorkspaceAgentSummary) => {
    setSelectedId(agent.id);
    setParams({ agent: agent.id });
    setMessages([welcome(agent.name)]);
    setConfig({});
    setInspector("overview");
    setAttachments([]);
    void loadConfig(agent.id);
  }, [loadConfig, setParams]);

  useEffect(() => {
    if (!loading && !agents.length) setShowCreate(true);
  }, [agents.length, loading]);

  useEffect(() => {
    if (!active) return;
    if (active.id !== selectedId) selectAgent(active);
  }, [active?.id, selectedId, selectAgent]);

  async function extract(agentId: string, content: string) {
    const response = await authFetch("/api/train/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, message: content }) });
    const body = await safeJson(response) as { responseContent?: unknown; reply?: unknown } | null;
    const reply = typeof body?.responseContent === "string" ? body.responseContent : typeof body?.reply === "string" ? body.reply : response.ok ? "Saved. What else should this agent know?" : "I could not save that yet. Please try again.";
    return { ok: response.ok, reply };
  }

  async function ingestAttachments(agentId: string) {
    const ready = attachments.filter((asset) => asset.status === "ready");
    const summaries: string[] = [];
    for (const asset of ready) {
      setAttachments((items) => items.map((item) => item.id === asset.id ? { ...item, status: "uploading" } : item));
      try {
        const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: asset.name, mimeType: asset.mimeType, text: asset.text, dataUrl: asset.dataUrl }),
        });
        const body = await safeJson(response) as { summary?: unknown; error?: unknown } | null;
        if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "This asset could not be added.");
        summaries.push(typeof body?.summary === "string" ? body.summary : `Added ${asset.name} to the agent profile.`);
        setAttachments((items) => items.map((item) => item.id === asset.id ? { ...item, status: "uploaded" } : item));
      } catch (error) {
        const message = error instanceof Error ? error.message : "This asset could not be added.";
        setAttachments((items) => items.map((item) => item.id === asset.id ? { ...item, status: "error", error: message } : item));
      }
    }
    return summaries;
  }

  async function sendTraining(event?: FormEvent) {
    event?.preventDefault();
    if (!active || sending || (!composer.trim() && !attachments.some((asset) => asset.status === "ready"))) return;
    const content = composer.trim();
    const assetLabels = attachments.filter((asset) => asset.status === "ready").map((asset) => `Attached ${asset.kind}: ${asset.name}`);
    setComposer("");
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: [content, ...assetLabels].filter(Boolean).join("\n") }]);
    setSending(true);
    try {
      const assetSummaries = await ingestAttachments(active.id);
      const result = content ? await extract(active.id, content) : { ok: assetSummaries.length > 0, reply: assetSummaries.join(" ") || "No asset could be saved." };
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", content: [assetSummaries.join(" "), content ? result.reply : ""].filter(Boolean).join(" ") }]);
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
      const response = await authFetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: cleanName, role, deferPhoneProvision: true }) });
      const body = await safeJson(response) as { id?: string } | null;
      if (!response.ok || !body?.id) return;
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      refresh();
      setSelectedId(body.id);
      setParams({ agent: body.id });
      setShowCreate(false);
      setMessages([welcome(cleanName)]);
      if (initialBrief) {
        setMessages((current) => [...current, { id: `brief-${body.id}`, role: "user", content: initialBrief }]);
        const result = await extract(body.id, initialBrief);
        setMessages((current) => [...current, { id: `brief-result-${body.id}`, role: "assistant", content: result.reply }]);
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
    const type = inspector === "rules" ? "directive" : inspector === "facts" ? "knowledge" : inspector === "tone" ? "personality" : null;
    if (!type) return;
    setSavingPanel(true);
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(active.id)}/manual`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, content: panelEntry.trim() }) });
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
          : { provider: "openrouter", model: value.trim(), temperature: config.runtime?.temperature ?? null };
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(active.id)}/runtime`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await safeJson(response) as { runtime?: RuntimeConfig } | null;
      if (response.ok && body?.runtime) setConfig((current) => ({ ...current, runtime: body.runtime }));
    } finally {
      setRuntimeSaving(false);
    }
  }

  async function toggleTool(tool: AgentToolName) {
    if (!active) return;
    const current = config.enabledTools || [];
    const next = current.includes(tool) ? current.filter((name) => name !== tool) : [...current, tool];
    setConfig((value) => ({ ...value, enabledTools: next }));
    const response = await authFetch(`/api/agents/${encodeURIComponent(active.id)}/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled_tools: next }) });
    const body = await safeJson(response) as { enabledTools?: AgentToolName[] } | null;
    if (!response.ok) setConfig((value) => ({ ...value, enabledTools: current }));
    else if (body?.enabledTools) setConfig((value) => ({ ...value, enabledTools: body.enabledTools }));
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const prepared = await Promise.all(files.slice(0, 4).map(async (file): Promise<Attachment> => {
      const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
      if (file.size > 3_000_000) return { id, name: file.name, mimeType: file.type || "application/octet-stream", kind: "text", status: "error", error: "Keep uploads under 3 MB." };
      try {
        if (file.type.startsWith("image/")) return { id, name: file.name, mimeType: file.type, kind: "image", dataUrl: await readFile(file, "data-url"), status: "ready" };
        if (isTextAsset(file)) return { id, name: file.name, mimeType: file.type || "text/plain", kind: "text", text: (await readFile(file, "text")).slice(0, 28_000), status: "ready" };
        return { id, name: file.name, mimeType: file.type || "application/octet-stream", kind: "text", status: "error", error: "Use a text document or PNG, JPG, WEBP, or GIF image." };
      } catch {
        return { id, name: file.name, mimeType: file.type || "application/octet-stream", kind: "text", status: "error", error: "Could not read this asset." };
      }
    }));
    setAttachments((items) => [...items, ...prepared]);
  }

  const ruleCount = config.directives?.length || 0;
  const factCount = config.knowledge?.length || 0;
  const toneReady = Boolean(config.personality?.trim());
  const toolCount = config.enabledTools?.length || 0;
  const completion = [Boolean(active), ruleCount > 0, factCount > 0, toneReady, toolCount > 0].filter(Boolean).length;
  const readiness: Array<{ key: Inspector; label: string; done: boolean; detail: string }> = [
    { key: "identity", label: "Identity", done: Boolean(active), detail: active ? roleLabel(active.role) : "Name and role" },
    { key: "rules", label: "Rules", done: ruleCount > 0, detail: ruleCount ? `${ruleCount} saved` : "Add boundaries" },
    { key: "facts", label: "Facts", done: factCount > 0, detail: factCount ? `${factCount} saved` : "Add business context" },
    { key: "tone", label: "Tone", done: toneReady, detail: toneReady ? "Defined" : "Describe the voice" },
    { key: "actions", label: "Actions", done: toolCount > 0, detail: toolCount ? `${toolCount} enabled` : "Grant only what it needs" },
  ];
  const actionTools = AGENT_TOOL_CATALOG.filter((item) => ["view_recent_interactions", "escalate_to_human", "send_email", "check_calendar_availability", "book_appointment", "crm_log_call", "send_slack_notification", "generate_zoom_link", "log_to_google_sheets", "log_to_excel", "meta_submit_lead", "enrich_lead"].includes(item.name));
  const modelValue = runtimeValue(config.runtime);

  const inspectorContent = (() => {
    if (!active) return <p className="text-sm leading-6 text-[#68686f]">Choose or create an agent to begin.</p>;
    if (inspector === "identity") return <div className="space-y-3"><p className="text-sm leading-6 text-[#626269]">{active.name} is configured as a {roleLabel(active.role).toLowerCase()}. Build the job below, then return here to review readiness.</p><div className="rounded-xl border border-black/[.08] bg-[#fafaf9] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#73737a]">Current runtime</p><p className="mt-1 text-sm font-semibold">{modelValue === "managed" ? "Managed OpenAI → Gemini fallback" : config.runtime?.model}</p><button onClick={() => setInspector("model")} className="mt-2 text-xs font-semibold underline underline-offset-4">Change model</button></div></div>;
    if (inspector === "rules" || inspector === "facts" || inspector === "tone") {
      const labels = { rules: ["Operating rule", "Set a boundary this agent must follow."], facts: ["Business fact", "Save context this agent can rely on."], tone: ["Tone guidance", "Describe how this agent should sound."] } as const;
      const [heading, description] = labels[inspector];
      return <div className="space-y-3"><p className="text-sm leading-6 text-[#626269]">{description}</p><textarea value={panelEntry} onChange={(event) => setPanelEntry(event.target.value)} placeholder={inspector === "rules" ? "Never quote final pricing without approval…" : inspector === "facts" ? "We are open Monday–Friday, 8am–6pm…" : "Warm, brief, clear, and never pushy…"} className="min-h-[116px] w-full resize-none rounded-xl border border-black/[.1] bg-[#fafaf9] p-3 text-sm leading-6 outline-none" /><button disabled={!panelEntry.trim() || savingPanel} onClick={() => void savePanel()} className="workspace-btn-primary w-full justify-center px-3 py-2.5 disabled:opacity-40">{savingPanel ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}Save {heading.toLowerCase()}</button></div>;
    }
    if (inspector === "actions") return <div className="space-y-2"><p className="text-sm leading-6 text-[#626269]">Grant scoped actions here. Connections never silently give an agent permission.</p><div className="max-h-[330px] space-y-1.5 overflow-y-auto pr-1">{actionTools.map((tool) => { const enabled = (config.enabledTools || []).includes(tool.name); return <button key={tool.name} onClick={() => void toggleTool(tool.name)} className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${enabled ? "border-black/[.16] bg-[#f0f0ed]" : "border-black/[.08] bg-white hover:border-black/[.16]"}`}><span className={`mt-0.5 grid h-4 w-4 place-items-center rounded border ${enabled ? "border-[#1d1d1f] bg-[#1d1d1f] text-white" : "border-black/[.2]"}`}>{enabled ? <Check size={10} strokeWidth={3} /> : null}</span><span><strong className="block text-xs">{tool.label}</strong><small className="mt-0.5 block text-[10px] leading-4 text-[#707077]">{tool.description}</small></span></button>; })}</div></div>;
    if (inspector === "model") return <div className="space-y-3"><p className="text-sm leading-6 text-[#626269]">Managed calls use OpenAI first and Gemini only on failure. Pick any OpenRouter model when this agent needs a specific runtime.</p><OpenRouterModelPicker value={modelValue} onChange={(next) => void updateRuntime(next)} disabled={runtimeSaving} /></div>;
    if (inspector === "assets") return <div className="space-y-3"><p className="text-sm leading-6 text-[#626269]">Add product sheets, policies, schedules, screenshots, or service menus. Text documents and supported images become structured training context.</p><button onClick={() => fileInputRef.current?.click()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/[.12] bg-[#fafaf9] px-3 py-2.5 text-sm font-semibold hover:bg-[#f1f1ee]"><Paperclip size={15} />Add files or images</button><div className="space-y-1.5">{attachments.length ? attachments.map((asset) => <div key={asset.id} className="flex items-center gap-2 rounded-xl border border-black/[.08] bg-white px-2.5 py-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f0f0ed]">{asset.kind === "image" ? <FileImage size={14} /> : <FileText size={14} />}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{asset.name}</strong><small className="block truncate text-[10px] text-[#74747b]">{asset.status === "error" ? asset.error : asset.status}</small></span><button onClick={() => setAttachments((items) => items.filter((item) => item.id !== asset.id))} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[#f0f0ed]" aria-label={`Remove ${asset.name}`}><X size={14} /></button></div>) : <p className="rounded-xl border border-dashed border-black/[.14] px-3 py-4 text-center text-xs leading-5 text-[#74747b]">Nothing attached yet.</p>}</div></div>;
    return <div className="space-y-3"><p className="text-sm leading-6 text-[#626269]">Build this agent without leaving the Studio. The checklist and controls update from the same profile you are training.</p><div className="grid grid-cols-2 gap-2">{[["Rules", ruleCount], ["Facts", factCount], ["Actions", toolCount], ["Progress", `${completion}/5`]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-black/[.08] bg-[#fafaf9] p-3"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#77777f]">{label}</p><p className="mt-1 text-lg font-semibold tracking-[-.04em]">{value}</p></div>)}</div><button onClick={() => setInspector("model")} className="flex w-full items-center justify-between rounded-xl border border-black/[.08] bg-white px-3 py-2.5 text-sm font-semibold hover:bg-[#f6f6f4]"><span className="inline-flex items-center gap-2"><Cpu size={15} />Runtime</span><span className="max-w-[58%] truncate text-xs font-medium text-[#6e6e75]">{modelValue === "managed" ? "Managed default" : modelValue}</span></button></div>;
  })();

  return <WorkspaceShell eyebrow="Build" title="Studio" contentClassName="pt-1 pb-0" action={<button type="button" onClick={() => setShowCreate(true)} className="workspace-btn-primary px-3.5 py-2.5"><Plus size={16} />New agent</button>}>
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#ecece9] text-xs font-semibold">{active?.name.slice(0, 1).toUpperCase() || "W"}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[-.02em]">{active?.name || "Create an agent"}</p>
            <p className="text-[11px] text-[#7a7a81]">{completion === 5 ? "Ready to review" : `${completion}/5 ready · teach in plain English`}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setInspector("assets")} className="workspace-btn-secondary hidden px-3 py-1.5 text-xs sm:inline-flex sm:items-center sm:gap-1.5"><Paperclip size={14} />Assets</button>
          <OpenRouterModelPicker compact value={modelValue} onChange={(next) => void updateRuntime(next)} disabled={runtimeSaving || !active} />
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[196px_minmax(0,1fr)_272px]">
        <aside className="hidden min-h-0 flex-col rounded-xl border border-black/[.06] bg-white/80 p-2.5 xl:flex"><div className="flex items-center justify-between px-1"><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#8a8a91]">Roster</p><button type="button" onClick={() => setShowCreate(true)} className="workspace-btn-primary grid h-7 w-7 place-items-center rounded-lg p-0" aria-label="Create agent"><Plus size={14} /></button></div><div className="wl-scroll mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">{agents.map((agent) => <button key={agent.id} type="button" onClick={() => selectAgent(agent)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition ${active?.id === agent.id ? "bg-[#ecece9]" : "hover:bg-[#f4f4f1]"}`}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white text-xs font-semibold">{agent.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-xs">{agent.name}</strong><small className="block truncate text-[10px] capitalize text-[#73737a]">{roleLabel(agent.role)}</small></span></button>)}</div></aside>
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="wl-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2 sm:px-2">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-4 sm:py-8">
              {messages.length <= 1 ? <div><h2 className="text-[clamp(1.5rem,2.2vw,2rem)] font-semibold tracking-[-.045em] text-[#1d1d1f]">What should {active?.name || "this agent"} own?</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[#68686f]">Describe the job naturally. Wireline turns it into rules, facts, tone, and scoped actions.</p><div className="mt-5 grid gap-2 sm:grid-cols-3">{["Qualify leads, book qualified demos, and send a concise follow-up.", "Answer service questions from our policy, then escalate anything outside it.", "Handle my personal calls, wait on hold, and text the important answer."].map((prompt) => <button key={prompt} type="button" onClick={() => setComposer(prompt)} className="rounded-xl border border-black/[.07] bg-white/70 p-3 text-left text-xs leading-5 text-[#55555d] transition hover:border-black/[.14] hover:bg-white">{prompt}</button>)}</div></div> : null}
              {messages.map((message) => <article key={message.id} className={`flex gap-2 ${message.role === "user" ? "justify-end" : ""}`}>{message.role === "assistant" ? <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#efefec]"><Sparkles size={12} /></span> : null}<p className={`max-w-[min(88%,32rem)] whitespace-pre-wrap text-[13px] leading-6 ${message.role === "user" ? "rounded-2xl bg-[#1d1d1f] px-3.5 py-2.5 text-white" : "text-[#34343a]"}`}>{message.content}</p></article>)}
              {sending ? <div className="flex items-center gap-2 text-xs text-[#6f6f76]"><Loader2 className="animate-spin" size={14} />Updating the agent profile…</div> : null}
            </div>
          </div>
          <form className="shrink-0 px-1 pb-1 sm:px-2" onSubmit={sendTraining}>
            <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-[1.35rem] border border-black/[.1] bg-white px-2 py-2 shadow-[0_6px_28px_rgba(0,0,0,.05)]">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#55555d] hover:bg-[#f0f0ee]" aria-label="Attach files"><Paperclip size={16} /></button>
              <textarea value={composer} onChange={(event) => setComposer(event.target.value)} rows={1} placeholder={active ? `Tell ${active.name} what to do, avoid, or know…` : "Create an agent first…"} className="max-h-28 min-h-[2.25rem] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-6 outline-none placeholder:text-[#929298]" />
              <button type="submit" disabled={!active || sending || (!composer.trim() && !attachments.some((asset) => asset.status === "ready"))} className="workspace-btn-primary grid h-9 w-9 shrink-0 place-items-center rounded-full p-0 disabled:opacity-40" aria-label="Save instruction"><ArrowUp size={15} /></button>
            </div>
            {attachments.length ? <div className="mx-auto mt-2 flex max-w-2xl flex-wrap gap-1.5">{attachments.map((asset) => <span key={asset.id} className={`inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-1 text-[10px] ${asset.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-black/[.08] bg-[#f5f5f2] text-[#5d5d64]"}`}>{asset.kind === "image" ? <FileImage size={11} /> : <FileText size={11} />}<span className="max-w-[150px] truncate">{asset.name}</span><button type="button" onClick={() => setAttachments((items) => items.filter((item) => item.id !== asset.id))} aria-label={`Remove ${asset.name}`}><X size={11} /></button></span>)}</div> : null}
          </form>
        </section>
        <aside className="hidden min-h-0 flex-col rounded-xl border border-black/[.06] bg-white/80 p-2.5 xl:flex"><div className="flex shrink-0 items-start justify-between gap-2 px-1"><div><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#8a8a91]">Build map</p><p className="mt-0.5 text-xs font-semibold tracking-[-.02em]">Path to live</p></div><span className="rounded-full bg-[#efefec] px-2 py-0.5 text-[10px] font-semibold">{completion}/5</span></div><div className="mt-2 shrink-0 space-y-0.5">{readiness.map((step) => <button key={step.key} type="button" onClick={() => setInspector(step.key)} className={`flex w-full items-start gap-2 rounded-lg p-2 text-left transition ${inspector === step.key ? "bg-[#efefec]" : "hover:bg-[#f5f5f2]"}`}><span className={`mt-0.5 grid h-4 w-4 place-items-center rounded-full border ${step.done ? "border-[#1d1d1f] bg-[#1d1d1f] text-white" : "border-black/[.18] text-transparent"}`}><Check size={10} strokeWidth={3} /></span><span><strong className="block text-[11px]">{step.label}</strong><small className="mt-0.5 block text-[10px] text-[#707077]">{step.detail}</small></span></button>)}</div><div className="wl-scroll mt-2 min-h-0 flex-1 overflow-y-auto border-t border-black/[.06] pt-2">{inspectorContent}</div><button type="button" onClick={() => setInspector("overview")} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#f1f1ee] px-2.5 py-1.5 text-[10px] font-semibold xl:hidden"><ShieldCheck size={13} />{completion}/5 checklist</button></aside>
      </div>
      <input ref={fileInputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv,.json,.xml" multiple onChange={handleFiles} />
      {showCreate ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"><form onSubmit={createAgent} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#77777f]">New agent</p><h2 className="mt-1 text-xl font-semibold tracking-[-.04em]">Start with one clear job.</h2></div><button type="button" onClick={() => setShowCreate(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[#f0f0ee]" aria-label="Close"><X size={16} /></button></div><label className="mt-5 block text-xs font-semibold">Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Casey" className="mt-1.5 w-full rounded-xl border border-black/[.12] px-3 py-2.5 text-sm outline-none" /></label><label className="mt-4 block text-xs font-semibold">Role<select value={role} onChange={(event) => setRole(event.target.value as (typeof roles)[number])} className="mt-1.5 w-full rounded-xl border border-black/[.12] bg-white px-3 py-2.5 text-sm capitalize outline-none">{roles.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></label><label className="mt-4 block text-xs font-semibold">First brief<textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="What should this agent own?" className="mt-1.5 min-h-[96px] w-full resize-none rounded-xl border border-black/[.12] p-3 text-sm outline-none" /></label><button disabled={!name.trim() || creating} className="workspace-btn-primary mt-5 w-full justify-center px-4 py-3 disabled:opacity-40">{creating ? <Loader2 className="animate-spin" size={16} /> : <WandSparkles size={16} />}Create and open Studio</button></form></div> : null}
    </div>
  </WorkspaceShell>;
}
