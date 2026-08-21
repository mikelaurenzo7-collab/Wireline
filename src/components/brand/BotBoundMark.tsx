type BotBoundMarkProps = {
  className?: string;
  label?: string;
  /** Full Aurora treatment. Set false for subdued single-color contexts. */
  signal?: boolean;
};

/**
 * Canonical BotBound mark: the Bot visibly grips a violet telephone receiver.
 *
 * The production artwork is shared by the web, billing, browser, iOS, and
 * Android surfaces. Keeping one real source asset prevents the tiny geometric
 * variants that previously made the receiver read like a broken headset.
 */
export default function BotBoundMark({ className = "", label, signal = true }: BotBoundMarkProps) {
  return (
    <img
      src="/brand/botbound-app-icon.png"
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
