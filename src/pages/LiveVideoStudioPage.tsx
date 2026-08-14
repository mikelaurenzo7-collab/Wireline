/**
 * Live Video studio — the consumption surface for the paid Live Video add-on.
 *
 * The page deliberately uses `billingEntitled` as the authority for paid
 * access. `liveVideoAddonEnabled` is only a webhook-maintained cache and can be
 * temporarily stale while a plan is canceled, unpaid, or provider access is
 * disabled. The server enforces the same entitlement boundary on every paid
 * session mint.
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
    setUsage(null);
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
      setNotice("Live video is on for this agent. Choose its presenter below.");
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

  // No page-level unmount teardown needed: LiveVideoPresenter owns session cleanup.
  const presenter = state?.presenter ?? null;
  const addon = state?.addon ?? null;
  const entitled = addon?.billingEntitled === true;
  const checkoutAvailable = addon?.liveVideoCheckoutAvailable === true;
  const liveVideoOn = presenter?.provider === "liveavatar";
  const hasFacePick = Boolean(presenter?.avatarId);
  const includedMinutes = addon?.liveVideoMinutesIncluded ?? 60;
  const sessionMinutes = addon?.liveVideoSessionMinutes ?? 5;
  const usedMinutes = Math.max(0, usage?.usedMinutes ?? 0);
  const remainingMinutes = Math.max(0, (usage?.includedMinutes ?? includedMinutes) - usedMinutes);

  return (
    <WorkspaceShell contentClassName="pt-1 pb-8">
      <WorkspacePageFrame mode="standard">
        <WorkspacePageIntro
          title="Live video"
          description="Put a selected business agent on screen with a catalog presenter."
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
          <div className="mt-8 rounded-xl border border-dashed border-border px-5 py-6 text-sm leading-6 text-muted-foreground">
            Create a business agent first, then add its live presenter here.
            <div className="mt-4">
              <Button asChild size="sm" variant="secondary">
                <Link to="/studio?create=1&posture=business">Create business agent</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-6">
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-end sm:justify-between">
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
                  <span className="rounded-full border border-border px-3 py-1.5">
                    {includedMinutes} min / month
                  </span>
                  <span className="rounded-full border border-border px-3 py-1.5">
                    Up to {sessionMinutes} min / session
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1.5 ${
                      entitled
                        ? "border-[var(--wireline-color-feedback-success-border)] text-[var(--wireline-color-status-success)]"
                        : "border-border"
                    }`}
                  >
                    {entitled ? "Active" : "Add-on"}
                  </span>
                </div>
              ) : null}
            </div>

            {error ? <StatusNotice tone="destructive" title={error} /> : null}
            {notice ? <StatusNotice tone="success" title={notice} /> : null}

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Checking live video status…
              </div>
            ) : !state ? null : !addon?.addonOffered ? (
              <div className="rounded-xl border border-border bg-card px-5 py-5">
                <p className="text-sm font-semibold text-foreground">Live video unavailable</p>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {addon?.reason || "Live video is not available on this workspace right now."}
                </p>
              </div>
            ) : !entitled ? (
              <div className="rounded-xl border border-primary/25 bg-[var(--wireline-color-action-primary-container)] px-5 py-5">
                <p className="text-sm font-semibold text-foreground">
                  {checkoutAvailable ? "Add live video" : "Live video access needs attention"}
                </p>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
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
            ) : (
              <>
                {!liveVideoOn ? (
                  <div className="rounded-xl border border-border bg-card px-5 py-5">
                    <p className="text-sm font-semibold text-foreground">
                      Turn on live video for {activeAgent?.name}
                    </p>
                    <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
                      Calls, texts, and email stay unchanged. Live video appears only in sessions you
                      start here, with the Wireline identity as fallback.
                    </p>
                    <label className="mt-4 flex items-start gap-2.5 text-sm leading-6 text-muted-foreground">
                      <Checkbox
                        checked={consentAcknowledged}
                        onChange={(event) => setConsentAcknowledged(event.target.checked)}
                        className="mt-1"
                      />
                      I understand this agent will use a catalog presenter and each preview reserves
                      {` ${sessionMinutes} `}minutes from the monthly live-video allowance.
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
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Live preview</p>
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                            {hasFacePick
                              ? `Start a live ${sessionMinutes}-minute session to check framing, motion, and presence.`
                              : "Choose a presenter above, then start a live preview."}
                          </p>
                          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                            {usage
                              ? `${remainingMinutes} of ${usage.includedMinutes ?? includedMinutes} reserved minutes remaining`
                              : `${includedMinutes} reserved minutes each month · ${sessionMinutes} reserved per session`}
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
                        <div className="mt-4 max-w-2xl">
                          <LiveVideoPresenter
                            ref={presenterRef}
                            credentials={session.live}
                            fallbackSeed={session.fallbackSeed}
                            agentName={activeAgent?.name || "Your agent"}
                            className="aspect-video w-full"
                            onRetry={() => void startPreview()}
                          />
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
