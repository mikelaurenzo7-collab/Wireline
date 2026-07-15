import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, Loader2, PlugZap, Save } from "lucide-react";
import { Link } from "react-router-dom";

import { authFetch } from "../lib/api";
import { formatAgentRoleLabel } from "../lib/product-copy";
import AgentPresenceLivePreview from "./AgentPresenceLivePreview";
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
  agentRole?: string | null;
  isBusinessAgent?: boolean;
  onTestVoiceInChat: () => void;
  className?: string;
};

type AgentSetupResponse = {
  role?: string | null;
  job?: string | null;
  firstMessage?: string | null;
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
  agentRole = null,
  isBusinessAgent = false,
  onTestVoiceInChat,
  className = "",
}: StudioAgentWorkspacePanelProps) {
  const defaultGreeting = useMemo(
    () => `Hello, this is ${agentName || "your AI employee"}. How can I help?`,
    [agentName],
  );
  const [setupPersonality, setSetupPersonality] = useState("Clear");
  const [setupJob, setSetupJob] = useState(formatAgentRoleLabel(agentRole));
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
        setSetupJob(data.job?.trim() || formatAgentRoleLabel(data.role ?? agentRole));
        setSetupPersonality(inferPersonality(data.personality));
        setSetupGreeting(
          data.firstMessage?.trim() || existingGreeting(data.directives) || defaultGreeting,
        );
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
  }, [agentId, agentRole, defaultGreeting]);

  async function applySetup(continueToTest = false) {
    if (!agentId || applyingSetup) return;
    setApplyingSetup(true);
    setSetupError(null);
    setSetupNotice(null);
    try {
      const jobTrimmed = setupJob.trim();
      const personalityText = `${setupPersonality}. Concise, useful, and business-ready.`;
      const greetingTrimmed = setupGreeting.trim();
      const knowledgeTrimmed = setupKnowledge.trim();

      if (!jobTrimmed) throw new Error("Add the one customer-facing job this employee owns.");
      if (!greetingTrimmed) throw new Error("Add the greeting customers should hear first.");

      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/essentials`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job: jobTrimmed,
            personality: personalityText,
            greeting: greetingTrimmed,
            knowledge: knowledgeTrimmed || undefined,
          }),
        },
      );
      if (!response.ok) {
        throw new Error("Essentials could not be saved together. Nothing changed.");
      }
      if (knowledgeTrimmed) setSetupKnowledge("");

      setSetupNotice("Changes saved. Run a customer test before connecting live traffic.");
      if (continueToTest) onTestVoiceInChat();
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
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Set the tone, greeting, essential facts, and phone voice. Test before adding more tools.
          </p>
        </header>

        <section
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          aria-labelledby="essentials-heading"
        >
          <div className="mb-5">
            <h3
              id="essentials-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Essentials
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Customers should understand who answered, what this employee can do, and when a person
              takes over.
            </p>
          </div>

          {loadingSetup ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading setup…
            </div>
          ) : (
            <div className="space-y-5">
              <label className="grid gap-2" htmlFor="setup-job">
                <span className="text-sm font-semibold text-foreground">Customer-facing job</span>
                <textarea
                  id="setup-job"
                  value={setupJob}
                  onChange={(event) => setSetupJob(event.target.value)}
                  rows={2}
                  className="min-h-[72px] w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:border-primary/50"
                  placeholder="Receptionist who answers missed calls and books appointments"
                  maxLength={160}
                />
                <span className="text-xs text-muted-foreground">
                  Keep it concrete. One employee should own one clear customer outcome.
                </span>
              </label>

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
                <input
                  id="setup-greeting"
                  value={setupGreeting}
                  onChange={(event) => setSetupGreeting(event.target.value)}
                  maxLength={500}
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50"
                />
                {setupGreeting.length >= 400 ? (
                  <span className="text-right text-xs text-muted-foreground">
                    {setupGreeting.length} / 500
                  </span>
                ) : null}
              </label>

              <label className="grid gap-2" htmlFor="setup-knowledge">
                <span className="text-sm font-semibold text-foreground">
                  Essential business facts
                  <span className="ml-2 font-normal text-muted-foreground">Optional</span>
                </span>
                <textarea
                  id="setup-knowledge"
                  value={setupKnowledge}
                  onChange={(event) => setSetupKnowledge(event.target.value)}
                  maxLength={4000}
                  className="min-h-28 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary/50"
                  placeholder="Hours, services, pricing, policies, FAQs, and when to hand off to a person…"
                />
                <span className="text-xs text-muted-foreground">
                  Add only what the first customer workflow needs. More knowledge can come later.{" "}
                  <Link
                    to={`/knowledge?agent=${encodeURIComponent(agentId)}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    Manage full knowledge
                  </Link>
                </span>
                {setupKnowledge.length >= 3200 ? (
                  <span className="text-right text-xs text-muted-foreground">
                    {setupKnowledge.length.toLocaleString()} / 4,000
                  </span>
                ) : null}
              </label>

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

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void applySetup()}
                  disabled={applyingSetup}
                  className="justify-center"
                >
                  {applyingSetup ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="size-4" aria-hidden="true" />
                  )}
                  {applyingSetup ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void applySetup(true)}
                  disabled={applyingSetup}
                  className="justify-center"
                >
                  Save and test
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </section>

        <section
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          aria-labelledby="voice-heading"
        >
          <div className="mb-5">
            <h3 id="voice-heading" className="text-lg font-semibold tracking-tight text-foreground">
              Phone voice
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Preview the exact phone voice here, then place one real call for the final end-to-end
              check.
            </p>
          </div>
          <SimpleVoicePicker agentId={agentId} agentName={agentName} onTest={onTestVoiceInChat} />
        </section>

        <section
          className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6"
          aria-label="Continue setup"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Test before going live</h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                Try a realistic customer question. Connect phone, text, email, calendar, or CRM only
                after the response feels right.
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

        <details
          id="advanced-employee-options"
          className="group rounded-2xl border border-border bg-card"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-foreground sm:px-6">
            Advanced options
            <ChevronDown
              className="size-4 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="space-y-6 border-t border-border px-5 py-5 sm:px-6">
            <div>
              <h3 className="text-base font-semibold text-foreground">On-screen appearance</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Optional. Calls, text, and email work without a video presenter.
              </p>
              <div className="mt-4">
                <AgentPresenceLivePreview
                  agentId={agentId}
                  name={agentName}
                  role={agentRole}
                  isBusinessAgent={isBusinessAgent}
                />
              </div>
            </div>
            <div className="border-t border-border pt-6">
              <h3 className="text-base font-semibold text-foreground">
                Specialized voice providers
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Built-in phone voices are the dependable default. Open the full library only when a
                customer workflow needs a custom or external voice.
              </p>
              <Button asChild variant="secondary" className="mt-4">
                <Link to={`/knowledge?agent=${encodeURIComponent(agentId)}&tab=voice`}>
                  Open advanced voice library
                </Link>
              </Button>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
