import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, PlugZap, Save } from "lucide-react";
import { Link } from "react-router";

import { authFetch } from "../lib/api";
import { defaultBotMarkKey, isBotMarkKey, type BotMarkKey } from "../lib/bot-mark";
import { composeSetupPersonality, readSetupDeliveryTone } from "../lib/compose-setup-personality";
import { OPENING_GREETING_PREFIX } from "../lib/agent-greeting";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import {
  CREATE_BRIEF_MAX_CHARS,
  clearCreateBrief,
  isCreateBriefRecoveryOwner,
  readCreateBrief,
  rememberCreateBrief,
} from "../lib/create-brief-recovery";
import { extractionPersistedSomething } from "../lib/training-extraction-result";
import { createStudioSetupDrafts, type StudioSetupDrafts } from "../lib/studio-setup-drafts";
import { Button } from "./atoms";
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
  drafts?: StudioSetupDrafts;
};

type AgentSetupResponse = {
  mark_key?: string | null;
  personality?: string;
  openingGreeting?: string | null;
  firstMessage?: string | null;
  directives?: Array<{ content?: string }>;
};

function inferPersonality(value: string | undefined) {
  const normalized = readSetupDeliveryTone(value).toLowerCase();
  return (
    [...PERSONALITIES, "Playful", "Authoritative"].find((option) =>
      normalized.includes(option.toLowerCase()),
    ) ?? "Clear"
  );
}

/** Marks the single directive row that holds this agent's opening greeting. */
const GREETING_PREFIX = OPENING_GREETING_PREFIX;

function existingGreeting(config: AgentSetupResponse) {
  const match = config.directives?.find((directive) =>
    directive.content?.startsWith(GREETING_PREFIX),
  );
  return (
    config.openingGreeting?.trim() ||
    match?.content?.slice(GREETING_PREFIX.length).trim() ||
    config.firstMessage?.trim() ||
    ""
  );
}

export default function StudioAgentWorkspacePanel({
  agentId,
  agentName,
  isBusinessAgent = true,
  onTestVoiceInChat,
  className = "",
  compact = false,
  drafts,
}: StudioAgentWorkspacePanelProps) {
  const defaultGreeting = useMemo(
    () => `Hi, this is ${agentName || "your Bot"}. How can I help?`,
    [agentName],
  );
  const { agents } = useAgents();
  const savedMarkKey =
    agents.find((agent) => agent.id === agentId)?.mark_key ?? defaultBotMarkKey(agentId);
  const { user } = useAuth();
  const fallbackDraftsRef = useRef<StudioSetupDrafts | null>(null);
  if (!fallbackDraftsRef.current || fallbackDraftsRef.current.ownerId !== (user?.id ?? null)) {
    fallbackDraftsRef.current = createStudioSetupDrafts(user?.id ?? null);
  }
  const setupDrafts =
    drafts && drafts.ownerId === (user?.id ?? null) ? drafts : fallbackDraftsRef.current;
  const [, refreshDraft] = useState(0);
  const snapshot = setupDrafts.read(agentId);
  const {
    tone: setupPersonality,
    markKey: setupMarkKey,
    loadedPersonality,
    greeting: setupGreeting,
    knowledge: setupKnowledge,
  } = snapshot.values;
  const applyingSetup = snapshot.saving;
  const toneOptions = PERSONALITIES.some((tone) => tone === setupPersonality)
    ? PERSONALITIES
    : [...PERSONALITIES, setupPersonality];
  useEffect(
    () => setupDrafts.subscribe(agentId, () => refreshDraft((current) => current + 1)),
    [agentId, setupDrafts],
  );
  const activeUserIdRef = useRef(user?.id ?? null);
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
  const [recoveringBrief, setRecoveringBrief] = useState(false);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [setupLoadError, setSetupLoadError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const activeAgentIdRef = useRef(agentId);

  useEffect(() => {
    const reload = () => setReloadKey((current) => current + 1);
    window.addEventListener(AGENTS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(AGENTS_CHANGED_EVENT, reload);
  }, []);

  useEffect(() => {
    setSetupError(null);
    setSetupNotice(null);
  }, [agentId, user?.id]);

  useLayoutEffect(() => {
    activeAgentIdRef.current = agentId;
    activeUserIdRef.current = user?.id ?? null;
    return () => {
      activeUserIdRef.current = null;
    };
  }, [agentId, user?.id]);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoadingSetup(true);
    setSetupLoadError(null);
    const recovered = user?.id ? readCreateBrief(user.id, agentId) : "";
    setupDrafts.seedKnowledge(agentId, recovered);
    setRecoveringBrief(Boolean(recovered));
    const startedRevision = setupDrafts.revision();
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Current setup could not be loaded.");
        return (await response.json()) as AgentSetupResponse;
      })
      .then((data) => {
        if (cancelled) return;
        const personality = typeof data.personality === "string" ? data.personality : "";
        setupDrafts.load(
          agentId,
          {
            markKey: isBotMarkKey(data.mark_key) ? data.mark_key : defaultBotMarkKey(agentId),
            loadedPersonality: personality || null,
            tone: inferPersonality(personality),
            greeting: existingGreeting(data),
            knowledge: "",
          },
          startedRevision,
        );
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
  }, [agentId, reloadKey, user?.id, setupDrafts]);

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
    if (!agentId || !user?.id || !setupDrafts.beginSave(agentId)) return;
    const setupAgentId = agentId;
    const setupUserId = user.id;
    const isCurrentAgent = () =>
      activeAgentIdRef.current === setupAgentId &&
      activeUserIdRef.current === setupUserId &&
      isCreateBriefRecoveryOwner(setupUserId);
    setSetupError(null);
    setSetupNotice(null);
    let confirmedChange = false;
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
      setupDrafts.confirm(setupAgentId, { markKey: setupMarkKey }, { markKey: setupMarkKey });
      confirmedChange = true;
      if (!isCurrentAgent()) return;
      await saveManual("personality", personalityText);
      setupDrafts.confirm(
        setupAgentId,
        { tone: setupPersonality },
        {
          tone: setupPersonality,
          loadedPersonality: personalityText,
        },
      );
      if (!isCurrentAgent()) return;
      await saveManual(
        "directive",
        greetingTrimmed ? `${GREETING_PREFIX} ${greetingTrimmed}` : "",
        GREETING_PREFIX,
      );
      setupDrafts.confirm(setupAgentId, { greeting: setupGreeting }, { greeting: greetingTrimmed });
      let knowledgeCaptured = true;
      if (!isCurrentAgent()) return;
      if (knowledgeTrimmed) {
        const knowledgeResponse = await authFetch("/api/train/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, message: knowledgeTrimmed }),
        });
        if (!knowledgeResponse.ok) {
          const body = (await knowledgeResponse.json().catch(() => null)) as {
            error?: unknown;
          } | null;
          const detail =
            typeof body?.error === "string" && body.error.trim()
              ? body.error
              : "Knowledge and rules could not be saved.";
          throw new Error(`${detail} Tone and greeting were saved.`);
        }
        knowledgeCaptured = await extractionPersistedSomething(knowledgeResponse);
        if (knowledgeCaptured && isCreateBriefRecoveryOwner(setupUserId)) {
          setupDrafts.confirm(setupAgentId, { knowledge: setupKnowledge }, { knowledge: "" });
          clearCreateBrief(setupUserId, setupAgentId, knowledgeTrimmed);
          if (isCurrentAgent()) setRecoveringBrief(false);
        }
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
      setupDrafts.endSave(setupAgentId);
      if (confirmedChange && isCurrentAgent())
        window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
    }
  }

  const contentClass = compact
    ? "mx-auto w-full max-w-none space-y-3 px-2 py-3 sm:px-3"
    : "mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6 sm:py-7";
  const sectionClass = compact
    ? "rounded-xl border border-border bg-card p-3 sm:p-4"
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
                ? "wl-preserve-case break-words text-lg font-semibold leading-tight tracking-tight text-foreground"
                : "wl-preserve-case break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            }
          >
            Tone & Knowledge
          </h2>
          {snapshot.dirty ? (
            <p className="mt-1 text-xs text-muted-foreground" role="status">
              Unsaved changes
            </p>
          ) : null}
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
              title="Setup Unavailable"
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
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Tone</legend>
                <div className="wl-studio-tone-options grid gap-2">
                  {toneOptions.map((option) => {
                    const selected = setupPersonality === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={applyingSetup}
                        aria-pressed={selected}
                        onClick={() => setupDrafts.edit(agentId, "tone", option)}
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
                  disabled={applyingSetup}
                  value={setupGreeting}
                  onChange={(event) => setupDrafts.edit(agentId, "greeting", event.target.value)}
                  placeholder={defaultGreeting}
                  rows={2}
                  className="min-h-11 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                />
              </label>

              <div className="grid gap-2">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
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
                    Knowledge & rules
                  </Link>
                </div>
                <textarea
                  id="setup-knowledge"
                  disabled={applyingSetup}
                  maxLength={recoveringBrief ? CREATE_BRIEF_MAX_CHARS : undefined}
                  value={setupKnowledge}
                  onChange={(event) => {
                    const next = event.target.value;
                    setupDrafts.edit(agentId, "knowledge", next);
                    if (recoveringBrief && user?.id) {
                      if (next.trim()) rememberCreateBrief(user.id, agentId, next);
                      else {
                        clearCreateBrief(user.id, agentId);
                        setRecoveringBrief(false);
                      }
                    }
                  }}
                  className={`${compact ? "min-h-20" : "min-h-24"} w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary/50`}
                  placeholder="Facts, preferences, policies, calendar rules, and handoffs…"
                />
              </div>

              <details className="group rounded-xl border border-border bg-background">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground wl-focus-ring-halo">
                  <span>Appearance</span>
                  <ChevronDown
                    className="size-4 shrink-0 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="border-t border-border p-2 sm:p-4">
                  <BotMarkPicker
                    value={setupMarkKey}
                    onChange={(value) => setupDrafts.edit(agentId, "markKey", value)}
                    seed={agentId}
                    name={agentName}
                    compact
                    disabled={applyingSetup}
                    unavailableKeys={unavailableMarkKeys}
                  />
                </div>
              </details>

              {setupNotice ? <StatusNotice tone="success">{setupNotice}</StatusNotice> : null}
              {recoveringBrief ? (
                <StatusNotice tone="info">
                  Your starting brief is preserved above. Review it, then save changes to apply it.
                </StatusNotice>
              ) : null}
              {setupError ? (
                <StatusNotice tone="destructive" title="Needs Attention">
                  {setupError}
                </StatusNotice>
              ) : null}

              <Button
                type="button"
                size={compact ? "sm" : undefined}
                className="h-auto whitespace-normal"
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
            Phone Voice
          </h3>
          <SimpleVoicePicker agentId={agentId} agentName={agentName} markKey={savedMarkKey} />
        </section>

        <AgentToolPermissions
          agentId={agentId}
          className={compact ? "rounded-xl p-3 sm:p-4" : undefined}
        />

        <div
          className={`flex gap-2 ${compact ? "flex-wrap" : "flex-col sm:flex-row sm:justify-end"}`}
        >
          <Button
            type="button"
            size={compact ? "sm" : undefined}
            variant="secondary"
            onClick={onTestVoiceInChat}
            className="h-auto justify-center whitespace-normal"
          >
            Test Bot
          </Button>
          <Button
            asChild
            size={compact ? "sm" : undefined}
            variant="secondary"
            className="h-auto justify-center whitespace-normal"
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
