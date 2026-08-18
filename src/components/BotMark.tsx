import { botMarkFor } from "../lib/bot-mark";

export default function BotMark({
  seed,
  name,
  size = 32,
  imageUrl,
  active = false,
  className = "",
  title,
}: {
  seed: string;
  name?: string | null;
  size?: number;
  imageUrl?: string | null;
  active?: boolean;
  className?: string;
  title?: string;
}) {
  const mark = botMarkFor({ seed, name });
  const accessibleLabel = title || `${name || "Bot"} mark`;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full align-middle ${className}`.trim()}
      style={{
        width: size,
        height: size,
        background: mark.palette.background,
        color: mark.palette.foreground,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.18)",
      }}
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="select-none font-semibold leading-none"
          style={{ fontSize: Math.max(11, Math.round(size * 0.4)), letterSpacing: "-0.03em" }}
        >
          {mark.initial}
        </span>
      )}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full ring-2 ring-[var(--wireline-color-action-primary-default)] ring-offset-1 ring-offset-[var(--wireline-color-canvas-default)]"
        />
      ) : null}
    </span>
  );
}
