import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import VoiceGallery from "./voice/VoiceGallery";
import { authFetch } from "../lib/api";
import {
  AGENT_TOOL_CATALOG,
  BUSINESS_TOOL_NAMES,
  type AgentToolCatalogEntry,
} from "../lib/agent-capabilities";
import { WIRELINE_LIVE_VOICES } from "../lib/voice-catalog";
import {
  WORKSPACE_INTEGRATION_CATALOG,
  type WorkspaceIntegration,
} from "../lib/workspace-integration-catalog";
import AgentPresenceLivePreview from "./AgentPresenceLivePreview";

const PERSONALITIES = ["Clear", "Warm", "Direct", "Polished"];

type StudioAgentWorkspacePanelProps = {
  agentId: string;
  agentName: string;
  agentRole?: string | null;
  isBusinessAgent?: boolean;
  onTestVoiceInChat: () => void;
  className?: string;
};

export default function StudioAgentWorkspacePanel({
  agentId,
  agentName,
  agentRole = null,
  isBusinessAgent = false,
  onTestVoiceInChat,
  className = "",
}: StudioAgentWorkspacePanelProps) {
  const [setupPersonality, setSetupPersonality] = useState("Clear");
  const [setupGreeting, setSetupGreeting] = useState(
    `Hello, this is ${agentName || "your agent"}. How can I help?`,
  );
  const [setupKnowledge, setSetupKnowledge] = useState("");
  const [applyingSetup, setApplyingSetup] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);

  useEffect(() => {
    setSetupGreeting(`Hello, this is ${agentName || "your agent"}. How can I help?`);
  }, [agentName]);

  async function quickStartVoice() {
    const voice = WIRELINE_LIVE_VOICES[0];
    if (!agentId || !voice) return;
    await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/voice`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: voice.id, provider: voice.provider }),
    });
  }

  async function applySetup() {
    if (!agentId) return;
    setApplyingSetup(true);
    setSetupError(null);
    setSetupNotice(null);
    try {
      const personalityText = `${setupPersonality}. Concise. Useful. Business-ready.`;
      if (personalityText) {
        const personalityResponse = await authFetch(
          `/api/agent-config/${encodeURIComponent(agentId)}/manual`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "personality", content: personalityText }),
          },
        );
        if (!personalityResponse.ok) throw new Error("Personality could not be saved.");
      }

      const greetingTrimmed = setupGreeting.trim();
      if (greetingTrimmed) {
        const greetingResponse = await authFetch(
          `/api/agent-config/${encodeURIComponent(agentId)}/manual`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "directive",
              content: `Opening greeting: ${greetingTrimmed}`,
            }),
          },
        );
        if (!greetingResponse.ok) throw new Error("Greeting could not be saved.");
      }

      const knowledgeTrimmed = setupKnowledge.trim();
      if (knowledgeTrimmed) {
        const knowledgeResponse = await authFetch("/api/train/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, message: knowledgeTrimmed }),
        });
        if (!knowledgeResponse.ok) throw new Error("Knowledge could not be saved.");
      }

      setSetupNotice("Setup saved.");
    } catch (reason) {
      setSetupError(reason instanceof Error ? reason.message : "Setup could not be applied.");
    } finally {
      setApplyingSetup(false);
    }
  }

  useEffect(() => {
    if (window.location.hash !== "#agent-presence") return;
    const timer = window.setTimeout(() => {
      document
        .getElementById("agent-presence")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [agentId]);

  return (
    <div className={`min-h-0 flex-1 overflow-y-auto border-t border-border/60 ${className}`}>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-8 sm:py-8">
        <h2 className="font-[var(--wireline-font-family-display)] text-2xl font-normal leading-tight tracking-[-0.022em] text-foreground">
          {agentName}
        </h2>

        <section
          id="agent-presence"
          className="studio-card scroll-mt-6 p-6"
          aria-labelledby="agent-presence-heading"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="agent-presence-heading" className="text-lg font-semibold tracking-tight">
                Agent presence
              </h3>
              <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">
                Wireline face is included on every agent. Live video is an optional add-on — enable
                it here when you want a photoreal on-screen presenter.
              </p>
            </div>
          </div>
          <AgentPresenceLivePreview
            agentId={agentId}
            name={agentName}
            role={agentRole}
            isBusinessAgent={isBusinessAgent}
          />
        </section>

        <div className="studio-card p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold tracking-tight">Setup</h3>
            <button
              type="button"
              onClick={() => void quickStartVoice()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition active:scale-[0.985]"
            >
              Quick start
            </button>
          </div>
          <p className="sr-only">Everything stays in this workspace.</p>

          <VoiceGallery
            agentId={agentId}
            agentName={agentName}
            embedded
            searchInputId="voice-search"
          />
          <button
            type="button"
            onClick={onTestVoiceInChat}
            className="mt-3 text-xs font-semibold text-primary hover:underline"
          >
            Test in chat
          </button>

          <div className="mb-4 mt-6">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-primary">
              Personality
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="setup-personality" className="text-xs">
                  Personality
                </label>
                <select
                  id="setup-personality"
                  value={setupPersonality}
                  onChange={(e) => setSetupPersonality(e.target.value)}
                  className="w-full mt-1 text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
                >
                  {PERSONALITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="setup-greeting" className="text-xs">
                  Greeting
                </label>
                <input
                  id="setup-greeting"
                  value={setupGreeting}
                  onChange={(e) => setSetupGreeting(e.target.value)}
                  className="w-full mt-1 text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
                />
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-primary">
              Knowledge
            </div>
            <label htmlFor="setup-knowledge" className="sr-only">
              Seed knowledge
            </label>
            <textarea
              id="setup-knowledge"
              value={setupKnowledge}
              onChange={(e) => setSetupKnowledge(e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background min-h-[50px]"
              placeholder="Business hours, policies, FAQs…"
              aria-describedby="knowledge-help"
            />
            <div id="knowledge-help" className="sr-only">
              Provide facts, policies, or context this agent should know.
            </div>
          </div>

          {setupError ? (
            <p className="mb-3 text-sm text-destructive" role="alert">
              {setupError}
            </p>
          ) : null}
          {setupNotice ? (
            <p className="mb-3 text-sm text-[var(--wireline-color-status-success)]" role="status">
              {setupNotice}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              onClick={() => void applySetup()}
              disabled={applyingSetup}
              className="px-4 py-2 rounded-xl border border-primary text-primary text-sm font-medium active:scale-[0.985] disabled:opacity-60"
            >
              {applyingSetup ? "Saving…" : "Save setup"}
            </button>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-xl font-semibold tracking-[-0.02em]">World Connections</h3>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Scoped to agent
              </div>
            </div>

            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Context providers
              </p>
              <div className="flex flex-wrap gap-2">
                {(WORKSPACE_INTEGRATION_CATALOG || []).map((integ: WorkspaceIntegration) => (
                  <div
                    key={integ.id}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm"
                  >
                    <span className="font-medium">{integ.label}</span>
                    <span className="text-[10px] capitalize text-muted-foreground">
                      {integ.connection}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Tools
              </p>
              <div className="studio-card p-4">
                <div className="flex flex-wrap gap-2">
                  {(AGENT_TOOL_CATALOG || [])
                    .filter(
                      (t: AgentToolCatalogEntry) =>
                        !BUSINESS_TOOL_NAMES.has(t.name) || t.group === "crm",
                    )
                    .slice(0, 18)
                    .map((tool: AgentToolCatalogEntry) => (
                      <span
                        key={tool.name}
                        className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                      >
                        {tool.label}
                      </span>
                    ))}
                </div>
              </div>
            </div>

            <div className="mt-2 text-[10px] text-muted-foreground">
              Changes here affect only {agentName}.
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="studio-card p-5 lg:col-span-1">
              <div className="mb-3 font-semibold">Brain</div>
              <div className="space-y-2 text-sm">
                <div>Memory</div>
                <div>Knowledge</div>
                <div>Training</div>
              </div>
              <Link
                to={`/studio?agent=${agentId}`}
                className="mt-4 inline-block text-xs font-semibold text-primary hover:underline"
              >
                Open Studio →
              </Link>
            </div>

            <div className="studio-card p-5">
              <div className="mb-3 font-semibold">Record</div>
              <p className="text-sm text-muted-foreground">Call history lives in the chat above.</p>
            </div>

            <div className="studio-card p-5">
              <div className="mb-3 font-semibold">Controls</div>
              <div className="flex flex-col gap-2 text-sm">
                <Link to={`/studio?agent=${agentId}`} className="hover:text-primary">
                  Studio
                </Link>
                <Link to="/settings" className="hover:text-primary">
                  Settings
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
