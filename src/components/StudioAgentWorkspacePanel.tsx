import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, PlugZap, Save } from "lucide-react";
import { Link } from "react-router-dom";

import { authFetch } from "../lib/api";
import { composeSetupPersonality } from "../lib/compose-setup-personality";
import { Button } from "./atoms";
import { StatusNotice } from "./molecules";
import SimpleVoicePicker from "./voice/SimpleVoicePicker";

const PERSONALITIES = [
  { id: "Clear", description: "Direct and easy to understand" },
  { id: "Warm", description: "Friendly and patient" },
  { id: "Polished", description: "Professional and measured" },
  { id: "Energetic", description: "Upbeat and proactive" },
] as const;

type StudioAgentWorkspacePanelProps = {
  agentId: string;
  agentName: string;
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
  return (
    PERSONALITIES.find((option) => normalized.includes(option.id.toLowerCase()))?.id ?? "Clear"
  );
}

function existingGreeting(directives: AgentSetupResponse["directives"]) {
  const prefix = "Opening greeting:";
  const match = directives?.find((directive) => directive.content?.startsWith(prefix));
  return match?.content?.slice(prefix.length).trim() ?? "";
}

export default function StudioAgentWorkspacePanel({
  agentId,
  agentName,
  isBusinessAgent = true,
  onTestVoiceInChat,
  className = "",
}: StudioAgentWorkspacePanelProps) {
  const defaultGreeting = useMemo(
    () =>
      isBusinessAgent
        ? `Hello, this is ${agentName || "your AI employee"}. How can I help?`
        : `Hi, this is ${agentName || "your personal agent"}. How can I help?`,
    [agentName, isBusinessAgent],
  );
  const [setupPersonality, setSetupPersonality] = useState("Clear");
  const [loadedPersonality, setLoadedPersonality] = useState<string | null>(null);
  const [setupGreeting, setSetupGreeting] = useState(defaultGreeting);
  const [setupKnowledge, setSetupKnowledge] = useState("");
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [applyingSetup, setApplyingSetup] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoadingSetup(true);
    setSetupError(null);
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
        setSetupGreeting(existingGreeting(data.directives) || defaultGreeting);
      })
      .catch((reason) => {
        if (!cancelled) {
          setSetupGreeting(defaultGreeting);
          setSetupError(
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
  }, [agentId, defaultGreeting]);

  async function saveManual(type: "personality" | "directive", content: string) {
    const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, content }),
    });
    if (!response.ok) {
      throw new Error(`${type === "personality" ? "Tone" : "Greeting"} could not be saved.`);
    }
  }

  async function applySetup() {
    if (!agentId) return;
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

      await saveManual("personality", personalityText);
      setLoadedPersonality(personalityText);
      if (greetingTrimmed) {
        await saveManual("directive", `Opening greeting: ${greetingTrimmed}`);
      }
      if (knowledgeTrimmed) {
        const knowledgeResponse = await authFetch("/api/train/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, message: knowledgeTrimmed }),
        });
        if (!knowledgeResponse.ok) {
          throw new Error(
            isBusinessAgent
              ? "Business information could not be saved."
              : "Personal preferences could not be saved.",
          );
        }
        setSetupKnowledge("");
      }

      setSetupNotice(
        isBusinessAgent
          ? "Changes saved. Run a customer test before connecting live traffic."
          : "Changes saved. Run a private test before connecting a live line.",
      );
    } catch (reason) {
      setSetupError(reason instanceof Error ? reason.message : "Setup could not be saved.");
    } finally {
      setApplyingSetup(false);
    }
  }

  return (
    <div className={`min-h-0 flex-1 overflow-y-auto bg-background ${className}`}>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <header>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            Set up
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Give {agentName} one clear job.
          </h2>
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
              Essentials
            </h3>
          </div>

          {loadingSetup ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading setup…
            </div>
          ) : (
            <div className="space-y-5">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Tone</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PERSONALITIES.map((option) => {
                    const selected = setupPersonality === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSetupPersonality(option.id)}
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
                          {option.id}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {option.description}
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
                    {isBusinessAgent ? "Essential business facts" : "Essential personal facts"}
                    <span className="ml-2 font-normal text-muted-foreground">Optional</span>
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
                  placeholder={
                    isBusinessAgent
                      ? "Hours, services, pricing, policies, FAQs, and when to hand off to a person…"
                      : "Preferences, hard rules, calendar constraints, and when to text or interrupt you…"
                  }
                />
              </div>

              {setupNotice ? (
                <StatusNotice tone="success" title="Changes saved">
                  {setupNotice}
                </StatusNotice>
              ) : null}
              {setupError ? (
                <StatusNotice tone="destructive" title="Changes not saved">
                  {setupError}
                </StatusNotice>
              ) : null}

              <Button type="button" onClick={() => void applySetup()} disabled={applyingSetup}>
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

        <section
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          aria-labelledby="voice-heading"
        >
          <div className="mb-3">
            <h3 id="voice-heading" className="text-lg font-semibold tracking-tight text-foreground">
              Phone voice
            </h3>
          </div>
          <SimpleVoicePicker agentId={agentId} agentName={agentName} onTest={onTestVoiceInChat} />
        </section>

        <section
          className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6"
          aria-label="Continue setup"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {isBusinessAgent ? "Test before going live" : "Test before connecting a line"}
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                {isBusinessAgent
                  ? "Run one realistic customer test before connecting live channels."
                  : "Run one private conversation test before connecting a live number."}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={onTestVoiceInChat}
                className="justify-center"
              >
                Test conversation
              </Button>
              <Button asChild className="justify-center">
                <Link to="/connections">
                  <PlugZap className="size-4" aria-hidden="true" />
                  Connect channels
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
