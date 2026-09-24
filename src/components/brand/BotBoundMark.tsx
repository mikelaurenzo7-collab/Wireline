type BotBoundMarkProps = {
  className?: string;
  label?: string;
  /** Full Aurora treatment. Set false for subdued single-color contexts. */
  signal?: boolean;
};

/**
 * Canonical BotBound mark: the Presenting robot character only.
 *
 * No baked "BotBound" wordmark. Product name is the typographic CSS wordmark
 * in BotBoundBrand. Favicon, PWA, and Stripe tiny chrome use the letterpress
 * phone glyph separately because the robot does not read at 16px.
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
      data-botbound-mark="character"
    />
  );
}
