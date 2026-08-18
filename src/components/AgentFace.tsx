/**
 * Backward-compatible adapter for older call sites.
 *
 * Human/cartoon faces are retired from the active product. Existing imports
 * resolve to the same compact BotMark primitive so dense surfaces can migrate
 * without a risky all-at-once rename.
 */
import BotMark from "./BotMark";

export default function AgentFace({
  seed,
  faceId,
  size = 40,
  speaking = false,
  className,
  title,
}: {
  seed: string;
  /** Legacy persisted value; treated only as an alternate stable mark seed. */
  faceId?: string | null;
  size?: number;
  speaking?: boolean;
  className?: string;
  title?: string;
}) {
  const normalizedTitle = title?.replace(/\bface\b/gi, "mark").replace(/\bavatar\b/gi, "mark");

  return (
    <BotMark
      seed={faceId || seed}
      name={seed}
      size={size}
      active={speaking}
      className={className}
      title={normalizedTitle || "Bot mark"}
    />
  );
}
