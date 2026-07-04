/**
 * AgentPresenceSlot — authenticated "put a face to your agent" surface.
 *
 * The marketing stage (AgentPresenterStage) sells the promise; this component
 * delivers it inside the product: deterministic AgentFace in a compact video
 * slot frame, with Wireline-native copy for live presenter policy.
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
  const headline = presenterOverride?.headline ?? identity.video.headline;
  const surfaceLabel =
    VIDEO_PRESENTER_PROVIDERS[presenterOverride?.provider ?? identity.video.providerPreference]
      .surfaceLabel;
  const videoSlotCopy = identity.video.consentRequired
    ? `${surfaceLabel}, consent-gated`
    : surfaceLabel;
  const faceSize = variant === "badge" ? 28 : variant === "stage" ? 120 : 44;

  if (variant === "badge") {
    return (
      <AgentFace
        seed={identity.seed}
        size={faceSize}
        speaking={speaking}
        title={`${name || "Agent"} face`}
        className={className}
      />
    );
  }

  const rootClass = `wl-presence wl-presence--${variant}${className ? ` ${className}` : ""}`;

  return (
    <div className={rootClass}>
      <div className="wl-presence__frame">
        {showLiveBadge ? (
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
            title={`${name || "Agent"} face`}
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
          <span className="wl-presence__chip">{videoSlotCopy}</span>
          <span className="wl-presence__chip">Fallback · Wireline face</span>
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
  const headline = presenterOverride?.headline ?? identity.video.headline;
  const surfaceLabel =
    VIDEO_PRESENTER_PROVIDERS[presenterOverride?.provider ?? identity.video.providerPreference]
      .surfaceLabel;
  const customization = presenterOverride ? presenterCustomizationMessage(presenterOverride) : null;

  return (
    <p className={`wl-presence__strip ${className}`.trim()} role="status">
      <strong>{headline}</strong>
      <span className="wl-presence__chip">{surfaceLabel}</span>
      {customization ? <span className="wl-presence__chip">{customization}</span> : null}
      <span className="text-[var(--wireline-color-text-tertiary)]">
        {identity.persona.shortLabel} · {identity.persona.microcopy}
      </span>
    </p>
  );
}
