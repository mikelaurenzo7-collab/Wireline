import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUp,
  Check,
  CirclePlus,
  Ellipsis,
  Loader2,
  Paperclip,
  Plus,
  Settings2,
  Sparkles,
} from "lucide-react";
import { authFetch, safeJson } from "../lib/api";
import { AGENTS_CHANGED_EVENT, useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";

type Message = { id: string; role: "assistant" | "user"; content: string };
type IntegrationStatus = Record<string, { connected?: boolean }>;

const starterPrompts = [
  "Handle my pharmacy calls and tell me the result",
  "Book appointments and add them to my calendar",
  "Answer customer calls for my side business",
];

const roles = [
  { value: "scheduler", label: "Personal assistant" },
  { value: "customer_service", label: "Customer support" },
  { value: "receptionist", label: "Receptionist" },
  { value: "sales", label: "Sales assistant" },
];

function displayRole(value?: string) {
  return roles.find((role) => role.value === value)?.label ?? value?.replace(/_/g, " ") ?? "Assistant";
}

function responseText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const data = payload as Record<string, unknown>;
  if (typeof data.responseContent === "string") return data.responseContent;
  if (typeof data.reply === "string") return data.reply;
  return undefined;
}

export default function AgentStudioHome() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { agents, loading, refresh } = useAgents();
  const emptyStateHandled = useRef(false);
  const [activeId, setActiveId] = useState(searchParams.get("agent") || "");
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("scheduler");
  const [integrations, setIntegrations] = useState<IntegrationStatus>({});
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Start with the job. I will help you shape the agent, capture its rules, and point out the integrations it needs.",
    },
  ]);

  const activeAgent = useMemo<WorkspaceAgentSummary | undefined>(
    () => agents.find((agent) => agent.id === activeId) ?? agents[0],
    [agents, activeId],
  );

  useEffect(() => {
    if (loading || emptyStateHandled.current) return;
    emptyStateHandled.current = true;
    if (agents.length === 0) setShowCreate(true);
  }, [agents.length, loading]);

  useEffect(() => {
    if (!activeAgent?.id || activeAgent.id === activeId) return;
    setActiveId(activeAgent.id);
    setSearchParams({ agent: activeAgent.id }, { replace: true });
  }, [activeAgent?.id, activeId, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/oauth/crm/status")
      .then((response) => (response.ok ? response.json() : {}))
      .then((data) => {
        if (!cancelled && data && typeof data === "object") setIntegrations(data as IntegrationStatus);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function pickAgent(id: string) {
    setActiveId(id);
    setShowCreate(false);
    setSearchParams({ agent: id }, { replace: true });
  }

  function addAssistantMessage(content: string) {
    setMessages((current) => [
      ...current,
      { id: `assistant-${Date.now()}`, role: "assistant", content },
    ]);
  }

  async function createAgent(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || creating) return;

    setCreating(true);
    try {
      const response = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, role }),
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "We could not create that agent yet.";
        throw new Error(message);
      }

      const createdId =
        payload && typeof payload === "object" && "id" in payload && typeof payload.id === "string"
          ? payload.id
          : "";
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      await refresh();
      if (createdId) {
        setActiveId(createdId);
        setSearchParams({ agent: createdId }, { replace: true });
      }
      setName("");
      setShowCreate(false);
      addAssistantMessage(
        `${trimmedName} is ready. Tell me what calls it should handle, what it should avoid, and when it should hand off to you.`,
      );
    } catch (error) {
      addAssistantMessage(error instanceof Error ? error.message : "We could not create that agent yet.");
    } finally {
      setCreating(false);
    }
  }

  async function sendMessage(event?: FormEvent, seeded?: string) {
    event?.preventDefault();
    const content = (seeded ?? composer).trim();
    if (!content || sending) return;

    setComposer("");
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content }]);

    if (!activeAgent) {
      setShowCreate(true);
      addAssistantMessage("Give this agent a name first. Then I will save the instructions you share here.");
      return;
    }

    setSending(true);
    try {
      const response = await authFetch("/api/train/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: activeAgent.id, message: content }),
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "The assistant is temporarily unavailable. Try again in a moment.";
        throw new Error(message);
      }
      addAssistantMessage(
        responseText(payload) || "I have that. What else should this agent know before it takes a call?",
      );
    } catch (error) {
      addAssistantMessage(error instanceof Error ? error.message : "The assistant is temporarily unavailable.");
    } finally {
      setSending(false);
    }
  }

  const connections = [
    { key: "google", label: "Google", detail: "Calendar, Gmail, contacts" },
    { key: "microsoft", label: "Microsoft", detail: "Outlook and calendar" },
    { key: "hubspot", label: "HubSpot", detail: "Contacts and pipeline" },
  ];
  const connectedCount = Object.values(integrations).filter((integration) => integration?.connected).length;

  return (
    <div className="studio-home">
      <aside className="studio-sidebar" aria-label="Agent studio">
        <Link className="studio-logo" to="/agents">
          <span className="studio-logo-mark" aria-hidden="true" />
          Wireline
        </Link>
        <button className="studio-new-button" type="button" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          New agent
        </button>

        <div className="studio-sidebar-section">
          <span className="studio-sidebar-label">Your agents</span>
          {loading ? (
            <div className="studio-sidebar-loading">Loading agents…</div>
          ) : agents.length === 0 ? (
            <button className="studio-empty-agent" type="button" onClick={() => setShowCreate(true)}>
              Create your first agent
            </button>
          ) : (
            <div className="studio-agent-list">
              {agents.map((agent) => (
                <button
                  className={`studio-agent-row ${activeAgent?.id === agent.id ? "is-active" : ""}`}
                  key={agent.id}
                  type="button"
                  onClick={() => pickAgent(agent.id)}
                >
                  <span className="studio-agent-avatar">{agent.name.slice(0, 1).toUpperCase()}</span>
                  <span className="studio-agent-copy">
                    <strong>{agent.name}</strong>
                    <small>{displayRole(agent.role)}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="studio-sidebar-footer">
          <Link to="/settings" className="studio-nav-link">
            <Settings2 size={16} />
            Settings
          </Link>
          <Link to="/help" className="studio-nav-link">Help</Link>
        </div>
      </aside>

      <main className="studio-main">
        <header className="studio-header">
          <div>
            <p className="studio-kicker">Agent Studio</p>
            <div className="studio-title-row">
              <h1>{activeAgent?.name || "New agent"}</h1>
              <button className="studio-icon-button" type="button" aria-label="Agent menu">
                <Ellipsis size={18} />
              </button>
            </div>
          </div>
          <div className="studio-header-actions">
            <button className="studio-secondary-button" type="button" onClick={() => navigate("/integrations")}>
              Integrations
            </button>
            <button className="studio-primary-button" type="button" onClick={() => setShowCreate(true)}>
              <CirclePlus size={16} />
              New agent
            </button>
          </div>
        </header>

        <div className="studio-workspace">
          <section className="studio-conversation" aria-label="Assistant conversation">
            <div className="studio-conversation-top">
              <div>
                <p className="studio-kicker">Assistant</p>
                <h2>Build it by talking.</h2>
                <p>Start with the job. The details can come next.</p>
              </div>
              <span className="studio-availability"><span />Ready</span>
            </div>

            <div className="studio-thread" aria-live="polite">
              {messages.map((message) => (
                <article className={`studio-message ${message.role === "user" ? "is-user" : ""}`} key={message.id}>
                  {message.role === "assistant" && <span className="studio-message-mark"><Sparkles size={14} /></span>}
                  <p>{message.content}</p>
                </article>
              ))}
              {sending && (
                <article className="studio-message">
                  <span className="studio-message-mark"><Loader2 className="animate-spin" size={14} /></span>
                  <p>Saving that…</p>
                </article>
              )}
            </div>

            <div className="studio-starters">
              {starterPrompts.map((prompt) => (
                <button type="button" key={prompt} onClick={() => void sendMessage(undefined, prompt)}>
                  {prompt}
                </button>
              ))}
            </div>

            <form className="studio-composer" onSubmit={sendMessage}>
              <textarea
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                placeholder={activeAgent ? `Tell me what ${activeAgent.name} should do…` : "Tell me what you need help with…"}
                rows={3}
              />
              <div className="studio-composer-footer">
                <button className="studio-attach-button" type="button" aria-label="Attach context">
                  <Paperclip size={17} />
                </button>
                <span>Shift + Enter for a new line</span>
                <button className="studio-send-button" type="submit" disabled={!composer.trim() || sending} aria-label="Send message">
                  <ArrowUp size={18} />
                </button>
              </div>
            </form>
          </section>

          <aside className="studio-details" aria-label="Agent details">
            <section className="studio-card">
              <div className="studio-card-heading">
                <div>
                  <p className="studio-kicker">Agent</p>
                  <h2>Essentials</h2>
                </div>
              </div>
              {activeAgent ? (
                <dl className="studio-facts">
                  <div><dt>Name</dt><dd>{activeAgent.name}</dd></div>
                  <div><dt>Role</dt><dd>{displayRole(activeAgent.role)}</dd></div>
                  <div><dt>Channel</dt><dd>{activeAgent.channel || "Voice"}</dd></div>
                </dl>
              ) : (
                <p className="studio-muted-copy">Create an agent, then refine its voice, rules, and handoff behavior here.</p>
              )}
              {activeAgent && (
                <Link className="studio-text-link" to={`/training?agent=${encodeURIComponent(activeAgent.id)}`}>
                  Edit agent details
                </Link>
              )}
            </section>

            <section className="studio-card">
              <div className="studio-card-heading">
                <div>
                  <p className="studio-kicker">Connections</p>
                  <h2>Integrations</h2>
                </div>
                <span className="studio-count">{connectedCount}</span>
              </div>
              <div className="studio-integration-list">
                {connections.map((connection) => {
                  const connected = integrations[connection.key]?.connected === true;
                  return (
                    <Link className="studio-integration-row" key={connection.key} to="/integrations">
                      <span className="studio-integration-icon">{connection.label.slice(0, 1)}</span>
                      <span>
                        <strong>{connection.label}</strong>
                        <small>{connected ? "Connected" : connection.detail}</small>
                      </span>
                      {connected ? <Check size={16} /> : <Plus size={16} />}
                    </Link>
                  );
                })}
              </div>
              <Link className="studio-text-link" to="/integrations">Manage integrations</Link>
            </section>
          </aside>
        </div>
      </main>

      {showCreate && (
        <div className="studio-modal-backdrop" role="presentation" onMouseDown={() => setShowCreate(false)}>
          <form className="studio-create-card" onSubmit={createAgent} onMouseDown={(event) => event.stopPropagation()}>
            <p className="studio-kicker">New agent</p>
            <h2>What should this agent be called?</h2>
            <p>Start simple. You can teach it the details in the conversation.</p>
            <label>
              Name
              <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Alex" />
            </label>
            <label>
              Starting role
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                {roles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="studio-modal-actions">
              <button className="studio-secondary-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="studio-primary-button" type="submit" disabled={!name.trim() || creating}>
                {creating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                Create agent
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
