/**
 * AgentPresenceSlot — compact, role-agnostic bot recognition.
 *
 * The active product intentionally has no avatar or video-presenter layer.
 * Every bot gets a stable circular Bot Mark; richer branding can later flow
 * through the same primitive without changing the surrounding product UI.
 */
import BotMark from "./BotMark";

export type AgentPresenceVariant = "badge" | "inline" | "stage";

type AgentPresenceProps = {
  name: string;
  agentId?: string | null;
  role?: string | null;
  isBusinessAgent?: boolean;
  variant?: AgentPresenceVariant;
  speaking?: boolean;
  showLiveBadge?: boolean;
  showWaveform?: boolean;
  /** Legacy caller compatibility while retired presenter state ages out. */
  presenter?: unknown;
  className?: string;
};

function displayRole(role: string | null | undefined): string | null {
  const normalized = role?.trim();
  if (!normalized) return null;
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AgentPresenceSlot(props: AgentPresenceProps) {
  const {
    name,
    agentId,
    role,
    variant = "inline",
    speaking = false,
    className = "",
  } = props;
  const seed = agentId || name || "bot";
  const markSize = variant === "badge" ? 28 : variant === "stage" ? 88 : 40;

  if (variant === "badge" || variant === "inline") {
    return (
      <BotMark
        seed={seed}
        name={name}
        size={markSize}
        active={speaking}
        className={className}
        title={`${name || "Bot"} mark`}
      />
    );
  }

  const roleLabel = displayRole(role);
  return (
    <div className={`wl-presence wl-presence--stage${className ? ` ${className}` : ""}`}>
      <div className="wl-presence__frame wl-presence__frame--ink">
        <BotMark
          seed={seed}
          name={name}
          size={markSize}
          active={speaking}
          title={`${name || "Bot"} mark`}
        />
      </div>
      <div className="wl-presence__strip" role="status">
        <strong>{name || "Bot"}</strong>
        {roleLabel ? <span className="wl-presence__chip">{roleLabel}</span> : null}
      </div>
    </div>
  );
}

export function AgentPresenceMeta({
  name,
  role,
  className = "",
}: Pick<AgentPresenceProps, "name" | "role" | "className"> & {
  agentId?: string | null;
  isBusinessAgent?: boolean;
  presenter?: unknown;
}) {
  const roleLabel = displayRole(role);
  return (
    <p className={`wl-presence__strip ${className}`.trim()} role="status">
      <strong>{name || "Bot"}</strong>
      {roleLabel ? <span className="wl-presence__chip">{roleLabel}</span> : null}
    </p>
  );
}
