/**
 * Fetches a LiveAvatar session and renders the live stream or SVG fallback.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Volume2 } from "lucide-react";

import { authFetch } from "../lib/api";
import {
  videoPresenterPreviewHint,
  videoPresenterStatusMessage,
  liveVideoAddonPitch,
} from "../lib/video-presenter/copy";
import { isLiveVideoAddonOffered } from "../lib/video-presenter/live-video-addon";
import type {
  AgentVideoPresenterConfig,
  LiveAvatarSessionCredentials,
  VideoPresenterSessionResponse,
} from "../lib/video-presenter/types";
import AgentPresenceAvatarPicker from "./AgentPresenceAvatarPicker";
import AgentPresenceSlot, { AgentPresenceMeta } from "./AgentPresenceSlot";
import LiveVideoPresenter, { type LiveVideoPresenterHandle } from "./LiveVideoPresenter";

type PresenterSampleResponse = {
  eventId: string;
  chunks: string[];
  sampleText?: string;
  error?: string;
};

type PresenterPayload = {
  presenter: AgentVideoPresenterConfig;
  fallbackSeed: string;
  platform: {
    configured: boolean;
    avatarCatalogReady: boolean;
    sandbox: boolean;
    defaultAvatarId?: string | null;
  };
};

export default function AgentPresenceLivePreview({
  agentId,
  name,
  role,
  isBusinessAgent = false,
  speaking: speakingProp = false,
  className = "",
}: {
  agentId: string;
  name: string;
  role?: string | null;
  isBusinessAgent?: boolean;
  speaking?: boolean;
  className?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presenterState, setPresenterState] = useState<PresenterPayload | null>(null);
  const [session, setSession] = useState<{
    live: LiveAvatarSessionCredentials;
    fallbackSeed: string;
  } | null>(null);
  const [videoSpeaking, setVideoSpeaking] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const livePresenterRef = useRef<LiveVideoPresenterHandle>(null);
  const showSpeaking = speakingProp || videoSpeaking;

  const loadPresenter = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/video-presenter`,
      );
      const payload = (await response.json()) as PresenterPayload;
      if (!response.ok) throw new Error("Presenter settings could not be loaded.");
      setPresenterState(payload);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Presenter settings could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void loadPresenter();
  }, [loadPresenter]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/video-presenter/session`,
        { method: "POST" },
      );
      const payload = (await response.json()) as VideoPresenterSessionResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Live video could not be started.");
      }
      if (!payload.configured || !payload.live) {
        throw new Error(
          presenterState?.platform.configured
            ? "Pick a presenter face below, then preview again."
            : "Live video is not enabled on this Wireline workspace yet.",
        );
      }
      setSession({ live: payload.live, fallbackSeed: payload.fallbackSeed });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Live video could not be started.");
      setSession(null);
    } finally {
      setConnecting(false);
    }
  }, [agentId, presenterState?.platform.configured]);

  const playVoiceSample = useCallback(async () => {
    if (!session) return;
    setSampleLoading(true);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/video-presenter/sample`,
        { method: "POST" },
      );
      const payload = (await response.json()) as PresenterSampleResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Voice sample could not be generated.");
      }
      await livePresenterRef.current?.streamSample(payload.chunks, payload.eventId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Voice sample could not be played.");
    } finally {
      setSampleLoading(false);
    }
  }, [agentId, session]);

  const enableLiveVideo = useCallback(async () => {
    setEnabling(true);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/video-presenter/enable`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || "Live video could not be enabled.");
      }
      setPresenterState((current) =>
        current ? { ...current, presenter: payload.presenter } : current,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Live video could not be enabled.");
    } finally {
      setEnabling(false);
    }
  }, [agentId]);

  const presenter = presenterState?.presenter;
  const platformConfigured = presenterState?.platform.configured ?? false;
  const liveVideoEnabled = presenter?.provider !== "synthetic" && presenter?.status !== "disabled";
  const addonOffered = isLiveVideoAddonOffered();
  const statusCopy =
    presenter && videoPresenterStatusMessage(presenter, platformConfigured, isBusinessAgent);
  const previewHint = presenter && videoPresenterPreviewHint(presenter, platformConfigured);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading presenter…
      </div>
    );
  }

  return (
    <div className={className}>
      {statusCopy ? (
        <p className="mb-3 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
          {statusCopy}
        </p>
      ) : null}

      {session ? (
        <div className="wl-presence wl-presence--stage">
          <LiveVideoPresenter
            ref={livePresenterRef}
            credentials={session.live}
            fallbackSeed={session.fallbackSeed}
            agentName={name}
            speaking={showSpeaking}
            onSpeakingChange={setVideoSpeaking}
          />
          <div className="wl-presence__strip" role="status">
            <strong>Live presenter connected</strong>
            <span className="wl-presence__chip">
              {session.live.sandbox ? "Sandbox" : "Live video"}
            </span>
            <span className="wl-presence__chip">{showSpeaking ? "Speaking" : "Idle"}</span>
            <span className="wl-presence__chip">Fallback · Wireline face</span>
          </div>
        </div>
      ) : (
        <>
          <AgentPresenceSlot
            name={name}
            agentId={agentId}
            role={role}
            isBusinessAgent={isBusinessAgent}
            variant="stage"
            showLiveBadge={liveVideoEnabled && presenter?.status === "ready"}
            showWaveform
            speaking={showSpeaking}
            presenter={presenter}
          />
          {presenter ? (
            <AgentPresenceMeta
              name={name}
              agentId={agentId}
              role={role}
              isBusinessAgent={isBusinessAgent}
              presenter={presenter}
              className="mt-3"
            />
          ) : null}
        </>
      )}

      {isBusinessAgent && platformConfigured && presenter ? (
        <AgentPresenceAvatarPicker
          agentId={agentId}
          presenter={presenter}
          platformConfigured={platformConfigured}
          workspaceDefaultAvatarId={presenterState?.platform.defaultAvatarId ?? null}
          onUpdated={(next) =>
            setPresenterState((current) => (current ? { ...current, presenter: next } : current))
          }
        />
      ) : null}

      {isBusinessAgent && !liveVideoEnabled ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-[var(--wireline-color-surface-subtle)] px-4 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Add-on
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">Live video presence</p>
          <p className="mt-1 max-w-[52ch] text-xs leading-relaxed text-muted-foreground">
            {liveVideoAddonPitch()} Your catalog face choice is already saved — enable this to
            stream photoreal video on your site and in preview.
          </p>
          {addonOffered ? (
            <button
              type="button"
              onClick={() => void enableLiveVideo()}
              disabled={enabling}
              className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--wireline-color-action-primary-default)] bg-[var(--wireline-color-action-primary-default)] px-3 text-xs font-semibold text-white transition-colors hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enabling ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              Add live video
            </button>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Contact Wireline to enable this add-on on your workspace.
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {liveVideoEnabled && !session ? (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={connecting || presenter?.status !== "ready"}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-3 text-xs font-semibold text-foreground transition-colors hover:border-[var(--wireline-color-action-primary-default)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {connecting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="size-3.5" aria-hidden="true" />
            )}
            Preview live presenter
          </button>
        ) : liveVideoEnabled && session ? (
          <button
            type="button"
            onClick={() => void playVoiceSample()}
            disabled={sampleLoading}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-3 text-xs font-semibold text-foreground transition-colors hover:border-[var(--wireline-color-action-primary-default)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sampleLoading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Volume2 className="size-3.5" aria-hidden="true" />
            )}
            Hear agent voice on video
          </button>
        ) : null}
        {error ? (
          <p className="text-xs text-[var(--wireline-color-status-warning)]" role="alert">
            {error}
          </p>
        ) : previewHint && !session ? (
          <p className="text-xs text-muted-foreground">{previewHint}</p>
        ) : null}
      </div>
    </div>
  );
}
