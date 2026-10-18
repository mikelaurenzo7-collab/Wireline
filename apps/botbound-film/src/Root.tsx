import { Composition } from "remotion";
import {
  CinematicCallCampaign,
  CinematicCallDoubleFeature,
} from "./campaign-call/CinematicCallCampaign";
import { BotBoundLogoCall } from "./logo-call/BotBoundLogoCall";
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
      <Composition
        id="BotBound-LogoCall-8s-Square"
        component={BotBoundLogoCall}
        durationInFrames={240}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{ variant: "square" }}
      />
      <Composition
        id="BotBound-LogoCall-8s-Vertical"
        component={BotBoundLogoCall}
        durationInFrames={240}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ variant: "vertical" }}
      />
      <Composition
        id="BotBound-Cinematic-Inbound-12s-Horizontal"
        component={CinematicCallCampaign}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ direction: "inbound", format: "horizontal" }}
      />
      <Composition
        id="BotBound-Cinematic-Inbound-12s-Vertical"
        component={CinematicCallCampaign}
        durationInFrames={360}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ direction: "inbound", format: "vertical" }}
      />
      <Composition
        id="BotBound-Cinematic-Inbound-12s-Square"
        component={CinematicCallCampaign}
        durationInFrames={360}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{ direction: "inbound", format: "square" }}
      />
      <Composition
        id="BotBound-Cinematic-Outbound-12s-Horizontal"
        component={CinematicCallCampaign}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ direction: "outbound", format: "horizontal" }}
      />
      <Composition
        id="BotBound-Cinematic-Outbound-12s-Vertical"
        component={CinematicCallCampaign}
        durationInFrames={360}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ direction: "outbound", format: "vertical" }}
      />
      <Composition
        id="BotBound-Cinematic-Outbound-12s-Square"
        component={CinematicCallCampaign}
        durationInFrames={360}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{ direction: "outbound", format: "square" }}
      />
      <Composition
        id="BotBound-Cinematic-DoubleFeature-24s-Horizontal"
        component={CinematicCallDoubleFeature}
        durationInFrames={720}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ format: "horizontal" }}
      />
    </>
  );
};
