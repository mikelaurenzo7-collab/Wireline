/**
 * Live Video studio — the consumption surface for the paid Live Video add-on.
 *
 * `billingEntitled` is the authority for paid access. The page keeps Wireline's
 * own OpenAI Realtime agent as the conversation runtime and feeds its 24 kHz PCM
 * output into LiveAvatar LITE for lip sync, so video never becomes a second,
 * provider-owned agent brain.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Loader2, Mic2, Play, Square, Video } from "lucide-react";

import AgentFace from "../components/AgentFace";
import AgentPresenceAvatarPicker, {
  type PresenterCatalogSelection,
} from "../components/AgentPresenceAvatarPicker";
import type { LiveVideoPresenterHandle } from "../components/LiveVideoPresenter";
import OpenAILiveVoiceSandbox from "../components/OpenAILiveVoiceSandbox";
import WorkspaceShell from "../components/WorkspaceShell";
import WorkspaceRecovery from "../components/WorkspaceRecovery";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import { Checkbox } from "../components/ui/shadcn/Checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/shadcn/Select";
import { useAgents } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";
import { liveVideoAddonPitch, liveVideoMeteringNote } from "../lib/video-presenter/copy";
import { isLiveVideoProvider } from "../lib/video-presenter/live-video-providers";
import { sessionExpectsWirelineAudio } from "../lib/video-presenter/types";
import { CUSTOMER_AGENT_LANGUAGE } from "../lib/product-copy";
import type {
  AgentVideoPresenterConfig,
  LiveAvatarSessionCredentials,
  LiveVideoAddonState,
} from "../lib/video-presenter/types";
import type {
  LiveVideoMode,
  LiveVideoVoiceEngine,
} from "../lib/video-presenter/live-video-session-policy";

type PlatformEngineOption = {
  id: LiveVideoVoiceEngine;
  mode: LiveVideoMode;
  label: string;
  description: string;
  creditsPerMinute: number;
  available: boolean;
};

type PresenterPayload = {
  presenter: AgentVideoPresenterConfig;
  fallbackSeed: string;
  platform: {
    configured: boolean;
    sandbox: boolean;
    defaultAvatarId?: string | null;
    allowedMode?: LiveVideoMode;
    engines?: PlatformEngineOption[];
  };
  addon: LiveVideoAddonState;
  hasVoice: boolean;
};

const DEFAULT_ENGINE: LiveVideoVoiceEngine = "wireline_realtime";

/**
 * The presenter pulls in @heygen/liveavatar-web-sdk (which carries its own
 * WebRTC stack), and it only ever renders once a session has been minted. Held
 * as a static import it was the largest single contributor to this route's
 * chunk and every visitor paid for it — including the ones who came to read the
 * add-on pitch, hit the entitlement gate, and never started anything.
 *
 * `warmPresenterBundle` runs at the top of startPreview so the chunk downloads
 * alongside the mint round trip rather than after it; by the time `session` is
 * set the module is normally already resolved and Suspense never shows.
 */
const LiveVideoPresenter = lazy(() => import("../components/LiveVideoPresenter"));

function warmPresenterBundle() {
  void import("../components/LiveVideoPresenter");
}

function PresenterLoadingStage() {
  return (
    <div
      className="grid aspect-video min-h-[240px] place-items-center rounded-2xl border border-border bg-background sm:min-h-[300px]"
      role="status"
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Preparing the live stage…
      </span>
    </div>
  );
}

type SessionUsage = {
  includedMinutes?: number;
  usedMinutes?: number;
  remainingMinutes?: number;
  sessionReservationMinutes?: number;
  exhausted?: boolean;
};

export default function LiveVideoStudioPage() {
  const { agents, loading: agentsLoading, degraded, refresh } = useAgents();
  const [params, setParams] = useSearchParams();
  const businessAgents = useMemo(() => agents.filter((agent) => agent.is_business_agent), [agents]);
  const requestedAgentId = params.get("agent");
  const activeAgentId =
    requestedAgentId && businessAgents.some((agent) => agent.id === requestedAgentId)
      ? requestedAgentId
      : (businessAgents[0]?.id ?? null);
  const activeAgent = businessAgents.find((agent) => agent.id === activeAgentId) ?? null;

  const [state, setState] = useState<PresenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [presenterReady, setPresenterReady] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<PresenterCatalogSelection | null>(null);
  const [voiceEngine, setVoiceEngine] = useState<LiveVideoVoiceEngine>(DEFAULT_ENGINE);
  const [session, setSession] = useState<{
    live: LiveAvatarSessionCredentials;
    fallbackSeed: string;
  } | null>(null);
  const [usage, setUsage] = useState<SessionUsage | null>(null);
  /** Seconds left in the open session, so the cap is never a surprise. */
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const presenterRef = useRef<LiveVideoPresenterHandle>(null);
  /** Guards the settle call so one session can only be settled once. */
  const settledReceiptsRef = useRef(new Set<string>());
  const sessionRef = useRef<{
    live: LiveAvatarSessionCredentials;
    fallbackSeed: string;
  } | null>(null);
  const agentIdRef = useRef<string | null>(null);
  sessionRef.current = session;
  agentIdRef.current = activeAgentId;

  const loadPresenter = useCallback(async () => {
    if (!activeAgentId) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [presenterResponse, usageResponse] = await Promise.all([
        authFetch(`/api/agents/${encodeURIComponent(activeAgentId)}/video-presenter`),
        authFetch("/api/video-presenter/usage").catch(() => null),
      ]);
      const body = (await presenterResponse.json().catch(() => null)) as PresenterPayload | null;
      if (!presenterResponse.ok || !body) {
        setError("Live video status is unavailable right now. Try again shortly.");
        setState(null);
        return;
      }
      setState(body);
      if (usageResponse?.ok) {
        const usageBody = (await usageResponse.json().catch(() => null)) as SessionUsage | null;
        if (usageBody) setUsage(usageBody);
      }
    } catch {
      setError("Live video status is unavailable right now. Try again shortly.");
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [activeAgentId]);

  useEffect(() => {
    setSession(null);
    setPresenterReady(false);
    setSelectedAvatar(null);
    setUsage(null);
    setNotice(null);
    setConsentAcknowledged(false);
    setVoiceEngine(DEFAULT_ENGINE);
    setSecondsLeft(null);
    void loadPresenter();
  }, [loadPresenter]);

  // Count the session cap down from the moment the presenter is actually on
  // screen. Anchored to a start timestamp rather than decremented per tick, so
  // a throttled background tab resumes with the true remaining time instead of
  // a clock that drifted slow while the provider kept running.
  useEffect(() => {
    const capSeconds = session?.live.maxSessionSeconds ?? 0;
    if (!session || !presenterReady || capSeconds <= 0) {
      setSecondsLeft(null);
      return;
    }
    const startedAt = Date.now();
    const tick = () => {
      const remaining = capSeconds - (Date.now() - startedAt) / 1000;
      setSecondsLeft(Math.max(0, remaining));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session, presenterReady]);

  async function startCheckout() {
    setCheckoutBusy(true);
    setError(null);
    try {
      const response = await authFetch("/api/billing/live-video-checkout", { method: "POST" });
      const body = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!response.ok || !body?.url) {
        setError(body?.error || "Live video checkout could not start. Try again shortly.");
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("Live video checkout could not start. Try again shortly.");
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function enableLiveVideo() {
    if (!activeAgentId || !consentAcknowledged) return;
    setEnabling(true);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(activeAgentId)}/video-presenter/enable`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consentAcknowledged: true }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        presenter?: AgentVideoPresenterConfig;
        error?: string;
      } | null;
      if (!response.ok || !body?.presenter) {
        setError(body?.error || "Live video could not be enabled. Try again shortly.");
        return;
      }
      setState((current) => (current ? { ...current, presenter: body.presenter! } : current));
      setNotice("Live video is on for this agent. Choose its presenter below.");
    } catch {
      setError("Live video could not be enabled. Try again shortly.");
    } finally {
      setEnabling(false);
    }
  }

  /**
   * Hand back the minutes this session reserved but did not use.
   *
   * The allowance is drawn in full when the token is minted, before the browser
   * has proven it can reach the provider. Settling on close is what stops a
   * blocked network from spending a whole month of Live Video on sessions that
   * never showed a frame. Best-effort by design: a failed settle leaves the
   * tenant exactly where the unsettled behavior already left them.
   */
  async function settleSession(
    live: LiveAvatarSessionCredentials,
    watchedSeconds: number,
    agentId: string | null,
  ) {
    const receipt = live.settlementReceipt;
    if (!receipt || !agentId) return;
    if (settledReceiptsRef.current.has(receipt)) return;
    settledReceiptsRef.current.add(receipt);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/video-presenter/session/settle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receipt,
            watchedSeconds: Math.max(0, Math.round(watchedSeconds)),
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        settled?: boolean;
        refundedMinutes?: number;
      } | null;
      // Refresh the allowance so the chip reflects the refund immediately
      // rather than showing a full session's worth spent until the next load.
      if (body?.settled && (body.refundedMinutes ?? 0) > 0) {
        await refreshUsage();
        setNotice(
          `Returned ${body.refundedMinutes} unused Live Video minute${
            body.refundedMinutes === 1 ? "" : "s"
          } to this month's allowance.`,
        );
      }
    } catch {
      // Settlement is an optimization on top of a reservation that already
      // succeeded; a network failure here must never surface as a session error.
    }
  }

  useEffect(() => {
    const settleOnHide = () => {
      const live = sessionRef.current?.live;
      const agentId = agentIdRef.current;
      const receipt = live?.settlementReceipt;
      if (!receipt || !agentId) return;
      if (settledReceiptsRef.current.has(receipt)) return;
      settledReceiptsRef.current.add(receipt);
      const watchedSeconds = Math.max(0, Math.round(presenterRef.current?.watchedSeconds() ?? 0));
      void fetch(`/api/agents/${encodeURIComponent(agentId)}/video-presenter/session/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt, watchedSeconds }),
        credentials: "include",
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", settleOnHide);
    return () => window.removeEventListener("pagehide", settleOnHide);
  }, []);

  async function refreshUsage() {
    try {
      const response = await authFetch("/api/video-presenter/usage");
      if (!response.ok) return;
      const body = (await response.json().catch(() => null)) as SessionUsage | null;
      if (body) setUsage(body);
    } catch {
      /* the chip keeps its last known value */
    }
  }

  async function endPreview() {
    const closing = session;
    const watched = presenterRef.current?.watchedSeconds() ?? 0;
    try {
      await presenterRef.current?.stop();
    } catch {
      // Session teardown is best-effort; the bounded provider cap ends it regardless.
    }
    setPresenterReady(false);
    setSecondsLeft(null);
    setSession(null);
    if (closing) await settleSession(closing.live, watched, activeAgentId);
  }

  async function disableLiveVideo() {
    if (!activeAgentId || disabling) return;
    setDisabling(true);
    setError(null);
    setNotice(null);
    try {
      await endPreview();
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(activeAgentId)}/video-presenter/disable`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as {
        disabled?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !body?.disabled) {
        setError(body?.error || "Live video could not be turned off. Try again shortly.");
        return;
      }
      await loadPresenter();
      setNotice("Live video is off for this agent. Your presenter choice is saved for later.");
    } catch {
      setError("Live video could not be turned off. Try again shortly.");
    } finally {
      setDisabling(false);
    }
  }

  async function startPreview() {
    if (!activeAgentId || sessionBusy) return;
    // Fetch the presenter chunk in parallel with the mic preflight and the mint
    // so the lazy boundary below has already resolved by the time it mounts.
    warmPresenterBundle();
    setSessionBusy(true);
    setError(null);
    setNotice(null);
    setPresenterReady(false);
    try {
      if (session) await endPreview();
      // Every engine converses: provider-driven engines capture the microphone
      // through the stage, and the Wireline voice captures it through the
      // Realtime surface. The check used to be scoped to non-default engines,
      // so the default path reserved five minutes of allowance FIRST and only
      // then discovered the microphone was blocked — a deaf session the
      // customer still paid for. Preflight before anything is reserved.
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getTracks().forEach((track) => track.stop());
      } catch {
        setError(
          "Live video needs microphone access to hold a conversation. Allow the microphone in your browser and start the stage again — no session minutes were used.",
        );
        return;
      }
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(activeAgentId)}/video-presenter/session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Server-owned resolution: an unavailable engine degrades to the
          // Wireline voice and reports degradedFrom instead of failing.
          body: JSON.stringify({ voiceEngine }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        configured?: boolean;
        fallbackSeed?: string;
        live?: LiveAvatarSessionCredentials;
        usage?: SessionUsage;
        error?: string;
      } | null;
      if (!response.ok || !body?.live) {
        setError(body?.error || "Live session could not start. Try again shortly.");
        return;
      }
      setUsage(body.usage ?? null);
      setSession({ live: body.live, fallbackSeed: body.fallbackSeed || activeAgentId });
    } catch {
      setError("Live session could not start. Try again shortly.");
    } finally {
      setSessionBusy(false);
    }
  }

  const presenter = state?.presenter ?? null;
  const addon = state?.addon ?? null;
  const entitled = addon?.billingEntitled === true;
  const checkoutAvailable = addon?.liveVideoCheckoutAvailable === true;
  const liveVideoOn = isLiveVideoProvider(presenter?.provider);
  const hasFacePick = Boolean(presenter?.avatarId);
  const includedMinutes = usage?.includedMinutes ?? addon?.liveVideoMinutesIncluded ?? 60;
  const sessionMinutes = usage?.sessionReservationMinutes ?? addon?.liveVideoSessionMinutes ?? 5;
  const usedMinutes = Math.max(0, usage?.usedMinutes ?? 0);
  const remainingMinutes = usage?.remainingMinutes ?? Math.max(0, includedMinutes - usedMinutes);
  const activeAgentName = activeAgent?.name || "Your agent";
  // Only a LITE session on the Wireline voice expects this client to push its
  // own PCM. Every other mode is provider-driven, and a second stream would
  // make the presenter talk over itself.
  const wirelineDrivesAudio = session ? sessionExpectsWirelineAudio(session.live) : true;
  // Engine choice: offered only when the workspace actually has more than one
  // engine configured. Reasons on unavailable engines are operator hints and
  // are deliberately not rendered here.
  const availableEngines = useMemo(
    () => (state?.platform.engines ?? []).filter((engine) => engine.available),
    [state?.platform.engines],
  );
  const engineChoiceOffered = availableEngines.length > 1;
  const selectedEngine =
    availableEngines.find((engine) => engine.id === voiceEngine) ??
    availableEngines.find((engine) => engine.id === DEFAULT_ENGINE) ??
    null;
  const sessionDegraded = Boolean(session?.live.degradedFrom);
  // A managed (FULL) engine burns provider credits at 2× LITE for the same
  // wall-clock session, so it reserves proportionally more of the allowance.
  const reserveMinutes = sessionMinutes * (selectedEngine?.creditsPerMinute ?? 1);
  const exhausted = usage?.exhausted === true || remainingMinutes < reserveMinutes;

  return (
    <WorkspaceShell contentClassName="pt-1 pb-8">
      <WorkspacePageFrame mode="standard">
        <WorkspacePageIntro
          title="Live video"
          description="Paid add-on for business agents. Put the same trained voice agent on screen for demos, recaps, and selected web experiences. Calls and texts stay on the phone line."
        />

        {agentsLoading ? (
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading your agents…
          </div>
        ) : degraded ? (
          <div className="mt-8">
            <WorkspaceRecovery onRetry={refresh} />
          </div>
        ) : businessAgents.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card px-5 py-7 text-sm leading-6 text-muted-foreground">
            Create a business agent first, then add its live presenter here.
            <div className="mt-4">
              <Button asChild size="sm" variant="secondary">
                <Link to="/studio?create=1&posture=business">
                  {CUSTOMER_AGENT_LANGUAGE.business.createCta}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-6">
            <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
              <label className="grid w-full max-w-sm gap-2 text-sm font-semibold text-foreground">
                Business agent
                <Select
                  value={activeAgentId ?? ""}
                  onValueChange={(value) => {
                    const next = new URLSearchParams(params);
                    next.set("agent", value);
                    setParams(next, { replace: true });
                  }}
                >
                  <SelectTrigger className="h-auto w-full rounded-md border border-input bg-card py-2 pl-3 text-sm text-foreground">
                    <SelectValue placeholder="Choose an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {businessAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              {state?.addon?.addonOffered ? (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 tabular-nums">
                    {remainingMinutes} / {includedMinutes} min left
                  </span>
                  <span className="rounded-full border border-border bg-secondary/50 px-3 py-1.5">
                    {sessionMinutes} min wall-clock max
                  </span>
                  {state?.hasVoice ? (
                    <span className="rounded-full border border-border bg-secondary/50 px-3 py-1.5">
                      Same approved voice as the phone line
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full border px-3 py-1.5 font-medium ${
                      entitled
                        ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-status-success)]"
                        : "border-border bg-secondary/50"
                    }`}
                  >
                    {entitled ? "Workspace active" : "Add-on"}
                  </span>
                </div>
              ) : null}
            </section>

            {error ? <StatusNotice tone="destructive" title={error} /> : null}
            {notice ? <StatusNotice tone="success" title={notice} /> : null}

            {loading ? (
              <div className="flex min-h-32 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Checking live video status…
              </div>
            ) : !state ? null : !addon?.addonOffered ? (
              <div className="rounded-2xl border border-border bg-card px-5 py-6 shadow-sm">
                <p className="text-sm font-semibold text-foreground">Live video unavailable</p>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {addon?.reason || "Live video is not available on this workspace right now."}
                </p>
                {addon?.liveVideoAddonEnabled ? (
                  <div className="mt-4">
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/settings/billing">Manage billing</Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : !entitled ? (
              <div className="rounded-2xl border border-primary/25 bg-[var(--wireline-color-action-primary-container)] px-5 py-6 shadow-sm">
                <p className="wl-stitch-label">Live Video</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                  {checkoutAvailable
                    ? "Add an on-screen presence"
                    : "Live video access needs attention"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {checkoutAvailable
                    ? `${liveVideoAddonPitch()} ${liveVideoMeteringNote()}`
                    : addon.reason || "Restore an active paid plan before using live video."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {checkoutAvailable ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={checkoutBusy}
                      onClick={() => void startCheckout()}
                    >
                      {checkoutBusy ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Video size={14} aria-hidden="true" />
                      )}
                      Subscribe · $19/mo
                    </Button>
                  ) : (
                    <Button asChild type="button" size="sm">
                      <Link to="/settings/billing">
                        {addon.upgradeRequired ? "Choose a live plan" : "Manage billing"}
                      </Link>
                    </Button>
                  )}
                  <Button asChild type="button" size="sm" variant="secondary">
                    <Link to="/studio">Back to Studio</Link>
                  </Button>
                </div>
              </div>
            ) : !liveVideoOn ? (
              <section className="rounded-2xl border border-border bg-card px-5 py-6 shadow-sm">
                <p className="wl-stitch-label">Agent presence</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                  Turn on live video for <span className="wl-preserve-case">{activeAgentName}</span>
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Calls, texts, and email stay unchanged. Live video appears only in sessions you
                  start here, with the Wireline identity as fallback.
                </p>
                <label className="mt-5 flex max-w-2xl items-start gap-2.5 rounded-xl border border-border bg-secondary/40 p-4 text-sm leading-6 text-muted-foreground">
                  <Checkbox
                    checked={consentAcknowledged}
                    onChange={(event) => setConsentAcknowledged(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I understand this agent will use a catalog presenter. Each session runs for up
                    to {sessionMinutes} minutes, and the selected voice engine will show its exact
                    allowance reservation before I start.
                  </span>
                </label>
                <Button
                  type="button"
                  size="sm"
                  className="mt-4"
                  disabled={!consentAcknowledged || enabling}
                  onClick={() => void enableLiveVideo()}
                >
                  {enabling ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Video className="size-4" aria-hidden="true" />
                  )}
                  Turn on live video
                </Button>
              </section>
            ) : (
              <>
                <AgentPresenceAvatarPicker
                  agentId={activeAgentId!}
                  presenter={presenter!}
                  platformConfigured={Boolean(state.platform.configured)}
                  workspaceDefaultAvatarId={state.platform.defaultAvatarId ?? null}
                  onSelectedAvatarChange={setSelectedAvatar}
                  onUpdated={(next) =>
                    setState((current) => (current ? { ...current, presenter: next } : current))
                  }
                />

                {sessionDegraded ? (
                  <StatusNotice tone="info" title="This stage opened with the Wireline voice.">
                    The engine you picked is not available on this workspace yet, so the session
                    fell back to the managed default. Your conversation still works normally.
                  </StatusNotice>
                ) : null}

                <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
                    <div>
                      <p className="wl-stitch-label">Live stage</p>
                      <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                        <span className="wl-preserve-case">{activeAgentName}</span> on camera
                      </h2>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                        {exhausted
                          ? "This month's reserved Live Video allowance is used."
                          : !hasFacePick
                            ? "Choose a presenter above before opening the live stage."
                            : !selectedEngine || selectedEngine.id === DEFAULT_ENGINE
                              ? `Open a ${sessionMinutes}-minute stage, then talk to the real Wireline agent while the presenter lip-syncs its live voice.`
                              : `Open a ${sessionMinutes}-minute stage and speak with the presenter directly on stage.`}
                      </p>
                      {engineChoiceOffered && !session ? (
                        <div className="mt-4 grid max-w-sm gap-2">
                          <label
                            className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                            htmlFor="live-video-voice-engine"
                          >
                            Presenter voice engine
                          </label>
                          <Select
                            value={selectedEngine?.id ?? DEFAULT_ENGINE}
                            onValueChange={(value) => setVoiceEngine(value as LiveVideoVoiceEngine)}
                          >
                            <SelectTrigger
                              id="live-video-voice-engine"
                              className="h-auto w-full rounded-md border border-input bg-card py-2 pl-3 text-sm text-foreground"
                            >
                              <SelectValue placeholder="Wireline voice" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableEngines.map((engine) => (
                                <SelectItem key={engine.id} value={engine.id}>
                                  {engine.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedEngine ? (
                            <p className="text-xs leading-5 text-muted-foreground">
                              {selectedEngine.description} A {sessionMinutes}-minute session
                              reserves {reserveMinutes} minutes of your monthly allowance.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {session ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void endPreview()}
                      >
                        <Square size={14} aria-hidden="true" />
                        End session
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={!hasFacePick || sessionBusy || exhausted}
                        onClick={() => void startPreview()}
                      >
                        {sessionBusy ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Play size={14} aria-hidden="true" />
                        )}
                        Open live stage
                      </Button>
                    )}
                  </div>

                  <div className="bg-secondary/30 p-3 sm:p-5">
                    {session ? (
                      <Suspense fallback={<PresenterLoadingStage />}>
                        <LiveVideoPresenter
                          ref={presenterRef}
                          credentials={session.live}
                          fallbackSeed={session.fallbackSeed}
                          agentName={activeAgentName}
                          layout="stage"
                          className="w-full"
                          onStreamReady={() => setPresenterReady(true)}
                          onRetry={() => void startPreview()}
                          onSessionEnded={({ watchedSeconds }) => {
                            setPresenterReady(false);
                            setSecondsLeft(null);
                            // Settle on EVERY ending, including `stopped`. That
                            // reason covers component cleanup — switching agents,
                            // navigating away — where no explicit endPreview runs,
                            // so skipping it stopped the provider session while
                            // still charging the tenant the full reservation.
                            // settleSession is receipt-deduplicated, so the
                            // endPreview path calling it too is a no-op.
                            void settleSession(session.live, watchedSeconds, activeAgentId);
                          }}
                        />
                      </Suspense>
                    ) : (
                      <div className="relative grid aspect-video min-h-[240px] place-items-center overflow-hidden rounded-2xl border border-border bg-background shadow-sm sm:min-h-[300px]">
                        {selectedAvatar?.previewImageUrl ? (
                          <>
                            <img
                              src={selectedAvatar.previewImageUrl}
                              alt=""
                              aria-hidden="true"
                              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
                            />
                            <div className="absolute inset-0 bg-background/55" />
                            <img
                              src={selectedAvatar.previewImageUrl}
                              alt={`${selectedAvatar.name} presenter preview`}
                              className="relative z-[1] h-[86%] max-h-[430px] w-auto max-w-[72%] rounded-2xl border border-border object-cover object-top shadow-lg"
                            />
                          </>
                        ) : (
                          <div className="relative z-[1] grid place-items-center">
                            <AgentFace
                              seed={state.fallbackSeed || activeAgentName}
                              size={168}
                              title={`${activeAgentName} identity fallback`}
                            />
                          </div>
                        )}

                        <div className="absolute left-3 top-3 z-[2] inline-flex items-center gap-2 rounded-full border border-border bg-background/85 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground backdrop-blur-sm">
                          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                          Ready
                        </div>
                        <div className="absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-background via-background/80 to-transparent px-5 pb-4 pt-12">
                          <p className="text-sm font-semibold text-foreground">
                            <span className="wl-preserve-case">{activeAgentName}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {selectedAvatar?.name || "Wireline identity fallback"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 tabular-nums">
                          {remainingMinutes} of {includedMinutes} min remaining
                        </span>
                        {/* The five-minute cap used to arrive unannounced and
                            read as a failure. Counting it down in the open makes
                            the ceiling a known part of the session. */}
                        {secondsLeft != null ? (
                          <span
                            className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 tabular-nums"
                            role="timer"
                          >
                            {Math.floor(secondsLeft / 60)}:
                            {String(Math.floor(secondsLeft % 60)).padStart(2, "0")} left in this
                            session
                          </span>
                        ) : null}
                        <span className="rounded-full border border-border bg-secondary/50 px-3 py-1.5">
                          {presenterReady
                            ? "Camera connected"
                            : session
                              ? "Camera connecting"
                              : "Stage closed"}
                        </span>
                      </div>
                      {session && presenterReady ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                          <Mic2 className="size-3.5" aria-hidden="true" />
                          Live conversation ready
                        </span>
                      ) : null}
                    </div>
                  </div>
                </section>

                {session ? (
                  presenterReady ? (
                    wirelineDrivesAudio ? (
                      <OpenAILiveVoiceSandbox
                        agentId={activeAgentId!}
                        agentName={activeAgentName}
                        onAgentAudioDelta={(base64Pcm) =>
                          presenterRef.current?.feedPcmDelta(base64Pcm)
                        }
                        onAgentAudioEnd={() => presenterRef.current?.flushPcm()}
                      />
                    ) : (
                      // The provider produces speech in this mode. Opening a
                      // second Wireline audio stream would talk over it.
                      <div className="rounded-2xl border border-border bg-card px-5 py-5 text-sm leading-6 text-muted-foreground shadow-sm">
                        This presenter answers on the stage itself — speak into your microphone and
                        it will reply. Wireline is not adding a second audio stream.
                      </div>
                    )
                  ) : (
                    <div className="rounded-2xl border border-border bg-card px-5 py-5 text-sm text-muted-foreground shadow-sm">
                      The presenter is connecting. Live conversation unlocks as soon as the camera
                      stream is ready.
                    </div>
                  )
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-5 text-sm leading-6 text-muted-foreground">
                    Open the live stage first. Once the presenter is connected, you can speak with
                    this agent using its current Training, rules, tools, and voice profile.
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
                  <p className="text-sm text-muted-foreground">
                    Presenter choice stays saved if you turn video off for this agent.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={disabling}
                    onClick={() => void disableLiveVideo()}
                  >
                    {disabling ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Turn off for this agent
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
