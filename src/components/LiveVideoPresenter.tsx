/**
 * LiveVideoPresenter — identity badge only.
 *
 * LiveAvatar / HeyGen WebRTC lip-sync is retired. This surface renders the
 * deterministic Wireline identity badge. Video files and clip scripts are not
 * offered.
 */
import AgentFace from "./AgentFace";

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
  return (
    <div
      className={
        layout === "stage"
          ? `wl-presence-live wl-presence-live--stage ${className ?? ""}`.trim()
          : `wl-presence-live ${className ?? ""}`.trim()
      }
    >
      <AgentFace seed={seed || "agent"} speaking={speaking} size={160} />
    </div>
  );
}
