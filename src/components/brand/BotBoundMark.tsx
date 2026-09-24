type BotBoundMarkProps = {
  className?: string;
  label?: string;
  /** Full Aurora treatment. Set false for subdued single-color contexts. */
  signal?: boolean;
};

/**
 * Canonical BotBound mark: the letterpress violet phone glyph.
 *
 * Studio chrome, favicon, PWA, and Stripe use this flat B glyph. Presenting
 * photoreal artwork stays on marketing tiles, OG, and store icons.
 */
export default function BotBoundMark({ className = "", label, signal = true }: BotBoundMarkProps) {
  return (
    <img
      src="/brand/botbound-mark.png"
      alt={label ?? ""}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={`bb-mark-image inline-block shrink-0 ${className}`}
      data-signal={signal ? "true" : "false"}
      data-botbound-mark="letterpress"
    />
  );
}
