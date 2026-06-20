import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUp, Check, CheckCircle2, CirclePlus, Loader2, Plus, Sparkles } from "lucide-react";
import { authFetch, safeJson } from "../lib/api";
import { AGENTS_CHANGED_EVENT, useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";

type Message = { id: string; role: "assistant" | "user"; content: string };
type AgentThreads = Record<string, Message[]>;
type IntegrationStatus = Record<string, { connected?: boolean }>;
type IntegrationKey = "google" | "microsoft";
type AgentConfig = { personality?: string; directives?: Array<{ id?: string | number; content?: string }>; knowledge?: Array<{ id?: string | number; content?: string }> };

const starterPrompts = ["Handle my pharmacy calls and tell me the result", "Book appointments and add them to my calendar", "Answer customer calls for my side business"] as const;
const roles = [
  { value: "scheduler", label: "Personal assistant", detail: "Handles everyday calls, scheduling, and follow-through." },
  { value: "appointment_scheduler", label: "Appointment assistant", detail: "Books, confirms, and follows up on appointments." },
  { value: "customer_service", label: "Customer support", detail: "Answers common questions and routes issues safely." },
  { value: "receptionist", label: "Receptionist", detail: "Creates a professional first response and routes callers." },
  { value: "sales", label: "Sales assistant", detail: "Qualifies interest, answers approved questions, and captures next steps." },
  { value: "custom", label: "Make your own", detail: "Start with a blank, flexible assistant and describe exactly how it should work." },
] as const;
const integrationOptions: Array<{ key: IntegrationKey; label: string; detail: string; endpoint: string }> = [
  { key: "google", label: "Google", detail: "Calendar, Gmail, contacts", endpoint: "/api/oauth/google/url" },
  { key: "microsoft", label: "Microsoft", detail: "Outlook and calendar", endpoint: "/api/oauth/microsoft/url" },
];
function displayRole(value?: string | null) { return roles.find((role) => role.value === value)?.label ?? value?.replace(/_/g, " ") ?? "Assistant"; }
function welcomeMessage(agentName?: string): Message { return { id: `welcome-${agentName || "new"}`, role: "assistant", content: agentName ? `Start with ${agentName}'s job. I will turn clear instructions into saved rules and facts, then show what still needs review.` : "Start with the job. I will help you shape the agent, capture its rules, and point out the connection it needs." }; }
function responseText(payload: unknown): string | undefined { if (!payload || typeof payload !== "object") return undefined; const data = payload as Record<string, unknown>; return typeof data.responseContent === "string" ? data.responseContent : typeof data.reply === "string" ? data.reply : undefined; }
function errorText(payload: unknown, fallback: string) { return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : fallback; }
function readinessLabel(input: { directives: number; knowledge: number; personality: boolean }) { return input.directives > 0 && input.knowledge > 0 ? "Ready for review" : input.directives > 0 || input.knowledge > 0 || input.personality ? "In training" : "New draft"; }

export default function AgentStudioHome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { agents, loading, refresh } = useAgents();
  const handledFirstLoad = useRef(false);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState(searchParams.get("agent") || "");
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [connecting, setConnecting] = useState<IntegrationKey | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]["value"]>("scheduler");
  const [customBrief, setCustomBrief] = useState("");
  const [integrations, setIntegrations] = useState<IntegrationStatus>({});
  const [agentThreads, setAgentThreads] = useState<AgentThreads>({});
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({});
  const [loadingConfig, setLoadingConfig] = useState(false);

  const activeAgent = useMemo<WorkspaceAgentSummary | undefined>(() => agents.find((agent) => agent.id === activeId) ?? agents[0], [agents, activeId]);
  const activeThread = activeAgent ? agentThreads[activeAgent.id] ?? [welcomeMessage(activeAgent.name)] : [welcomeMessage()];
  const directiveCount = agentConfig.directives?.length ?? 0;
  const knowledgeCount = agentConfig.knowledge?.length ?? 0;
  const hasPersonality = Boolean(agentConfig.personality?.trim());
  const connectedCount = Object.values(integrations).filter((integration) => integration?.connected).length;
  const readiness = readinessLabel({ directives: directiveCount, knowledge: knowledgeCount, personality: hasPersonality });
  const roleDetail = roles.find((item) => item.value === role)?.detail ?? "";
  const isCustom = role === "custom";

  const appendMessage = useCallback((agentId: string, roleValue: Message["role"], content: string) => setAgentThreads((current) => ({ ...current, [agentId]: [...(current[agentId] ?? [welcomeMessage()]), { id: `${roleValue}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role: roleValue, content }] })), []);
  const refreshIntegrations = useCallback(async () => { try { const response = await authFetch("/api/oauth/crm/status"); const payload = await safeJson(response); if (response.ok && payload && typeof payload === "object") setIntegrations(payload as IntegrationStatus); } catch { /* supplementary status */ } }, []);
  const loadAgentConfig = useCallback(async (agentId: string) => { setLoadingConfig(true); try { const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`); const payload = await safeJson(response); if (!response.ok) throw new Error(); setAgentConfig((payload && typeof payload === "object" ? payload : {}) as AgentConfig); } catch { setAgentConfig({}); } finally { setLoadingConfig(false); } }, []);

  useEffect(() => { if (!loading && !handledFirstLoad.current) { handledFirstLoad.current = true; if (!agents.length) setShowCreate(true); } }, [agents.length, loading]);
  useEffect(() => { if (activeAgent?.id && activeAgent.id !== activeId) { setActiveId(activeAgent.id); setSearchParams({ agent: activeAgent.id }, { replace: true }); } }, [activeAgent?.id, activeId, setSearchParams]);
  useEffect(() => { if (!activeAgent) { setAgentConfig({}); return; } setAgentThreads((current) => current[activeAgent.id] ? current : { ...current, [activeAgent.id]: [welcomeMessage(activeAgent.name)] }); void loadAgentConfig(activeAgent.id); }, [activeAgent?.id, activeAgent?.name, activeAgent, loadAgentConfig]);
  useEffect(() => { threadEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [activeThread.length, sending]);
  useEffect(() => { void refreshIntegrations(); const onFocus = () => void refreshIntegrations(); window.addEventListener("focus", onFocus); return () => window.removeEventListener("focus", onFocus); }, [refreshIntegrations]);

  function pickAgent(id: string) { setActiveId(id); setComposer(""); setShowCreate(false); setSearchParams({ agent: id }, { replace: true }); }
  async function trainAgent(agentId: string, content: string) { const response = await authFetch("/api/train/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, message: content }) }); const payload = await safeJson(response); if (!response.ok) throw new Error(errorText(payload, "The assistant is temporarily unavailable.")); return responseText(payload) || "I saved that. What else should this agent know before it takes a call?"; }
  async function persistCustomBrief(agentId: string, brief: string) {
    const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/manual`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "knowledge", content: `Initial operating brief: ${brief}` }) });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(errorText(payload, "We could not save your custom brief. Please try again."));
  }

  async function createAgent(event: FormEvent) {
    event.preventDefault(); const trimmedName = name.trim(); const brief = customBrief.trim();
    if (!trimmedName || creating || (isCustom && !brief)) return;
    setCreating(true);
    try {
      const response = await authFetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmedName, role, deferPhoneProvision: true }) });
      const payload = await safeJson(response); if (!response.ok) throw new Error(errorText(payload, "We could not create that agent yet."));
      const createdId = payload && typeof payload === "object" && "id" in payload && typeof payload.id === "string" ? payload.id : "";
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT)); await refresh();
      if (createdId) {
        const initialMessages: Message[] = [welcomeMessage(trimmedName)];
        if (brief) {
          initialMessages.push({ id: `brief-${createdId}`, role: "user", content: brief });
          try {
            const reply = await trainAgent(createdId, brief);
            initialMessages.push({ id: `brief-saved-${createdId}`, role: "assistant", content: reply });
          } catch {
            await persistCustomBrief(createdId, brief);
            initialMessages.push({ id: `brief-saved-fallback-${createdId}`, role: "assistant", content: "Your custom brief is safely saved as agent context. Add any hard rules, business facts, and handoff behavior next." });
          }
        } else initialMessages.push({ id: `created-${createdId}`, role: "assistant", content: `${trimmedName} is a draft. Give it a plain-English operating brief: the job, what it can promise, what it must never do, and when it should hand off to you.` });
        setAgentThreads((current) => ({ ...current, [createdId]: initialMessages })); setActiveId(createdId); setSearchParams({ agent: createdId }, { replace: true }); await loadAgentConfig(createdId);
      }
      setName(""); setCustomBrief(""); setRole("scheduler"); setShowCreate(false);
    } catch (error) { if (activeAgent) appendMessage(activeAgent.id, "assistant", error instanceof Error ? error.message : "We could not create that agent yet."); }
    finally { setCreating(false); }
  }
  async function sendMessage(event?: FormEvent, seeded?: string) { event?.preventDefault(); const content = (seeded ?? composer).trim(); if (!content || sending) return; setComposer(""); if (!activeAgent) { setShowCreate(true); return; } const id = activeAgent.id; appendMessage(id, "user", content); setSending(true); try { appendMessage(id, "assistant", await trainAgent(id, content)); await loadAgentConfig(id); } catch (error) { appendMessage(id, "assistant", error instanceof Error ? error.message : "The assistant is temporarily unavailable."); } finally { setSending(false); } }
  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }
  async function connectIntegration(option: (typeof integrationOptions)[number]) { if (connecting || !activeAgent) return; setConnecting(option.key); try { const response = await authFetch(option.endpoint); const payload = await safeJson(response); const url = payload && typeof payload === "object" && "url" in payload && typeof payload.url === "string" ? payload.url : ""; if (!response.ok || !url) throw new Error(errorText(payload, `Could not start ${option.label} connection.`)); const popup = window.open(url, "wireline_oauth", "width=600,height=760,left=120,top=80"); if (!popup) throw new Error("Allow popups for this site to connect your account."); appendMessage(activeAgent.id, "assistant", `Finish connecting ${option.label} in the secure window. Wireline will refresh the connection status when you return.`); const timer = window.setInterval(() => { if (popup.closed) { window.clearInterval(timer); void refreshIntegrations(); } }, 600); window.setTimeout(() => window.clearInterval(timer), 300000); } catch (error) { appendMessage(activeAgent.id, "assistant", error instanceof Error ? error.message : `Could not connect ${option.label}.`); } finally { setConnecting(null); } }

  const setupSteps = [
    { label: "Identity", detail: activeAgent ? `${displayRole(activeAgent.role)} selected` : "Name and role", complete: Boolean(activeAgent) },
    { label: "Operating rules", detail: directiveCount ? `${directiveCount} saved` : "Tell it what to do and avoid", complete: directiveCount > 0 },
    { label: "Business context", detail: knowledgeCount ? `${knowledgeCount} facts saved` : "Add hours, policies, or service details", complete: knowledgeCount > 0 },
    { label: "Connections", detail: connectedCount ? `${connectedCount} connected` : "Only when the job requires it", complete: connectedCount > 0, optional: true },
  ];

  return <div className="studio-home">
    <aside className="studio-sidebar" aria-label="Agent studio"><Link className="studio-logo" to="/agents"><span className="studio-logo-mark" aria-hidden="true" />Wireline</Link><button className="studio-new-button" type="button" onClick={() => setShowCreate(true)}><Plus size={16} />New agent</button><div className="studio-sidebar-section"><span className="studio-sidebar-label">Your agents</span>{loading ? <div className="studio-sidebar-loading">Loading agents…</div> : !agents.length ? <button className="studio-empty-agent" type="button" onClick={() => setShowCreate(true)}>Create your first agent</button> : <div className="studio-agent-list">{agents.map((agent) => <button className={`studio-agent-row ${activeAgent?.id === agent.id ? "is-active" : ""}`} key={agent.id} type="button" onClick={() => pickAgent(agent.id)}><span className="studio-agent-avatar">{agent.name.slice(0, 1).toUpperCase()}</span><span className="studio-agent-copy"><strong>{agent.name}</strong><small>{displayRole(agent.role)}</small></span></button>)}</div>}</div></aside>
    <main className="studio-main"><header className="studio-header"><div><p className="studio-kicker">Agent Studio</p><div className="studio-title-row"><h1>{activeAgent?.name || "New agent"}</h1><span className="rounded-full border border-[#1d1d1f]/12 bg-white px-2 py-1 text-[11px] font-semibold text-[#54545b]">{readiness}</span></div></div><button className="studio-primary-button" type="button" onClick={() => setShowCreate(true)}><CirclePlus size={16} />New agent</button></header>
      <div className="studio-workspace"><section className="studio-conversation" aria-label="Agent training conversation"><div className="studio-conversation-top"><div><p className="studio-kicker">Training</p><h2>{activeAgent ? `Teach ${activeAgent.name} the job.` : "Build it by talking."}</h2><p>Use plain English. Wireline saves clear rules, facts, and tone changes to this agent’s profile.</p></div><span className="studio-availability"><span />Private draft</span></div><div className="studio-thread" aria-live="polite">{activeThread.map((message) => <article className={`studio-message ${message.role === "user" ? "is-user" : ""}`} key={message.id}>{message.role === "assistant" && <span className="studio-message-mark"><Sparkles size={14} /></span>}<p>{message.content}</p></article>)}{sending && <article className="studio-message"><span className="studio-message-mark"><Loader2 className="animate-spin" size={14} /></span><p>Saving that to this agent’s profile…</p></article>}<div ref={threadEndRef} /></div><div className="studio-starters" aria-label="Starter prompts">{starterPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => void sendMessage(undefined, prompt)}>{prompt}</button>)}</div><form className="studio-composer" onSubmit={sendMessage}><textarea value={composer} onChange={(event) => setComposer(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder={activeAgent ? `Tell me what ${activeAgent.name} should do, avoid, or know…` : "Tell me what you need help with…"} rows={3} /><div className="studio-composer-footer"><span>Enter to save · Shift + Enter for a new line</span><button className="studio-send-button" type="submit" disabled={!composer.trim() || sending} aria-label="Save instruction"><ArrowUp size={18} /></button></div></form></section>
        <aside className="studio-details" aria-label="Agent profile and readiness"><section className="studio-card"><p className="studio-kicker">Agent</p><h2>Profile</h2>{activeAgent ? <><dl className="studio-facts"><div><dt>Name</dt><dd>{activeAgent.name}</dd></div><div><dt>Role</dt><dd>{displayRole(activeAgent.role)}</dd></div><div><dt>Channel</dt><dd>{activeAgent.channel || "Voice"}</dd></div></dl><div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#deded9] pt-4 text-center"><div><strong className="block text-base">{loadingConfig ? "—" : directiveCount}</strong><span className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#6a6a72]">Rules</span></div><div><strong className="block text-base">{loadingConfig ? "—" : knowledgeCount}</strong><span className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#6a6a72]">Facts</span></div><div><strong className="block text-base">{hasPersonality ? "1" : "0"}</strong><span className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#6a6a72]">Tone</span></div></div></> : <p className="studio-muted-copy">Create an agent, then teach it its role, limits, and handoff behavior here.</p>}</section>
        <section className="studio-card"><div className="studio-card-heading"><div><p className="studio-kicker">Readiness</p><h2>What is next</h2></div><span className="studio-count">{setupSteps.filter((step) => step.complete).length}/{setupSteps.length}</span></div><ol className="mt-4 grid gap-3">{setupSteps.map((step) => <li className="flex items-start gap-2.5" key={step.label}><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] ${step.complete ? "border-[#1d1d1f] bg-[#1d1d1f] text-white" : "border-[#b4b4ae] bg-white text-transparent"}`}><Check size={12} strokeWidth={3} /></span><span><strong className="block text-[13px] font-semibold text-[#1d1d1f]">{step.label}{step.optional ? " · optional" : ""}</strong><small className="block pt-0.5 text-[11px] leading-4 text-[#54545b]">{step.detail}</small></span></li>)}</ol>{readiness === "Ready for review" && <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#1d1d1f]/14 bg-[#f2f2ef] p-3 text-[12px] leading-5 text-[#3f3f45]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />Review the saved profile, then choose the channel and launch controls deliberately.</div>}</section>
        <section className="studio-card"><div className="studio-card-heading"><div><p className="studio-kicker">Connections</p><h2>Integrations</h2></div><span className="studio-count">{connectedCount}</span></div><p className="studio-muted-copy">Connect only what this agent needs to complete its job.</p><div className="studio-integration-list">{integrationOptions.map((option) => { const connected = integrations[option.key]?.connected === true; const isConnecting = connecting === option.key; return <button className="studio-integration-row" key={option.key} type="button" onClick={() => void connectIntegration(option)} disabled={connected || Boolean(connecting) || !activeAgent}><span className="studio-integration-icon">{option.label.slice(0, 1)}</span><span><strong>{option.label}</strong><small>{connected ? "Connected" : option.detail}</small></span>{isConnecting ? <Loader2 className="animate-spin" size={16} /> : connected ? <Check size={16} /> : <Plus size={16} />}</button>; })}</div></section></aside></div>
    </main>
    {showCreate && <div className="studio-modal-backdrop" role="presentation" onMouseDown={() => setShowCreate(false)}><form className="studio-create-card" onSubmit={createAgent} onMouseDown={(event) => event.stopPropagation()}><p className="studio-kicker">New agent</p><h2>{isCustom ? "Make your own assistant." : "Start with a clear role."}</h2><p>{isCustom ? "Describe the job in your own words. Wireline saves this as the first operating brief, then helps you refine rules, facts, and handoffs." : "Name the agent, choose the closest starting point, then teach the specifics in plain English."}</p><label>Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Alex" /></label><label>Starting role<select value={role} onChange={(event) => setRole(event.target.value as (typeof roles)[number]["value"])}>{roles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><p className="mt-2 text-[12px] leading-5 text-[#54545b]">{roleDetail}</p>{isCustom && <label className="mt-4">What should this assistant do?<textarea value={customBrief} onChange={(event) => setCustomBrief(event.target.value)} rows={5} placeholder="Example: Answer calls for my landscaping company, qualify the request, book estimates in my calendar, never quote pricing, and text me when a caller needs a human." /></label>}<div className="studio-modal-actions"><button className="studio-secondary-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="studio-primary-button" type="submit" disabled={!name.trim() || creating || (isCustom && !customBrief.trim())}>{creating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}{isCustom ? "Create custom agent" : "Create agent"}</button></div></form></div>}
  </div>;
}