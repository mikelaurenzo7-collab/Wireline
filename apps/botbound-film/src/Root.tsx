import { Composition } from "remotion";
import { OutboundFirstMoveFilm } from "./outbound/OutboundFirstMoveFilm";
import { SecondRingFilm } from "./SecondRingFilm";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BotBound-SecondRing-30s-4K"
        component={SecondRingFilm}
        durationInFrames={900}
        fps={30}
        width={3840}
        height={2160}
        defaultProps={{ variant: "master30" }}
      />
      <Composition
        id="BotBound-SecondRing-15s-4K"
        component={SecondRingFilm}
        durationInFrames={450}
        fps={30}
        width={3840}
        height={2160}
        defaultProps={{ variant: "horizontal15" }}
      />
      <Composition
        id="BotBound-SecondRing-6s-4K"
        component={SecondRingFilm}
        durationInFrames={180}
        fps={30}
        width={3840}
        height={2160}
        defaultProps={{ variant: "bumper6" }}
      />
      <Composition
        id="BotBound-SecondRing-15s-Vertical-4K"
        component={SecondRingFilm}
        durationInFrames={450}
        fps={30}
        width={2160}
        height={3840}
        defaultProps={{ variant: "vertical15" }}
      />
      <Composition
        id="BotBound-SecondRing-6s-Vertical-4K"
        component={SecondRingFilm}
        durationInFrames={180}
        fps={30}
        width={2160}
        height={3840}
        defaultProps={{ variant: "bumper6" }}
      />
      <Composition
        id="BotBound-SecondRing-10s-Square-4K"
        component={SecondRingFilm}
        durationInFrames={300}
        fps={30}
        width={2160}
        height={2160}
        defaultProps={{ variant: "square10" }}
      />
      <Composition
        id="BotBound-FirstMove-15s-Vertical"
        component={OutboundFirstMoveFilm}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ variant: "vertical15" }}
      />
      <Composition
        id="BotBound-FirstMove-10s-Square"
        component={OutboundFirstMoveFilm}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{ variant: "square10" }}
      />
      <Composition
        id="BotBound-FirstMove-6s-Vertical"
        component={OutboundFirstMoveFilm}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ variant: "vertical6" }}
      />
    </>
  );
};
