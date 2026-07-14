import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, Loader2, PlugZap, Save } from "lucide-react";
import { Link } from "react-router-dom";

import { authFetch } from "../lib/api";
import AgentPresenceLivePreview from "./AgentPresenceLivePreview";
import { StatusNotice } from "./molecules";
import SimpleVoicePicker from "./voice/SimpleVoicePicker";
import VoiceGallery from "./voice/VoiceGallery";

const PERSONALITIES = [
  { id: "Clear", description: "Direct, concise, and easy to understand" },
  { id: "Warm", description: "Friendly, patient, and conversational" },
  { id: "Polished", description: "Professional, measured, and precise" },
  { id: "Energetic", description: "Upbeat, proactive, and enthusiastic" },
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
  personality?: string;
  directives?: Array<{ content?: string }>;
  knowledge?: Array<{ content?: string }>;
};

function inferPersonality(value: string | undefined) {
  const normalized = value?.toLowerCase() ?? "";
  return PERSONALITIES.find((option) => normalized.includes(option.id.toLowerCase()))?.id ?? "Clear";
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
        setSetupPersonality(inferPersonality(data.personality));
        setSetupGreeting(existingGreeting(data.directives) || defaultGreeting);
      })
      .catch((reason) => {
        if (!cancelled) {
          setSetupGreeting(defaultGreeting);
          setSetupError(reason instanceof Error ? reason.message : "Current setup could not be loaded.");
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
      const personalityText = `${setupPersonality}. Concise, useful, and business-ready.`;
      const greetingTrimmed = setupGreeting.trim();
      const knowledgeTrimmed = setupKnowledge.trim();

      await saveManual("personality", personalityText);
      if (greetingTrimmed) {
        await saveManual("directive", `Opening greeting: ${greetingTrimmed}`);
      }
      if (knowledgeTrimmed) {
        const knowledgeResponse = await authFetch("/api/train/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, message: knowledgeTrimmed }),
        });
        if (!knowledgeResponse.ok) throw new Error("Business information could not be saved.");
        setSetupKnowledge("");
      }

      setSetupNotice("Basics saved. Next, choose a voice and run a test call.");
    } catch (reason) {
      setSetupError(reason instanceof Error ? reason.message : "Setup could not be saved.");
    } finally {
      setApplyingSetup(false);
    }
  }

  return (
    <div className={`min-h-0 flex-1 overflow-y-auto bg-background ${className}`}>
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            Employee setup
          </p>
          <h2 className="font-[var(--wireline-font-family-display)] text-3xl font-normal tracking-[-0.03em] text-foreground">
            Get {agentName} ready to work
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Set the basics, choose a dependable phone voice, test the experience, then connect the
            channels this employee should handle.
          </p>
        </header>

        <section
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          aria-labelledby="basics-heading"
        >
          <div className="mb-5 flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              1
            </span>
            <div>
              <h3 id="basics-heading" className="text-lg font-semibold tracking-tight">
                Define the basics
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Keep this simple. You can refine behavior through normal conversation later.
              </p>
            </div>
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
                <input
                  id="setup-greeting"
                  value={setupGreeting}
                  onChange={(event) => setSetupGreeting(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50"
                />
              </label>

              <label className="grid gap-2" htmlFor="setup-knowledge">
                <span className="text-sm font-semibold text-foreground">
                  Add essential business information
                  <span className="ml-2 font-normal text-muted-foreground">Optional</span>
                </span>
                <textarea
                  id="setup-knowledge"
                  value={setupKnowledge}
                  onChange={(event) => setSetupKnowledge(event.target.value)}
                  className="min-h-28 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary/50"
                  placeholder="Hours, services, pricing, policies, FAQs, and when to hand off to a person…"
                />
                <span className="text-xs text-muted-foreground">
                  Paste plain language. Wireline extracts the useful facts and operating rules.
                </span>
              </label>

              {setupNotice ? (
                <StatusNotice tone="success" title="Setup saved">
                  {setupNotice}
                </StatusNotice>
              ) : null}
              {setupError ? (
                <StatusNotice tone="destructive" title="Setup not saved">
                  {setupError}
                </StatusNotice>
              ) : null}

              <button
                type="button"
                onClick={() => void applySetup()}
                disabled={applyingSetup}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.985] disabled:cursor-wait disabled:opacity-60"
              >
                {applyingSetup ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="size-4" aria-hidden="true" />
                )}
                {applyingSetup ? "Saving…" : "Save basics"}
              </button>
            </div>
          )}
        </section>

        <section
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          aria-labelledby="voice-heading"
        >
          <div className="mb-5 flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              2
            </span>
            <div>
              <h3 id="voice-heading" className="text-lg font-semibold tracking-tight">
                Choose a voice and test it
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Use the built-in phone voices first. External voice providers remain optional.
              </p>
            </div>
          </div>
          <SimpleVoicePicker agentId={agentId} agentName={agentName} onTest={onTestVoiceInChat} />
        </section>

        <section
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          aria-labelledby="connect-heading"
        >
          <div className="mb-5 flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              3
            </span>
            <div>
              <h3 id="connect-heading" className="text-lg font-semibold tracking-tight">
                Connect work channels
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Start with one channel. Add calls, text, email, calendars, and CRM access as needed.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { to: "/settings/phone", title: "Calls & text", detail: "Assign a number and routing" },
              { to: "/connections", title: "Email & calendar", detail: "Connect the tools you use" },
              { to: "/inbox", title: "Inbox", detail: "Review conversations and outcomes" },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group flex min-h-28 flex-col justify-between rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/35 hover:bg-primary/5"
              >
                <PlugZap className="size-5 text-primary" aria-hidden="true" />
                <span>
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                    {item.title}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <details
          id="advanced-employee-options"
          className="group rounded-2xl border border-border bg-card"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-foreground sm:px-6">
            Advanced appearance and voice options
            <ChevronDown
              className="size-4 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="space-y-6 border-t border-border px-5 py-5 sm:px-6">
            <div>
              <h3 className="text-base font-semibold">On-screen presence</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Optional. Phone, text, and email work without a video presenter.
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
              <h3 className="text-base font-semibold">External voice library</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Use this only after configuring an external provider and verifying its runtime key.
              </p>
              <div className="mt-4">
                <VoiceGallery
                  agentId={agentId}
                  agentName={agentName}
                  embedded
                  searchInputId="advanced-voice-search"
                />
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
