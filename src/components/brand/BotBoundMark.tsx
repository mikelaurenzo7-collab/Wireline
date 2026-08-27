type BotBoundMarkProps = {
  className?: string;
  label?: string;
  /** Full Aurora treatment. Set false for subdued single-color contexts. */
  signal?: boolean;
};

/**
 * Canonical BotBound mark: the Bot visibly grips a violet telephone receiver.
 *
 * The transparent UI artwork keeps the Bot and telephone silhouette legible
 * without trapping the identity inside a generic app tile. Platform app icons
 * retain their own square-safe source and mask treatment.
 */
export default function BotBoundMark({ className = "", label, signal = true }: BotBoundMarkProps) {
  return (
    <img
      src="/brand/botbound-operator-polished.png"
      alt={label ?? ""}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={`bb-mark-image inline-block shrink-0 ${className}`}
      data-signal={signal ? "true" : "false"}
      data-botbound-mark="phone-bot"
    />
  );
}
