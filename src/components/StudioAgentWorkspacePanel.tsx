import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, PlugZap, Save, Video } from "lucide-react";
import { Link } from "react-router";

import { authFetch } from "../lib/api";
import { composeSetupPersonality } from "../lib/compose-setup-personality";
import { Button } from "./atoms";
import { StatusNotice } from "./molecules";
import SimpleVoicePicker from "./voice/SimpleVoicePicker";
import AgentToolPermissions from "./AgentToolPermissions";

const PERSONALITIES = ["Clear", "Warm", "Polished", "Energetic"] as const;

type StudioAgentWorkspacePanelProps = {
  agentId: string;
  agentName: string;
  /** Legacy capability profile; never rendered as a separate workspace. */
  isBusinessAgent?: boolean;
  onTestVoiceInChat: () => void;
  className?: string;
};

type AgentSetupResponse = {
  personality?: string;
  directives?: Array<{ content?: string }>;
};

function inferPersonality(value: string | undefined) {
  const normalized = value?.toLowerCase() ?? "";
  return PERSONALITIES.find((option) => normalized.includes(option.toLowerCase())) ?? "Clear";
}

/** Marks the single directive row that holds this Bot's opening greeting. */
const GREETING_PREFIX = "Opening greeting:";

function existingGreeting(directives: AgentSetupResponse["directives"]) {
  const match = directives?.find((directive) => directive.content?.startsWith(GREETING_PREFIX));
  return match?.content?.slice(GREETING_PREFIX.length).trim() ?? "";
}

/** Did /api/train/extract actually store anything? */
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
}: StudioAgentWorkspacePanelProps) {
  const defaultGreeting = useMemo(
    () => `Hello, this is ${agentName || "your Bot"}. How can I help?`,
    [agentName],
  );
  const [setupPersonality, setSetupPersonality] = useState("Clear");
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
      // The old capability profile remains an input to personality composition
      // only until stored records are migrated. It does not change the UI model.
      const personalityText = composeSetupPersonality(
        loadedPersonality,
        setupPersonality,
        isBusinessAgent,
      );
      const greetingTrimmed = setupGreeting.trim();
      const knowledgeTrimmed = setupKnowledge.trim();

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
          throw new Error("Workflow information could not be saved.");
        }
        knowledgeCaptured = await extractionPersistedSomething(knowledgeResponse);
        if (knowledgeCaptured && isCurrentAgent()) setSetupKnowledge("");
      }

      if (isCurrentAgent()) {
        if (!knowledgeCaptured) {
          setSetupNotice(null);
          setSetupError(
            "Tone and greeting were saved, but nothing concrete could be pulled out of the details. Rewrite them as short, specific facts, rules, hours, pricing, preferences, constraints, or handoff instructions and apply again.",
          );
          return;
        }
        setSetupNotice("Run a test before connecting live traffic.");
      }
    } catch (reason) {
      if (isCurrentAgent()) {
        setSetupError(reason instanceof Error ? reason.message : "Setup could not be saved.");
      }
    } finally {
      if (isCurrentAgent()) setApplyingSetup(false);
    }
  }

  return (
    <div className={`min-h-0 flex-1 overflow-y-auto bg-background ${className}`}>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <header>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Give <span className="wl-preserve-case">{agentName}</span> one clear job
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Configure the playbook, voice, knowledge, tools, channels, and guardrails for this Bot.
          </p>
        </header>

        <section
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          aria-labelledby="essentials-heading"
        >
          <div className="mb-4">
            <h3
              id="essentials-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Playbook
            </h3>
          </div>

          {loadingSetup ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading setup…
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
                  Try Again
                </Button>
              }
            >
              {setupLoadError} Your saved setup was not changed.
            </StatusNotice>
          ) : (
            <div className="space-y-5">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Tone</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PERSONALITIES.map((option) => {
                    const selected = setupPersonality === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSetupPersonality(option)}
                        className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                          selected
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-background hover:bg-muted/60"
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          {selected ? (
                            <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                          ) : null}
                          {option}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="grid gap-2" htmlFor="setup-greeting">
                <span className="text-sm font-semibold text-foreground">Opening Greeting</span>
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
                    Essential Knowledge{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Link
                    to={`/knowledge?agent=${encodeURIComponent(agentId)}`}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    Open Knowledge
                  </Link>
                </div>
                <textarea
                  id="setup-knowledge"
                  value={setupKnowledge}
                  onChange={(event) => setSetupKnowledge(event.target.value)}
                  className="min-h-28 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary/50"
                  placeholder="Services, preferences, hours, pricing, policies, FAQs, calendar constraints, hard rules, and when to hand off…"
                />
              </div>

              {setupNotice ? (
                <StatusNotice tone="success" title="Changes Saved">
                  {setupNotice}
                </StatusNotice>
              ) : null}
              {setupError ? (
                <StatusNotice tone="destructive" title="Setup Needs Attention">
                  {setupError}
                </StatusNotice>
              ) : null}

              <Button type="button" onClick={() => void applySetup()} disabled={applyingSetup}>
                {applyingSetup ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="size-4" aria-hidden="true" />
                )}
                {applyingSetup ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          )}
        </section>

        <section
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          aria-labelledby="voice-heading"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 id="voice-heading" className="text-lg font-semibold tracking-tight text-foreground">
                Voice
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose how the Bot sounds, then test it before launch.
              </p>
            </div>
            {isBusinessAgent ? (
              <Link
                to={`/studio/live-video?agent=${encodeURIComponent(agentId)}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Video className="size-3.5" aria-hidden="true" />
                Live Video
              </Link>
            ) : null}
          </div>
          <SimpleVoicePicker agentId={agentId} agentName={agentName} onTest={onTestVoiceInChat} />
        </section>

        <AgentToolPermissions agentId={agentId} />

        <section
          className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6"
          aria-label="Continue setup"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Channels</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Connect voice, text, and email as needed. They share this Bot's identity, knowledge,
                rules, and outcome history.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={onTestVoiceInChat}
                className="justify-center"
              >
                Test Conversation
              </Button>
              <Button asChild className="justify-center">
                <Link to="/connections">
                  <PlugZap className="size-4" aria-hidden="true" />
                  Connect Channels
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
