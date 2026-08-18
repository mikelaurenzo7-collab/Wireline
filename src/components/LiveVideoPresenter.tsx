/**
 * LiveVideoPresenter — retired compatibility shell.
 *
 * LiveAvatar / HeyGen WebRTC lip-sync is retired. Historical imports resolve
 * to the same role-agnostic Bot Mark used by the active product; there is no
 * video stage, presenter chrome, metered-session UI, or provider asset here.
 */
import BotMark from "./BotMark";

export type LiveVideoPresenterHandle = {
  feedPcmDelta: (base64Pcm: string) => void;
  flushPcm: () => void;
  stop: () => Promise<void>;
};

type Props = {
  seed?: string;
  speaking?: boolean;
  className?: string;
  layout?: "portrait" | "stage";
};

export default function LiveVideoPresenter({
  seed,
  speaking = false,
  className,
  layout = "stage",
}: Props) {
  const size = layout === "stage" ? 96 : 64;
  return (
    <div
      className={`grid place-items-center rounded-[var(--wireline-radius-xl)] border border-border bg-card p-4 ${className ?? ""}`.trim()}
      data-retired-live-video="true"
    >
      <BotMark
        seed={seed || "bot"}
        name="Bot"
        active={speaking}
        size={size}
        title="Bot mark"
      />
    </div>
  );
}
