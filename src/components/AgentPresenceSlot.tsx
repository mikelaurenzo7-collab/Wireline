/**
 * AgentPresenceSlot — authenticated in-app identity surface.
 *
 * Deterministic AgentFace stays useful as an internal recognition badge across
 * Studio, training, analytics, and call logs. It must not be positioned as a
 * video presenter; premium human/character Presence is a separate future layer.
 */
import AgentFace from "./AgentFace";
import { buildAgentIdentityPreview, VIDEO_PRESENTER_PROVIDERS } from "../lib/agent-identity";
import { presenterCustomizationMessage } from "../lib/video-presenter/copy";
import type { AgentVideoPresenterConfig } from "../lib/video-presenter/types";

export type AgentPresenceVariant = "badge" | "inline" | "stage";

export default function AgentPresenceSlot({
  name,
  agentId,
  role,
  isBusinessAgent = false,
  variant = "inline",
  speaking = false,
  showLiveBadge = false,
  showWaveform = false,
  presenter: presenterOverride,
  className = "",
}: {
  name: string;
  agentId?: string | null;
  role?: string | null;
  isBusinessAgent?: boolean;
  variant?: AgentPresenceVariant;
  speaking?: boolean;
  showLiveBadge?: boolean;
  showWaveform?: boolean;
  presenter?: AgentVideoPresenterConfig | null;
  className?: string;
}) {
  const identity = buildAgentIdentityPreview({
    id: agentId,
    name,
    role,
    isBusinessAgent,
  });
  const activeProvider = presenterOverride?.provider ?? identity.video.providerPreference;
  const headline = presenterOverride?.headline ?? identity.video.headline;
  const surfaceLabel = VIDEO_PRESENTER_PROVIDERS[activeProvider].surfaceLabel;
  const videoSlotCopy = identity.video.consentRequired
    ? `${surfaceLabel}, consent-gated`
    : surfaceLabel;
  const showSurfaceChip =
    Boolean(surfaceLabel) &&
    surfaceLabel.trim().toLowerCase() !==
      String(headline || "")
        .trim()
        .toLowerCase();
  const isSyntheticIdentity = activeProvider === "synthetic";
  const showFallbackChip = !isSyntheticIdentity && surfaceLabel.trim().toLowerCase() !== "identity badge";
  const faceSize = variant === "badge" ? 28 : variant === "stage" ? 120 : 44;

  if (variant === "badge") {
    return (
      <AgentFace
        seed={identity.seed}
        size={faceSize}
        speaking={speaking}
        title={`${name || "Agent"} identity badge`}
        className={className}
      />
    );
  }

  const rootClass = `wl-presence wl-presence--${variant}${variant === "stage" ? " wl-presence--ink" : ""}${className ? ` ${className}` : ""}`;

  return (
    <div className={rootClass}>
      <div className={`wl-presence__frame${variant === "stage" ? " wl-presence__frame--ink" : ""}`}>
        {showLiveBadge && !isSyntheticIdentity ? (
          <span className="wl-presence__live">
            <span className="wl-presence__live-dot" aria-hidden="true" />
            On screen
          </span>
        ) : null}
        <div className="wl-presence__face">
          <AgentFace
            seed={identity.seed}
            size={faceSize}
            speaking={speaking}
            title={`${name || "Agent"} identity badge`}
          />
        </div>
        {showWaveform ? (
          <div className="wl-presence__wave" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : null}
      </div>

      {variant === "stage" ? (
        <div className="wl-presence__strip" role="status">
          <strong>{headline}</strong>
          {showSurfaceChip ? <span className="wl-presence__chip">{videoSlotCopy}</span> : null}
          {isSyntheticIdentity ? (
            <span className="wl-presence__chip">App-only identifier</span>
          ) : null}
          {showFallbackChip ? (
            <span className="wl-presence__chip">Fallback · identity badge</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AgentPresenceMeta({
  name,
  agentId,
  role,
  isBusinessAgent = false,
  presenter: presenterOverride,
  className = "",
}: {
  name: string;
  agentId?: string | null;
  role?: string | null;
  isBusinessAgent?: boolean;
  presenter?: AgentVideoPresenterConfig | null;
  className?: string;
}) {
  const identity = buildAgentIdentityPreview({
    id: agentId,
    name,
    role,
    isBusinessAgent,
  });
  const activeProvider = presenterOverride?.provider ?? identity.video.providerPreference;
  const headline = presenterOverride?.headline ?? identity.video.headline;
  const surfaceLabel = VIDEO_PRESENTER_PROVIDERS[activeProvider].surfaceLabel;
  const customization = presenterOverride ? presenterCustomizationMessage(presenterOverride) : null;
  const showSurfaceChip =
    Boolean(surfaceLabel) &&
    surfaceLabel.trim().toLowerCase() !==
      String(headline || "")
        .trim()
        .toLowerCase();

  return (
    <p className={`wl-presence__strip ${className}`.trim()} role="status">
      <strong>{headline}</strong>
      {showSurfaceChip ? <span className="wl-presence__chip">{surfaceLabel}</span> : null}
      {customization ? <span className="wl-presence__chip">{customization}</span> : null}
      <span className="text-[var(--wireline-color-text-tertiary)]">
        {identity.persona.shortLabel} · {identity.persona.microcopy}
      </span>
    </p>
  );
}
