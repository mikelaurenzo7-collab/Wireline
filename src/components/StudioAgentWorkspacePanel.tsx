import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, PlugZap, Save } from "lucide-react";
import { Link } from "react-router";

import { authFetch } from "../lib/api";
import {
  BOT_MARK_CHOICES,
  defaultBotMarkKey,
  isBotMarkKey,
  type BotMarkKey,
} from "../lib/bot-mark";
import { composeSetupPersonality } from "../lib/compose-setup-personality";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { Button } from "./atoms";
import BotMark from "./BotMark";
import BotMarkPicker from "./BotMarkPicker";
import { StatusNotice } from "./molecules";
import SimpleVoicePicker from "./voice/SimpleVoicePicker";
import AgentToolPermissions from "./AgentToolPermissions";

const PERSONALITIES = ["Clear", "Warm", "Polished", "Energetic"] as const;

type StudioAgentWorkspacePanelProps = {
  agentId: string;
  agentName: string;
  isBusinessAgent?: boolean;
  onTestVoiceInChat: () => void;
  className?: string;
  compact?: boolean;
};

type AgentSetupResponse = {
  mark_key?: string | null;
  personality?: string;
  directives?: Array<{ content?: string }>;
};

function inferPersonality(value: string | undefined) {
  const normalized = value?.toLowerCase() ?? "";
  return PERSONALITIES.find((option) => normalized.includes(option.toLowerCase())) ?? "Clear";
}

/** Marks the single directive row that holds this agent's opening greeting. */
const GREETING_PREFIX = "Opening greeting:";

function existingGreeting(directives: AgentSetupResponse["directives"]) {
  const match = directives?.find((directive) => directive.content?.startsWith(GREETING_PREFIX));
  return match?.content?.slice(GREETING_PREFIX.length).trim() ?? "";
}

/** Did /api/train/extract actually persist a useful fact/rule/tone signal? */
async function extractionPersistedSomething(response: Response): Promise<boolean> {
  try {
    const body = (await response.json()) as {
      readiness?: { rules?: number; facts?: number; tone?: boolean };
    };
    const readiness = body?.readiness;
    if (!readiness) return true;
    return Boolean(readiness.rules) || Boolean(readiness.facts) || Boolean(readiness.tone);
  } catch {
    return true;
  }
}

export default function StudioAgentWorkspacePanel({
  agentId,
  agentName,
  isBusinessAgent = true,
  onTestVoiceInChat,
  className = "",
  compact = false,
}: StudioAgentWorkspacePanelProps) {
  const defaultGreeting = useMemo(
    () => `Hi, this is ${agentName || "your Bot"}. How can I help?`,
    [agentName],
  );
  const { agents } = useAgents();
  const unavailableMarkKeys = useMemo(
    () =>
      new Set<BotMarkKey>(
        agents
          .filter((agent) => agent.id !== agentId)
          .map((agent) => agent.mark_key)
          .filter((candidate): candidate is BotMarkKey => isBotMarkKey(candidate)),
      ),
    [agentId, agents],
  );
  const [setupPersonality, setSetupPersonality] = useState("Clear");
  const [setupMarkKey, setSetupMarkKey] = useState<BotMarkKey>(defaultBotMarkKey(agentId));
  const [loadedPersonality, setLoadedPersonality] = useState<string | null>(null);
  const [setupGreeting, setSetupGreeting] = useState("");
  const [setupKnowledge, setSetupKnowledge] = useState("");
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [applyingSetup, setApplyingSetup] = useState(false);
  const [setupLoadError, setSetupLoadError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const activeAgentIdRef = useRef(agentId);
  const selectedMarkLabel =
    BOT_MARK_CHOICES.find((choice) => choice.key === setupMarkKey)?.label ?? "Bot identity";

  useLayoutEffect(() => {
    activeAgentIdRef.current = agentId;
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoadingSetup(true);
    setApplyingSetup(false);
    setSetupLoadError(null);
    setSetupError(null);
    setSetupNotice(null);
    setSetupPersonality("Clear");
    setSetupMarkKey(defaultBotMarkKey(agentId));
    setSetupGreeting("");
    setSetupKnowledge("");
    setLoadedPersonality(null);
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Current setup could not be loaded.");
        return (await response.json()) as AgentSetupResponse;
      })
      .then((data) => {
        if (cancelled) return;
        const personality = typeof data.personality === "string" ? data.personality : "";
        setSetupMarkKey(isBotMarkKey(data.mark_key) ? data.mark_key : defaultBotMarkKey(agentId));
        setLoadedPersonality(personality || null);
        setSetupPersonality(inferPersonality(personality));
        setSetupGreeting(existingGreeting(data.directives));
      })
      .catch((reason) => {
        if (!cancelled) {
          setSetupLoadError(
            reason instanceof Error ? reason.message : "Current setup could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSetup(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, reloadKey]);

  async function saveManual(
    type: "personality" | "directive",
    content: string,
    replacePrefix?: string,
  ) {
    const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(replacePrefix ? { type, content, replacePrefix } : { type, content }),
    });
    if (!response.ok) {
      throw new Error(`${type === "personality" ? "Tone" : "Greeting"} could not be saved.`);
    }
  }

  async function applySetup() {
    if (!agentId) return;
    const setupAgentId = agentId;
    const isCurrentAgent = () => activeAgentIdRef.current === setupAgentId;
    setApplyingSetup(true);
    setSetupError(null);
    setSetupNotice(null);
    try {
      const personalityText = composeSetupPersonality(
        loadedPersonality,
        setupPersonality,
        isBusinessAgent,
      );
      const greetingTrimmed = setupGreeting.trim();
      const knowledgeTrimmed = setupKnowledge.trim();

      const markResponse = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/mark`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_key: setupMarkKey }),
      });
      if (!markResponse.ok) {
        throw new Error(
          markResponse.status === 409
            ? "That identity is already used by another Bot. Choose another mark or color."
            : "Bot mark could not be saved.",
        );
      }
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));

      await saveManual("personality", personalityText);
      if (isCurrentAgent()) setLoadedPersonality(personalityText);
      await saveManual(
        "directive",
        greetingTrimmed ? `${GREETING_PREFIX} ${greetingTrimmed}` : "",
        GREETING_PREFIX,
      );
      let knowledgeCaptured = true;
      if (knowledgeTrimmed) {
        const knowledgeResponse = await authFetch("/api/train/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, message: knowledgeTrimmed }),
        });
        if (!knowledgeResponse.ok) {
          throw new Error("Knowledge and rules could not be saved.");
        }
        knowledgeCaptured = await extractionPersistedSomething(knowledgeResponse);
        if (knowledgeCaptured && isCurrentAgent()) setSetupKnowledge("");
      }

      if (isCurrentAgent()) {
        if (!knowledgeCaptured) {
          setSetupNotice(null);
          setSetupError(
            "Tone and greeting were saved, but the knowledge needs to be more specific. Add short facts, preferences, or handoff rules and try again.",
          );
          return;
        }
        setSetupNotice("Saved. Run a test before sending live traffic.");
      }
    } catch (reason) {
      if (isCurrentAgent()) {
        setSetupError(reason instanceof Error ? reason.message : "Setup could not be saved.");
      }
    } finally {
      if (isCurrentAgent()) setApplyingSetup(false);
    }
  }

  const contentClass = compact
    ? "mx-auto w-full max-w-none space-y-3 px-3 py-3"
    : "mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6 sm:py-7";
  const sectionClass = compact
    ? "rounded-xl border border-border bg-card p-4"
    : "rounded-2xl border border-border bg-card p-5 sm:p-6";

  return (
    <div
      data-wireline-studio-setup-density={compact ? "inspector" : "page"}
      className={`min-h-0 flex-1 overflow-y-auto bg-background ${className}`}
    >
      <div className={contentClass}>
        <header className={compact ? "px-1 pt-1" : ""}>
          <h2
            className={
              compact
                ? "wl-preserve-case text-lg font-semibold leading-tight tracking-tight text-foreground"
                : "wl-preserve-case text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            }
          >
            Tone & knowledge
          </h2>
        </header>

        <section className={sectionClass} aria-label="Tone and knowledge">
          {loadingSetup ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading…
            </div>
          ) : setupLoadError ? (
            <StatusNotice
              tone="destructive"
              title="Setup unavailable"
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setReloadKey((current) => current + 1)}
                >
                  Try again
                </Button>
              }
            >
              {setupLoadError} Your saved setup was not changed.
            </StatusNotice>
          ) : (
            <div className={compact ? "space-y-4" : "space-y-5"}>
              <details className="group rounded-xl border border-border bg-background">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 wl-focus-ring-halo">
                  <span className="flex min-w-0 items-center gap-3">
                    <BotMark
                      seed={agentId}
                      name={agentName}
                      markKey={setupMarkKey}
                      size={32}
                      title={`${agentName} identity mark`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        Identity mark
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {selectedMarkLabel}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                    Change
                    <ChevronDown
                      className="size-4 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </span>
                </summary>
                <div className="border-t border-border p-3 sm:p-4">
                  <BotMarkPicker
                    value={setupMarkKey}
                    onChange={setSetupMarkKey}
                    seed={agentId}
                    name={agentName}
                    compact
                    disabled={applyingSetup}
                    unavailableKeys={unavailableMarkKeys}
                  />
                </div>
              </details>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Tone</legend>
                <div className="grid grid-cols-2 gap-2">
                  {PERSONALITIES.map((option) => {
                    const selected = setupPersonality === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSetupPersonality(option)}
                        className={`min-h-11 rounded-xl border px-3 py-2.5 text-left transition-colors wl-focus-ring-halo ${
                          selected
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-background hover:bg-muted/60"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                          {option}
                          {selected ? (
                            <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="grid gap-2" htmlFor="setup-greeting">
                <span className="text-sm font-semibold text-foreground">Opening greeting</span>
                <textarea
                  id="setup-greeting"
                  value={setupGreeting}
                  onChange={(event) => setSetupGreeting(event.target.value)}
                  placeholder={defaultGreeting}
                  rows={2}
                  className="min-h-11 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                />
              </label>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <label
                    className="text-sm font-semibold text-foreground"
                    htmlFor="setup-knowledge"
                  >
                    Knowledge and rules{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Link
                    to={`/knowledge?agent=${encodeURIComponent(agentId)}`}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    View all
                  </Link>
                </div>
                <textarea
                  id="setup-knowledge"
                  value={setupKnowledge}
                  onChange={(event) => setSetupKnowledge(event.target.value)}
                  className={`${compact ? "min-h-20" : "min-h-24"} w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary/50`}
                  placeholder="Facts, preferences, policies, calendar rules, and handoffs…"
                />
              </div>

              {setupNotice ? <StatusNotice tone="success">{setupNotice}</StatusNotice> : null}
              {setupError ? (
                <StatusNotice tone="destructive" title="Needs attention">
                  {setupError}
                </StatusNotice>
              ) : null}

              <Button
                type="button"
                size={compact ? "sm" : undefined}
                onClick={() => void applySetup()}
                disabled={applyingSetup}
              >
                {applyingSetup ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="size-4" aria-hidden="true" />
                )}
                {applyingSetup ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </section>

        <section className={sectionClass} aria-labelledby="voice-heading">
          <h3
            id="voice-heading"
            className={`${compact ? "mb-2 text-base" : "mb-3 text-lg"} font-semibold tracking-tight text-foreground`}
          >
            Phone voice
          </h3>
          <SimpleVoicePicker agentId={agentId} agentName={agentName} />
        </section>

        <details
          className={`${compact ? "rounded-xl" : "rounded-2xl"} group border border-border bg-card`}
        >
          <summary
            className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl text-sm font-semibold text-foreground wl-focus-ring-halo ${
              compact ? "min-h-12 px-4" : "min-h-14 px-5 sm:px-6"
            }`}
          >
            Tools
            <ChevronDown
              className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="border-t border-border p-3 sm:p-4">
            <AgentToolPermissions agentId={agentId} />
          </div>
        </details>

        <div
          className={`flex gap-2 ${compact ? "flex-wrap" : "flex-col sm:flex-row sm:justify-end"}`}
        >
          <Button
            type="button"
            size={compact ? "sm" : undefined}
            variant="secondary"
            onClick={onTestVoiceInChat}
            className="justify-center"
          >
            Test Bot
          </Button>
          <Button
            asChild
            size={compact ? "sm" : undefined}
            variant="secondary"
            className="justify-center"
          >
            <Link to="/connections">
              <PlugZap className="size-4" aria-hidden="true" />
              Connections
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
