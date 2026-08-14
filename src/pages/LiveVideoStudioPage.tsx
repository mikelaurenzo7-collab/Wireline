/**
 * Live Video studio — the consumption surface for the paid Live Video add-on.
 *
 * The add-on was sellable (billing card + landing economics) while nothing a
 * customer could reach let them pick a presenter, enable it, or see a live
 * session — the entitlement gated APIs with no mounted caller. This page is
 * that missing surface, deliberately scoped to the CATALOG presenter flow the
 * server fully supports today: entitle → enable with disclosure → pick a face
 * → run a bounded live preview. Custom-likeness consent and PSTN lip-sync
 * bridging remain retired (see #1083) and are not resold here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Loader2, Play, Square, Video } from "lucide-react";

import AgentPresenceAvatarPicker from "../components/AgentPresenceAvatarPicker";
import LiveVideoPresenter, {
  type LiveVideoPresenterHandle,
} from "../components/LiveVideoPresenter";
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
import type {
  AgentVideoPresenterConfig,
  LiveAvatarSessionCredentials,
  LiveVideoAddonState,
} from "../lib/video-presenter/types";

type PresenterPayload = {
  presenter: AgentVideoPresenterConfig;
  fallbackSeed: string;
  platform: {
    configured: boolean;
    sandbox: boolean;
    defaultAvatarId?: string | null;
  };
  addon: LiveVideoAddonState;
  hasVoice: boolean;
};

type SessionUsage = {
  includedMinutes?: number;
  usedMinutes?: number;
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
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [session, setSession] = useState<{
    live: LiveAvatarSessionCredentials;
    fallbackSeed: string;
  } | null>(null);
  const [usage, setUsage] = useState<SessionUsage | null>(null);
  const presenterRef = useRef<LiveVideoPresenterHandle>(null);

  const loadPresenter = useCallback(async () => {
    if (!activeAgentId) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(activeAgentId)}/video-presenter`,
      );
      const body = (await response.json().catch(() => null)) as PresenterPayload | null;
      if (!response.ok || !body) {
        setError("Live video status is unavailable right now. Try again shortly.");
        setState(null);
        return;
      }
      setState(body);
    } catch {
      setError("Live video status is unavailable right now. Try again shortly.");
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [activeAgentId]);

  useEffect(() => {
    setSession(null);
    setNotice(null);
    setConsentAcknowledged(false);
    void loadPresenter();
  }, [loadPresenter]);

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
      setNotice("Live video is on for this agent. Pick a presenter face below.");
    } catch {
      setError("Live video could not be enabled. Try again shortly.");
    } finally {
      setEnabling(false);
    }
  }

  async function startPreview() {
    if (!activeAgentId || sessionBusy) return;
    setSessionBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(activeAgentId)}/video-presenter/session`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as {
        configured?: boolean;
        fallbackSeed?: string;
        live?: LiveAvatarSessionCredentials;
        usage?: SessionUsage;
        error?: string;
      } | null;
      if (!response.ok || !body?.live) {
        setError(body?.error || "Live preview could not start. Try again shortly.");
        return;
      }
      setUsage(body.usage ?? null);
      setSession({ live: body.live, fallbackSeed: body.fallbackSeed || activeAgentId });
    } catch {
      setError("Live preview could not start. Try again shortly.");
    } finally {
      setSessionBusy(false);
    }
  }

  async function endPreview() {
    try {
      await presenterRef.current?.stop();
    } catch {
      // Session teardown is best-effort; the bounded server cap ends it regardless.
    }
    setSession(null);
  }

  // No page-level unmount teardown needed: LiveVideoPresenter's own effect
  // cleanup stops its LiveAvatar session when the component unmounts.

  const presenter = state?.presenter ?? null;
  const addon = state?.addon ?? null;
  const entitled = Boolean(addon?.billingEntitled || addon?.liveVideoAddonEnabled);
  const liveVideoOn = presenter?.provider === "liveavatar";
  const hasFacePick = Boolean(presenter?.avatarId);

  return (
    <WorkspaceShell contentClassName="pt-1 pb-8">
      <WorkspacePageFrame mode="standard">
        <WorkspacePageIntro
          title="Live video"
          description="An optional on-screen presenter for business agents: pick a catalog face, preview it live, and keep the Wireline identity as the always-on fallback."
        />

        {agentsLoading ? (
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading your agents…
          </div>
        ) : degraded ? (
          // An unreachable roster is not an empty one — offering "create an
          // agent" here would duplicate agents that already exist.
          <div className="mt-8">
            <WorkspaceRecovery onRetry={refresh} />
          </div>
        ) : businessAgents.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border px-5 py-6 text-sm leading-6 text-muted-foreground">
            Live video is available for business agents. Create a business voice agent first, then
            return here to add its presenter.
            <div className="mt-4">
              <Button asChild size="sm" variant="secondary">
                <Link to="/studio?create=1&posture=business">Create a business agent</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-6">
            <label className="grid max-w-sm gap-2 text-sm font-semibold text-foreground">
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

            {error ? <StatusNotice tone="destructive" title={error} /> : null}
            {notice ? <StatusNotice tone="success" title={notice} /> : null}

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Checking live video status…
              </div>
            ) : !state ? null : !addon?.addonOffered ? (
              <div className="rounded-xl border border-border bg-card px-5 py-5 text-sm leading-6 text-muted-foreground">
                Live video is not available on this workspace yet. Contact Wireline to enable it.
              </div>
            ) : !entitled ? (
              <div className="rounded-xl border border-primary/25 bg-[var(--wireline-color-action-primary-container)] px-5 py-5">
                <p className="text-sm font-semibold text-foreground">Live video presence</p>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {liveVideoAddonPitch()} {liveVideoMeteringNote()}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-4"
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
              </div>
            ) : (
              <>
                {!liveVideoOn ? (
                  <div className="rounded-xl border border-border bg-card px-5 py-5">
                    <p className="text-sm font-semibold text-foreground">
                      Turn on live video for {activeAgent?.name}
                    </p>
                    <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
                      The presenter appears only in live video sessions you start. Calls, texts, and
                      email keep working exactly as before, and the Wireline identity remains the
                      fallback whenever video is unavailable.
                    </p>
                    <label className="mt-4 flex items-start gap-2.5 text-sm leading-6 text-muted-foreground">
                      <Checkbox
                        checked={consentAcknowledged}
                        onChange={(event) => setConsentAcknowledged(event.target.checked)}
                        className="mt-1"
                      />
                      I understand this agent will present with a catalog video face in live video
                      sessions, and that session minutes draw from the add-on's monthly reserve.
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
                      ) : null}
                      Turn on live video
                    </Button>
                  </div>
                ) : (
                  <>
                    <AgentPresenceAvatarPicker
                      agentId={activeAgentId!}
                      presenter={presenter!}
                      platformConfigured={Boolean(state.platform.configured)}
                      workspaceDefaultAvatarId={state.platform.defaultAvatarId ?? null}
                      onUpdated={(next) =>
                        setState((current) => (current ? { ...current, presenter: next } : current))
                      }
                    />

                    <div className="rounded-xl border border-border bg-card p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Live preview</p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            {hasFacePick
                              ? "Start a bounded live session to see this presenter on stream."
                              : "Pick a presenter face above, then preview it live."}
                          </p>
                        </div>
                        {session ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void endPreview()}
                          >
                            <Square size={14} aria-hidden="true" />
                            End preview
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            disabled={!hasFacePick || sessionBusy}
                            onClick={() => void startPreview()}
                          >
                            {sessionBusy ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Play size={14} aria-hidden="true" />
                            )}
                            Start live preview
                          </Button>
                        )}
                      </div>

                      {session ? (
                        <div className="mt-4 max-w-xl">
                          <LiveVideoPresenter
                            ref={presenterRef}
                            credentials={session.live}
                            fallbackSeed={session.fallbackSeed}
                            agentName={activeAgent?.name || "Your agent"}
                            className="aspect-video w-full"
                            onRetry={() => void startPreview()}
                          />
                          {typeof usage?.includedMinutes === "number" ? (
                            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                              {Math.max(0, usage.usedMinutes ?? 0)} of {usage.includedMinutes}{" "}
                              reserved minutes used this month
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
