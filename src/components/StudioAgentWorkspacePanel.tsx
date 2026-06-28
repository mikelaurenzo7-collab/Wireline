import { Play, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import { authFetch } from "../lib/api";
import {
  AGENT_TOOL_CATALOG,
  BUSINESS_TOOL_NAMES,
  type AgentToolCatalogEntry,
} from "../lib/agent-capabilities";
import {
  WORKSPACE_INTEGRATION_CATALOG,
  type WorkspaceIntegration,
} from "../lib/workspace-integration-catalog";
import { VoicePreviewButton } from "./DeployAgentModal";

type Voice = { id: string; name: string; provider?: string; preview_url?: string };

const XAI_VOICES: Voice[] = [
  { id: "eve", name: "Eve — Bright & Energetic", provider: "xai" },
  { id: "ara", name: "Ara — Warm & Professional", provider: "xai" },
  { id: "rex", name: "Rex — Clear & Confident", provider: "xai" },
  { id: "sal", name: "Sal — Balanced & Friendly", provider: "xai" },
  { id: "leo", name: "Leo — Direct & Energetic", provider: "xai" },
];

const PERSONALITIES = ["Clear", "Warm", "Direct", "Polished", "Custom"];

type StudioAgentWorkspacePanelProps = {
  agentId: string;
  agentName: string;
  onTestVoiceInChat: () => void;
};

export default function StudioAgentWorkspacePanel({
  agentId,
  agentName,
  onTestVoiceInChat,
}: StudioAgentWorkspacePanelProps) {
  const [allVoices, setAllVoices] = useState<Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voiceSearch, setVoiceSearch] = useState("");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [applyingVoiceId, setApplyingVoiceId] = useState<string | null>(null);
  const [voiceApplyError, setVoiceApplyError] = useState<string | null>(null);

  const [setupPersonality, setSetupPersonality] = useState("Clear");
  const [setupGreeting, setSetupGreeting] = useState(
    `Hello, this is ${agentName || "your agent"}. How can I help?`,
  );
  const [setupKnowledge, setSetupKnowledge] = useState("");
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [applyingSetup, setApplyingSetup] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);

  const [previewText, setPreviewText] = useState(
    "Hello, this is your new agent. How can I help you today?",
  );

  useEffect(() => {
    setSetupGreeting(`Hello, this is ${agentName || "your agent"}. How can I help?`);
  }, [agentName]);

  useEffect(() => {
    if (!agentId) return;
    setVoicesLoading(true);
    authFetch("/api/voices")
      .then((r) => r.json())
      .then((data) => setAllVoices(data.voices || []))
      .catch(() => setAllVoices([]))
      .finally(() => setVoicesLoading(false));
  }, [agentId]);

  function playVoice(voice: Voice) {
    if (playingVoiceId === voice.id) {
      window.speechSynthesis?.cancel?.();
      setPlayingVoiceId(null);
      return;
    }
    setPlayingVoiceId(voice.id);
    if (voice.provider === "xai") {
      const utterance = new SpeechSynthesisUtterance(
        `Hello, this is ${voice.name.split(" — ")[0]}. How can I help you today?`,
      );
      utterance.onend = () => setPlayingVoiceId(null);
      window.speechSynthesis.speak(utterance);
    } else {
      const url = voice.preview_url || `/api/voices/${encodeURIComponent(voice.id)}/preview`;
      const audio = new Audio(url);
      audio.onended = () => setPlayingVoiceId(null);
      audio.onerror = () => setPlayingVoiceId(null);
      audio.play().catch(() => setPlayingVoiceId(null));
    }
  }

  async function applyVoice(voice: Voice) {
    if (!agentId) return;
    setApplyingVoiceId(voice.id);
    setVoiceApplyError(null);
    setSelectedVoice(voice);
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/voice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voice.id, provider: voice.provider || "11labs" }),
      });
      if (!response.ok) throw new Error("Voice could not be saved.");
    } catch (reason) {
      setVoiceApplyError(reason instanceof Error ? reason.message : "Voice could not be saved.");
    } finally {
      setApplyingVoiceId(null);
    }
  }

  async function applySetup() {
    if (!agentId) return;
    setApplyingSetup(true);
    setSetupError(null);
    setSetupNotice(null);
    try {
      if (selectedVoice) {
        const voiceResponse = await authFetch(
          `/api/agent-config/${encodeURIComponent(agentId)}/voice`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              voiceId: selectedVoice.id,
              provider: selectedVoice.provider || "11labs",
            }),
          },
        );
        if (!voiceResponse.ok) throw new Error("Voice could not be saved.");
      }

      const personalityText =
        setupPersonality === "Custom"
          ? setupPersonality
          : `${setupPersonality}. Concise. Useful. Business-ready.`;
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

      setIsSetupComplete(true);
      setSetupNotice("Setup applied. Voice, personality, and knowledge are saved for this agent.");
    } catch (reason) {
      setSetupError(reason instanceof Error ? reason.message : "Setup could not be applied.");
    } finally {
      setApplyingSetup(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/60">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Workspace for {agentName}</h2>
            <p className="text-sm text-muted-foreground">
              Everything for this agent lives here. Setup or manage anytime.
            </p>
          </div>
          <div
            className={`text-[10px] px-2 py-0.5 rounded ${isSetupComplete ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
          >
            Setup status: {isSetupComplete ? "Complete" : "In progress"}
          </div>
        </div>

        <div className="studio-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Onboard &amp; Customize</h3>
              <p className="text-sm text-muted-foreground">
                Start simple. Customize deeply. Everything stays in this workspace.
              </p>
            </div>
            <button
              onClick={() => {
                const quickVoice = XAI_VOICES[0] || allVoices[0];
                if (quickVoice) void applyVoice(quickVoice);
              }}
              disabled={Boolean(applyingVoiceId)}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.985] transition disabled:opacity-60"
            >
              Quick Start
            </button>
          </div>

          {voiceApplyError ? (
            <p className="mb-3 text-sm text-destructive" role="alert">
              {voiceApplyError}
            </p>
          ) : null}

          <div>
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <span className="font-medium">Voice Gallery</span>
                <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Hear xAI + ElevenLabs live
                </span>
              </div>
              <input
                type="text"
                value={voiceSearch}
                onChange={(e) => setVoiceSearch(e.target.value)}
                placeholder="Search voices..."
                className="text-xs border border-border rounded-lg px-3 py-1 bg-background focus:ring-1 focus:ring-primary/30"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                  <Sparkles size={12} /> xAI Grok Voices (built-in)
                </div>
                <div className="space-y-1">
                  {XAI_VOICES.filter(
                    (v) => !voiceSearch || v.name.toLowerCase().includes(voiceSearch.toLowerCase()),
                  ).map((v) => {
                    const isPlaying = playingVoiceId === v.id;
                    const isSel = selectedVoice?.id === v.id;
                    const isApplying = applyingVoiceId === v.id;
                    return (
                      <div
                        key={v.id}
                        className={`group flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${isSel ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                      >
                        <span>{v.name}</span>
                        <div className="flex items-center gap-1.5 text-xs">
                          <button
                            onClick={() => playVoice(v)}
                            className={`flex items-center gap-1 rounded px-2 py-0.5 ${isPlaying ? "bg-primary text-white" : "hover:bg-muted"}`}
                            aria-label={`Preview ${v.name}`}
                          >
                            <Play size={11} /> {isPlaying ? "Stop" : "Preview"}
                          </button>
                          <button
                            onClick={() => void applyVoice(v)}
                            disabled={isApplying}
                            className="rounded bg-primary/10 px-2 py-0.5 text-primary hover:bg-primary/20 disabled:opacity-60"
                          >
                            {isApplying ? "Saving…" : "Use"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  ElevenLabs (live from API)
                </div>
                <div className="space-y-1 max-h-48 overflow-auto pr-1">
                  {voicesLoading && (
                    <div className="text-xs text-muted-foreground py-2">Loading voices…</div>
                  )}
                  {!voicesLoading && allVoices.length === 0 && (
                    <div className="text-xs text-muted-foreground py-2">No voices available.</div>
                  )}
                  {allVoices
                    .filter(
                      (v) =>
                        !voiceSearch ||
                        (v.name || v.id || "").toLowerCase().includes(voiceSearch.toLowerCase()),
                    )
                    .slice(0, 12)
                    .map((v) => {
                      const isSel = selectedVoice?.id === v.id;
                      const isApplying = applyingVoiceId === v.id;
                      return (
                        <div
                          key={v.id}
                          className={`group flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${isSel ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                        >
                          <span className="truncate">
                            {v.name || v.id}{" "}
                            <span className="text-[10px] text-muted-foreground">
                              ({v.provider || "11labs"})
                            </span>
                          </span>
                          <div className="flex items-center gap-1.5 text-xs shrink-0">
                            <VoicePreviewButton voiceId={v.id} voiceName={v.name || v.id} />
                            <button
                              onClick={() => void applyVoice(v)}
                              disabled={isApplying}
                              className="rounded bg-primary/10 px-2 py-0.5 text-primary hover:bg-primary/20 disabled:opacity-60"
                            >
                              {isApplying ? "Saving…" : "Use"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              xAI uses system voice for demo. ElevenLabs uses real API previews. Full quality in
              calls &amp; tests.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                id="preview-text"
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background"
              />
              <button
                onClick={() => {
                  const utterance = new SpeechSynthesisUtterance(previewText || "Hello");
                  window.speechSynthesis.speak(utterance);
                }}
                className="text-xs px-2 py-1 border rounded hover:bg-muted"
              >
                Play custom text (demo)
              </button>
            </div>
            <button
              type="button"
              onClick={onTestVoiceInChat}
              className="mt-1 text-xs text-primary underline"
            >
              Test this voice in the chat above →
            </button>
          </div>

          <div className="mb-4 mt-6">
            <div className="uppercase text-[10px] tracking-[0.12em] text-primary font-medium mb-2">
              2. Quick Personality &amp; Greeting
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
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
            <div className="uppercase text-[10px] tracking-[0.12em] text-primary font-medium mb-2">
              3. Seed Initial Knowledge
            </div>
            <label htmlFor="setup-knowledge" className="text-xs block mb-1">
              Seed Initial Knowledge
            </label>
            <textarea
              id="setup-knowledge"
              value={setupKnowledge}
              onChange={(e) => setSetupKnowledge(e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background min-h-[50px]"
              placeholder="E.g. Business hours 9-5. Free shipping over $50."
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
              {applyingSetup ? "Applying…" : "Apply Setup"}
            </button>
            <button
              onClick={() => setIsSetupComplete(true)}
              className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted"
            >
              Mark Complete
            </button>
            <button
              onClick={() => {
                /* expand */
              }}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Full custom below →
            </button>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold tracking-[-0.02em]">World Connections</h3>
                <p className="text-sm text-muted-foreground">
                  Everything {agentName} is wired to. Connections and actions live here, per this
                  workspace only.
                </p>
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
                Scoped to agent
              </div>
            </div>

            <div className="mb-6">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
                Context Providers
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(WORKSPACE_INTEGRATION_CATALOG || []).map(
                  (integ: WorkspaceIntegration, idx: number) => (
                    <div
                      key={idx}
                      className="studio-card p-4 hover:border-primary/20 transition-all group"
                    >
                      <div className="flex justify-between">
                        <div>
                          <div className="font-semibold">{integ.label}</div>
                          <div className="text-[10px] text-muted-foreground">{integ.family}</div>
                        </div>
                        <div className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 self-start">
                          wired
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground leading-snug">
                        {integ.detail}
                      </div>
                      <div className="mt-2 text-[10px] text-primary group-hover:underline">
                        Capabilities: {integ.capabilities?.join(" · ")}
                      </div>
                    </div>
                  ),
                )}
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
              These are the exact catalogs and groupings from the full system — now organized as
              this agent's personal wires to the world. Changes here affect only {agentName}.
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
                to={`/studio?agent=${agentId}&mode=workroom`}
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
                <Link to={`/studio?agent=${agentId}&mode=workroom`} className="hover:text-primary">
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
