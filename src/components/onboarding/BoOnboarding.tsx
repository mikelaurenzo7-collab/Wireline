import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type Ref } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ExternalLink, Loader2, Send } from "lucide-react";

import { Button, Input, Textarea } from "../atoms";
import { StatusNotice } from "../molecules";
import BotMark from "../BotMark";
import { useAuth } from "../../contexts/AuthContext";
import { useAgents, type WorkspaceAgentSummary } from "../../contexts/AgentsContext";
import { useBranding } from "../../contexts/BrandingContext";
import { useChannelEntitlements } from "../../hooks/useChannelEntitlements";
import { authFetch, safeJson } from "../../lib/api";
import { isBotMarkKey } from "../../lib/bot-mark";
import { DEFAULT_BOT_NAME } from "../../lib/bot-name";
import { bootstrapManagedBotIdentity } from "../../lib/bot-identity-bootstrap";
import {
  BO_ANSWER_MAX_CHARS,
  BO_BUSINESS_MAX_CHARS,
  BO_BUSINESS_NAME_MAX_CHARS,
  boQuestionSteps,
  cleanBusinessName,
  clearBoOnboarding,
  isPersonalStarter,
  mergeCheckFirst,
  normalizeWebsiteUrl,
  readBoOnboarding,
  splitCheckFirst,
  writeBoOnboarding,
  type BoOnboardingStep,
} from "../../lib/bo-onboarding";
import { choosePlanHref, getStoredSignupIntent } from "../../lib/signup-intent";
import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";
import { setPostSignupFlowActive } from "../../lib/post-signup-onboarding";
import { isSignedInOwner } from "../../lib/signed-in-owner";
import {
  extractionBodyPersistedSomething,
  type TrainingExtractionBody,
} from "../../lib/training-extraction-result";
import { BO_ONBOARDING_COPY as COPY } from "../../lib/wireline-onboarding-copy";

type Source = { title?: string; uri?: string };
type Line = { id: number; from: "bo" | "owner"; text: string; sources?: Source[] };
/** The website step has three moments: ask for the link, offer a lookup, confirm it. */
type WebsitePhase = "link" | "lookupOffer" | "lookupConfirm";

function nextStep(step: BoOnboardingStep, steps: readonly BoOnboardingStep[]): BoOnboardingStep {
  const index = steps.indexOf(step);
  return index >= 0 && index < steps.length - 1 ? steps[index + 1]! : "done";
}

function sourceLabel(source: Source): string {
  if (source.title?.trim()) return source.title.trim();
  try {
    return new URL(source.uri || "").hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function errorText(body: unknown, fallback: string): string {
  const message =
    body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
}

/**
 * Bo's first conversation. Every account has one Bot, Bo, and an account that
 * opens the Workspace without one meets Bo here: Bo is created first (the
 * server returns the existing Bot instead when another tab got there first),
 * asks for the business name when the workspace has none (saved to the
 * company profile, because callers hear it when Bo answers), then four
 * questions whose answers go to Knowledge, and ends on what to do next. It
 * replaces the old template picker, the create dialog, the empty "Create Your
 * Bot" screen and the post-create setup guide.
 */
export default function BoOnboarding({ initialAbout = "" }: { initialAbout?: string }) {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const { agents, loading, degraded, rememberCreatedAgent, refresh } = useAgents();
  const { branding, updateBranding } = useBranding();
  const access = useChannelEntitlements();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // A stored conversation continues only for a Bot the account still has; a
  // deleted Bo starts the conversation again with a new one.
  const stored = useMemo(() => {
    const state = readBoOnboarding(userId);
    return state && agents.some((agent) => agent.id === state.agentId) ? state : null;
    // Read once per account: the roster is loaded before this view mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  // A personal assistant has no business to name. A conversation that
  // continues keeps the Bot it already made; a new one follows the link.
  const [personal] = useState(() =>
    stored
      ? agents.find((agent) => agent.id === stored.agentId)?.is_business_agent === false
      : isPersonalStarter(params.get("template"), getStoredSignupIntent()?.preferredTemplateId),
  );
  // Decided once, so the step count does not change under the owner.
  const [asksName] = useState(
    () => stored?.asksName ?? (!stored && !personal && !branding.business_name.trim()),
  );
  const steps = useMemo(() => boQuestionSteps(asksName), [asksName]);
  const [agentId, setAgentId] = useState(stored?.agentId ?? "");
  const [step, setStep] = useState<BoOnboardingStep>(stored?.step ?? steps[0]!);
  const [business, setBusiness] = useState(stored?.business ?? "");
  // What the business is called: typed here, or already on the company profile.
  const [businessName, setBusinessName] = useState(() => branding.business_name.trim());
  const bot = agents.find((agent) => agent.id === agentId);
  const botName = bot?.name || DEFAULT_BOT_NAME;
  const [websitePhase, setWebsitePhase] = useState<WebsitePhase>("link");
  const [lookup, setLookup] = useState<{ answer: string; sources: Source[] } | null>(null);
  const [lines, setLines] = useState<Line[]>(() => [
    { id: 0, from: "bo", text: questionFor(stored?.step ?? steps[0]!) },
  ]);
  const [draft, setDraft] = useState(stored ? "" : initialAbout.slice(0, BO_ANSWER_MAX_CHARS));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createFailed, setCreateFailed] = useState(false);
  const lineId = useRef(1);
  const mounted = useRef(true);
  const creating = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const transcriptRef = useRef<HTMLElement | null>(null);
  const stepNumber = steps.indexOf(step) + 1;

  function questionFor(at: BoOnboardingStep, knownName = businessName): string {
    const ask =
      at === "name"
        ? COPY.name.question
        : at === "about"
          ? knownName
            ? COPY.about.followUp(knownName)
            : COPY.about.question
          : at === "website"
            ? COPY.website.question
            : at === "questions"
              ? COPY.questions.question
              : at === "checks"
                ? COPY.checks.question
                : COPY.done.message;
    // The first question is where Bo introduces itself.
    return at === steps[0] ? `${COPY.intro(botName)} ${ask}` : ask;
  }

  // The profile can finish loading after the conversation opened.
  useEffect(() => {
    const saved = branding.business_name.trim();
    if (!saved) return;
    setBusinessName((current) => current || saved);
    if (step === "name") setDraft((current) => current || saved);
  }, [branding.business_name, step]);

  useEffect(() => {
    mounted.current = true;
    setPostSignupFlowActive(true);
    return () => {
      mounted.current = false;
    };
  }, []);

  const current = useCallback(() => mounted.current && isSignedInOwner(userId), [userId]);

  const say = useCallback((from: Line["from"], text: string, sources?: Source[]) => {
    const id = lineId.current++;
    setLines((existing) => [...existing, { id, from, text, ...(sources ? { sources } : {}) }]);
    return id;
  }, []);
  const unsay = useCallback((id: number) => {
    setLines((existing) => existing.filter((line) => line.id !== id));
  }, []);

  const createBo = useCallback(async () => {
    if (!userId || creating.current) return;
    creating.current = true;
    setCreateFailed(false);
    try {
      const response = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: DEFAULT_BOT_NAME,
          only_if_none: true,
          is_business_agent: !personal,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const body = (await safeJson(response)) as {
        id?: unknown;
        name?: unknown;
        mark_key?: unknown;
        channel?: WorkspaceAgentSummary["channel"];
        is_business_agent?: unknown;
        created?: unknown;
      } | null;
      if (!current()) return;
      if (!response.ok || typeof body?.id !== "string" || !body.id) throw new Error();
      const id = body.id;
      // Stored before the roster learns about Bo, so the Workspace keeps
      // showing this conversation instead of an empty chat.
      writeBoOnboarding(userId, { agentId: id, step: steps[0]!, asksName });
      setAgentId(id);
      rememberCreatedAgent({
        id,
        name: typeof body.name === "string" && body.name ? body.name : DEFAULT_BOT_NAME,
        mark_key: isBotMarkKey(body.mark_key) ? body.mark_key : null,
        channel: body.channel ?? "voice",
        is_business_agent:
          typeof body.is_business_agent === "boolean" ? body.is_business_agent : !personal,
      });
      if (body.created === true) {
        emitProductEvent({
          event: "agent_created",
          agentId: id,
          metadata: { source: "bo_onboarding", workspace_model: "one_workspace", object: "bot" },
        });
        // One responsive attempt at Bo's managed number and mailbox; the
        // server job owns retries and the paid activation they wait on.
        void bootstrapManagedBotIdentity(id).then(() => {
          if (mounted.current) refresh();
        });
      }
    } catch {
      if (mounted.current) setCreateFailed(true);
    } finally {
      creating.current = false;
    }
  }, [asksName, current, personal, refresh, rememberCreatedAgent, steps, userId]);

  useEffect(() => {
    if (!userId || loading || degraded || agentId) return;
    // Another tab may have met Bo already; continue with that Bot.
    const existing = agents[0];
    if (existing) {
      writeBoOnboarding(userId, { agentId: existing.id, step, asksName });
      setAgentId(existing.id);
      return;
    }
    void createBo();
  }, [agentId, agents, asksName, createBo, degraded, loading, step, userId]);

  useEffect(() => {
    const node = transcriptRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines, busy]);

  useEffect(() => {
    if (!busy) composerRef.current?.focus({ preventScroll: true });
  }, [busy, step, websitePhase]);

  function advance(from: BoOnboardingStep, keepBusiness = business, knownName = businessName) {
    const to = nextStep(from, steps);
    emitProductEvent({
      event: "post_create_wizard_step_completed",
      agentId,
      metadata: { step: from, source: "bo_onboarding" },
    });
    setStep(to);
    setWebsitePhase("link");
    setLookup(null);
    setDraft("");
    setError(null);
    writeBoOnboarding(userId, {
      agentId,
      step: to,
      asksName,
      ...(keepBusiness ? { business: keepBusiness } : {}),
    });
    say("bo", questionFor(to, knownName));
  }

  /** Save the owner's words to Knowledge through the training extractor. */
  async function teach(message: string, source: string): Promise<string | null> {
    const response = await authFetch("/api/train/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, message }),
    });
    const body = (await safeJson(response)) as
      (TrainingExtractionBody & { error?: unknown }) | null;
    // A reply that lands after sign-out must not report milestones under the
    // next session's cookie.
    if (!current()) return null;
    if (!response.ok) throw new Error(errorText(body, "That could not be saved. Try again."));
    if (!extractionBodyPersistedSomething(body)) return null;
    if (body?.alreadySaved !== true) {
      emitProductEvent({ event: "training_asset_added", agentId, metadata: { source } });
      emitProductEventOnce({
        event: "launch_readiness_reached",
        agentId,
        metadata: { source: "bo_onboarding", has_training: true },
      });
    }
    return typeof body?.responseContent === "string" && body.responseContent.trim()
      ? body.responseContent.trim()
      : "Saved to Knowledge.";
  }

  async function run(label: string, work: () => Promise<void>) {
    if (busy || !agentId) return;
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (reason) {
      if (current()) setError(reason instanceof Error ? reason.message : "Something went wrong.");
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  function submitAnswer(event?: FormEvent) {
    event?.preventDefault();
    const answer = draft.trim();
    if (!answer) return;
    if (step === "website") {
      readWebsite(answer);
      return;
    }
    if (step === "name") {
      saveBusinessName(answer);
      return;
    }
    const sent = say("owner", answer);
    void run(COPY.saving, async () => {
      try {
        if (step === "checks") {
          await saveChecks(answer);
          if (!current()) return;
          say("bo", COPY.checks.saved);
          advance("checks");
          return;
        }
        const prefix =
          step === "about"
            ? `${businessName ? `Business name: ${businessName}.\n` : ""}About my business: `
            : "What customers ask, with my answers: ";
        const reply = await teach(
          `${prefix}${answer}`,
          step === "about" ? "onboarding_about" : "onboarding_questions",
        );
        if (!current()) return;
        if (!reply) {
          unsay(sent);
          if (step === "about") say("bo", COPY.about.unclear);
          else
            setError("Nothing specific was saved. Try short facts, like “Service calls are $89.”");
          return;
        }
        say("bo", `Got it. ${reply}`);
        if (step === "about") {
          const description = answer.slice(0, BO_BUSINESS_MAX_CHARS);
          setBusiness(description);
          advance("about", description);
        } else {
          advance(step);
        }
      } catch (reason) {
        unsay(sent);
        throw reason;
      }
    });
  }

  /** The company profile is the one place the business name lives. */
  function saveBusinessName(raw: string) {
    const name = cleanBusinessName(raw);
    if (!name) return;
    say("owner", name);
    void run(COPY.saving, async () => {
      let saved = false;
      try {
        const response = await authFetch("/api/company-identity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ business_name: name }),
        });
        saved = response.ok;
      } catch {
        saved = false;
      }
      if (!current()) return;
      if (saved) updateBranding({ business_name: name });
      setBusinessName(name);
      say("bo", saved ? COPY.name.saved(name) : COPY.name.notSaved);
      advance("name", business, name);
    });
  }

  async function saveChecks(answer: string) {
    const items = splitCheckFirst(answer);
    if (!items.length) throw new Error("Write one thing per line, like “Discounts or refunds.”");
    // The Playbook saves whole: start from what is stored so nothing is lost.
    const configResponse = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`);
    const config = (await safeJson(configResponse)) as {
      playbook?: Record<string, unknown> & { checkFirst?: unknown };
    } | null;
    if (!configResponse.ok || !config?.playbook)
      throw new Error("Your settings could not load. Try again.");
    const saved = Array.isArray(config.playbook.checkFirst)
      ? config.playbook.checkFirst.filter((item): item is string => typeof item === "string")
      : [];
    const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/playbook`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playbook: { ...config.playbook, checkFirst: mergeCheckFirst(saved, items) },
      }),
    });
    if (!response.ok)
      throw new Error(errorText(await safeJson(response), "That could not be saved. Try again."));
  }

  function readWebsite(raw: string) {
    const url = normalizeWebsiteUrl(raw);
    if (!url) {
      setError(COPY.website.invalid);
      return;
    }
    const sent = say("owner", url.replace(/^https:\/\//, "").replace(/\/$/, ""));
    void run(COPY.website.reading, async () => {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/website`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = (await safeJson(response)) as { summary?: unknown; error?: unknown } | null;
      if (!current()) return;
      if (!response.ok) {
        unsay(sent);
        throw new Error(errorText(body, "I couldn't read that page. Try another address or skip."));
      }
      emitProductEvent({
        event: "training_asset_added",
        agentId,
        metadata: { source: "onboarding_website" },
      });
      say(
        "bo",
        typeof body?.summary === "string" && body.summary.trim()
          ? body.summary.trim()
          : "I read your website.",
      );
      advance("website");
    });
  }

  function noWebsite() {
    say("owner", COPY.website.none);
    if (!business && !businessName) {
      // Without a description to search for, a lookup cannot find the right business.
      say("bo", COPY.skipped);
      advance("website");
      return;
    }
    say("bo", COPY.website.lookupOffer);
    setWebsitePhase("lookupOffer");
    setError(null);
  }

  function lookUp() {
    say("owner", COPY.website.lookUp);
    void run(COPY.website.lookingUp, async () => {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/web-lookup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            business: [businessName, business]
              .filter(Boolean)
              .join(". ")
              .slice(0, BO_BUSINESS_MAX_CHARS),
          }),
        },
      );
      const body = (await safeJson(response)) as {
        found?: unknown;
        answer?: unknown;
        sources?: unknown;
        error?: unknown;
      } | null;
      if (!current()) return;
      if (!response.ok) throw new Error(errorText(body, COPY.website.notFound));
      const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
      if (body?.found !== true || !answer) {
        say("bo", COPY.website.notFound);
        advance("website");
        return;
      }
      const sources = Array.isArray(body.sources)
        ? (body.sources as Source[]).filter((source) => typeof source?.uri === "string").slice(0, 5)
        : [];
      setLookup({ answer, sources });
      say("bo", `${COPY.website.found}\n\n${answer}`, sources);
      say("bo", COPY.website.confirm);
      setWebsitePhase("lookupConfirm");
    });
  }

  function confirmLookup(yes: boolean) {
    say("owner", yes ? COPY.website.yes : COPY.website.no);
    if (!yes || !lookup) {
      say("bo", COPY.website.declined);
      advance("website");
      return;
    }
    void run(COPY.saving, async () => {
      const reply = await teach(
        `From a web search I confirmed is my business: ${lookup.answer}`,
        "onboarding_web_lookup",
      );
      if (!current()) return;
      say("bo", reply ? `Got it. ${reply}` : COPY.skipped);
      advance("website");
    });
  }

  function skip() {
    say("owner", COPY.skip);
    say("bo", step === "name" ? COPY.name.skipped : COPY.skipped);
    advance(step);
  }

  function finish(destination: string) {
    clearBoOnboarding(userId);
    setPostSignupFlowActive(false);
    navigate(destination);
  }

  const id = encodeURIComponent(agentId);
  const numberHref = access.includes("voice") ? `/phone?tab=lines&agent=${id}` : choosePlanHref();
  const ready = Boolean(agentId) && !createFailed;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
      data-bo-onboarding={step}
    >
      <header className="wl-studio-context shrink-0">
        <div className="mx-auto flex min-h-[56px] w-full max-w-3xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <BotMark seed={agentId || "bo"} name={botName} markKey={bot?.mark_key} size={30} />
            <div className="min-w-0">
              <h1 className="wl-preserve-case truncate text-base font-semibold text-foreground">
                {botName}
              </h1>
              {stepNumber > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {COPY.stepLabel(stepNumber, steps.length)}
                </p>
              ) : null}
            </div>
          </div>
          {ready && step !== "done" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              onClick={() => finish(`/studio?agent=${id}`)}
            >
              {COPY.finishLater}
            </Button>
          ) : null}
        </div>
      </header>

      <section
        ref={transcriptRef}
        role="log"
        aria-live="polite"
        aria-label={`Conversation with ${botName}`}
        className="wl-studio-chat__transcript min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-5 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {lines.map((line) =>
            line.from === "owner" ? (
              <article key={line.id} className="wl-studio-message is-owner ml-auto max-w-[84%]">
                <div className="wl-studio-message__body">
                  <p className="whitespace-pre-wrap break-words">{line.text}</p>
                </div>
              </article>
            ) : (
              <article
                key={line.id}
                className="wl-studio-message is-bot w-full"
                aria-label={`${botName} says`}
              >
                <div className="min-w-0">
                  <div className="wl-studio-message__body">
                    <p className="whitespace-pre-wrap break-words">{line.text}</p>
                    {line.sources?.length ? (
                      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {line.sources.map((source) => (
                          <li key={source.uri}>
                            <a
                              href={source.uri}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                            >
                              {sourceLabel(source)}
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </article>
            ),
          )}
          {busy || (!agentId && !createFailed) ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <BotMark seed={agentId || "bo"} name={botName} size={20} working decorative />
              {busy || COPY.gettingReady}
            </p>
          ) : null}
        </div>
      </section>

      <div className="wl-studio-chat__footer shrink-0 border-t border-border bg-background">
        <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          {createFailed ? (
            <StatusNotice
              tone="destructive"
              title="Bo Isn't Ready Yet"
              action={
                <Button type="button" size="sm" variant="secondary" onClick={() => void createBo()}>
                  {COPY.tryAgain}
                </Button>
              }
            >
              BotBound could not set Bo up just now. Nothing was billed.
            </StatusNotice>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {step === "done" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" onClick={() => finish(`/studio?agent=${id}&workroom=test`)}>
                {COPY.done.hear}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => finish(`/studio?agent=${id}&section=setup#voice`)}
              >
                {COPY.done.voice}
              </Button>
              <Button type="button" variant="secondary" onClick={() => finish(numberHref)}>
                {COPY.done.number}
              </Button>
              <Button type="button" variant="ghost" onClick={() => finish(`/studio?agent=${id}`)}>
                {COPY.done.chat}
              </Button>
            </div>
          ) : step === "website" && websitePhase === "lookupOffer" ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!ready || Boolean(busy)} onClick={lookUp}>
                {COPY.website.lookUp}
              </Button>
              <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={skip}>
                {COPY.skip}
              </Button>
            </div>
          ) : step === "website" && websitePhase === "lookupConfirm" ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={Boolean(busy)} onClick={() => confirmLookup(true)}>
                {COPY.website.yes}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(busy)}
                onClick={() => confirmLookup(false)}
              >
                {COPY.website.no}
              </Button>
            </div>
          ) : (
            <form onSubmit={submitAnswer} className="space-y-2">
              {step === "name" ? (
                <>
                  <label htmlFor="bo-onboarding-name" className="sr-only">
                    Your business name
                  </label>
                  <Input
                    id="bo-onboarding-name"
                    ref={composerRef as Ref<HTMLInputElement>}
                    autoComplete="organization"
                    value={draft}
                    maxLength={BO_BUSINESS_NAME_MAX_CHARS}
                    disabled={!ready || Boolean(busy)}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={COPY.name.placeholder}
                  />
                </>
              ) : step === "website" ? (
                <>
                  <label htmlFor="bo-onboarding-website" className="sr-only">
                    Website address
                  </label>
                  <Input
                    id="bo-onboarding-website"
                    ref={composerRef as Ref<HTMLInputElement>}
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    value={draft}
                    maxLength={2048}
                    disabled={!ready || Boolean(busy)}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={COPY.website.placeholder}
                  />
                </>
              ) : (
                <>
                  <label htmlFor="bo-onboarding-answer" className="sr-only">
                    Your answer to {botName}
                  </label>
                  <Textarea
                    id="bo-onboarding-answer"
                    ref={composerRef as Ref<HTMLTextAreaElement>}
                    value={draft}
                    maxLength={BO_ANSWER_MAX_CHARS}
                    disabled={!ready || Boolean(busy)}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        submitAnswer();
                      }
                    }}
                    placeholder={
                      step === "about"
                        ? COPY.about.placeholder
                        : step === "questions"
                          ? COPY.questions.placeholder
                          : COPY.checks.placeholder
                    }
                    className="min-h-[88px] text-base"
                    resize="vertical"
                  />
                </>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {step === "website" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!ready || Boolean(busy)}
                    onClick={noWebsite}
                  >
                    {COPY.website.none}
                  </Button>
                ) : step !== "about" ? (
                  <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={skip}>
                    {COPY.skip}
                  </Button>
                ) : null}
                <Button type="submit" disabled={!ready || Boolean(busy) || !draft.trim()}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="size-4" aria-hidden="true" />
                  )}
                  {step === "website" ? COPY.website.read : COPY.send}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
