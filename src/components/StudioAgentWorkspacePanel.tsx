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

const PERSONALITIES = ["Clear", "Warm", "Direct", "Polished"];

type StudioAgentWorkspacePanelProps = {
  agentId: string;
  agentName: string;
  onTestVoiceInChat: () => void;
  className?: string;
};

export default function StudioAgentWorkspacePanel({
  agentId,
  agentName,
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

  return (
    <div className={`min-h-0 flex-1 overflow-y-auto border-t border-border/60 ${className}`}>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-8 sm:py-8">
        <h2 className="font-[var(--wireline-font-family-display)] text-2xl font-normal leading-tight tracking-[-0.022em] text-foreground">
          {agentName}
        </h2>

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
            <p className="mb-3 text-sm text-emerald-700" role="status">
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
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                Context Providers
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(WORKSPACE_INTEGRATION_CATALOG || []).map((integ: WorkspaceIntegration) => (
                  <div
                    key={integ.id}
                    className="studio-card p-4 hover:border-primary/20 transition-all group"
                  >
                    <div className="flex justify-between">
                      <div>
                        <div className="font-semibold">{integ.label}</div>
                        <div className="text-[10px] text-muted-foreground">{integ.family}</div>
                      </div>
                      <div className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground self-start capitalize">
                        {integ.connection}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground leading-snug">
                      {integ.detail}
                    </div>
                    <div className="mt-2 text-[10px] text-primary group-hover:underline">
                      Capabilities: {integ.capabilities?.join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                Capabilities & Tools
              </div>
              <div className="space-y-4">
                <div className="studio-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-medium">Everyday</span>
                    <span className="text-[10px] text-muted-foreground">
                      (core actions every agent can use)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {(AGENT_TOOL_CATALOG || [])
                      .filter(
                        (t: AgentToolCatalogEntry) =>
                          !["crm", "ecommerce", "team"].some((g) => t.group?.includes(g)) &&
                          !BUSINESS_TOOL_NAMES.has(t.name),
                      )
                      .slice(0, 6)
                      .map((tool: AgentToolCatalogEntry) => (
                        <div
                          key={tool.name}
                          className="flex items-start gap-2 py-1 border-b border-border/30 last:border-none"
                        >
                          <div className="mt-1 h-3 w-3 rounded-sm bg-primary/70 shrink-0" />
                          <div>
                            <div className="font-medium text-[13px]">{tool.label}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {tool.description}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="studio-card p-4">
                  <div className="font-medium mb-3">Calendar & Meetings</div>
                  <div className="flex flex-wrap gap-2">
                    {(AGENT_TOOL_CATALOG || [])
                      .filter(
                        (t: AgentToolCatalogEntry) =>
                          t.group === "calendar" ||
                          t.name?.includes("appointment") ||
                          t.name?.includes("zoom"),
                      )
                      .map((tool: AgentToolCatalogEntry) => (
                        <span key={tool.name} className="text-xs px-2.5 py-1 bg-muted rounded-full">
                          {tool.label}
                        </span>
                      ))}
                    <span className="text-xs px-2.5 py-1 bg-muted rounded-full">
                      Check availability
                    </span>
                    <span className="text-xs px-2.5 py-1 bg-muted rounded-full">Book slots</span>
                  </div>
                </div>

                <div className="studio-card p-4">
                  <div className="font-medium mb-3">CRM, Commerce & Team</div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        CRM
                      </div>
                      {(AGENT_TOOL_CATALOG || [])
                        .filter((t: AgentToolCatalogEntry) => t.group === "crm")
                        .map((tool: AgentToolCatalogEntry) => (
                          <div key={tool.name} className="py-0.5">
                            {tool.label} — {tool.description}
                          </div>
                        ))}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        Commerce & Team
                      </div>
                      {(AGENT_TOOL_CATALOG || [])
                        .filter((t: AgentToolCatalogEntry) =>
                          ["ecommerce", "team"].includes(t.group),
                        )
                        .slice(0, 4)
                        .map((tool: AgentToolCatalogEntry) => (
                          <div key={tool.name} className="py-0.5 text-xs">
                            {tool.label}
                          </div>
                        ))}
                      <div className="text-xs mt-1 text-muted-foreground">
                        Shopify, Square, Slack alerts, etc.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="studio-card p-4 text-xs">
                  Device & Advanced: Push to phone, reminders, music, webhooks, custom enterprise
                  triggers. All opt-in per this agent's workspace.
                </div>
              </div>
            </div>

            <div className="mt-2 text-[10px] text-muted-foreground">
              Changes here affect only {agentName}.
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="studio-card p-5 lg:col-span-1">
              <div className="font-semibold mb-1">Brain</div>
              <div className="text-xs text-muted-foreground mb-3">
                Memory, knowledge, training — the agent's mind.
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Memory</span>{" "}
                  <span className="text-muted-foreground">persistent recall</span>
                </div>
                <div className="flex justify-between">
                  <span>Knowledge & Facts</span>{" "}
                  <span className="text-muted-foreground">sources</span>
                </div>
                <div className="flex justify-between">
                  <span>Training</span>{" "}
                  <span className="text-muted-foreground">voice, instructions, tests</span>
                </div>
              </div>
              <Link
                to={`/studio?agent=${agentId}`}
                className="mt-4 inline-block text-xs text-primary"
              >
                Deep dive in chat →
              </Link>
            </div>

            <div className="studio-card p-5">
              <div className="font-semibold mb-1">Record</div>
              <div className="text-xs text-muted-foreground mb-3">
                History and outcomes that train the agent.
              </div>
              <div className="text-sm">
                Live outcomes and full ledger appear in the chat area above. Every wire feeds back
                here.
              </div>
            </div>

            <div className="studio-card p-5">
              <div className="font-semibold mb-3">Controls</div>
              <div className="flex flex-col gap-2 text-sm">
                <Link to={`/studio?agent=${agentId}`} className="hover:text-primary">
                  Open full chat workspace
                </Link>
                <Link to="/settings" className="hover:text-primary">
                  Agent-level settings
                </Link>
                <div className="text-[10px] text-muted-foreground mt-1">
                  All of this agent's configuration lives in one place.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
