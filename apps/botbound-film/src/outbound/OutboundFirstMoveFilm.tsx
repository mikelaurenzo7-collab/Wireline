import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { BookScene } from "./scenes/BookScene";
import { CallScene } from "./scenes/CallScene";
import { FindScene } from "./scenes/FindScene";
import { OutboundEndCard } from "./scenes/OutboundEndCard";

export type OutboundFirstMoveFilmProps = {
  variant: "vertical15" | "square10" | "vertical6";
};

const OutboundSoundtrack: React.FC<{ bookFrame: number; chimeDuration: number }> = ({
  bookFrame,
  chimeDuration,
}) => {
  const { durationInFrames } = useVideoConfig();

  return (
    <>
      <Audio
        src={staticFile("audio/botbound-score.mp3")}
        volume={(audioFrame) =>
          interpolate(
            audioFrame,
            [0, 20, Math.max(21, durationInFrames - 36), durationInFrames - 1],
            [0, 0.28, 0.28, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )
        }
      />
      <Sequence from={bookFrame} durationInFrames={chimeDuration} layout="none">
        <Audio src={staticFile("audio/transfer-chime-approved.wav")} volume={0.58} />
      </Sequence>
    </>
  );
};

const FifteenVertical: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#06060A" }}>
      <OutboundSoundtrack bookFrame={214} chimeDuration={52} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={112} name="Find the lead">
          <FindScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={112} name="Make the call">
          <CallScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={112} name="Book the next step">
          <BookScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={150} name="Brand close">
          <OutboundEndCard />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

const TenSquare: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#06060A" }}>
      <OutboundSoundtrack bookFrame={132} chimeDuration={46} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={70} name="Find the lead">
          <FindScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 8 })}
        />
        <TransitionSeries.Sequence durationInFrames={70} name="Make the call">
          <CallScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 8 })}
        />
        <TransitionSeries.Sequence durationInFrames={70} name="Book the next step">
          <BookScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 8 })}
        />
        <TransitionSeries.Sequence durationInFrames={114} name="Brand close">
          <OutboundEndCard />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

const SixVertical: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#06060A" }}>
      <OutboundSoundtrack bookFrame={82} chimeDuration={34} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={45} name="Find the lead">
          <FindScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 4 })}
        />
        <TransitionSeries.Sequence durationInFrames={45} name="Make the call">
          <CallScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 4 })}
        />
        <TransitionSeries.Sequence durationInFrames={45} name="Book the next step">
          <BookScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 4 })}
        />
        <TransitionSeries.Sequence durationInFrames={57} name="Brand close">
          <OutboundEndCard fast />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export const OutboundFirstMoveFilm: React.FC<OutboundFirstMoveFilmProps> = ({ variant }) => {
  if (variant === "square10") return <TenSquare />;
  if (variant === "vertical6") return <SixVertical />;
  return <FifteenVertical />;
};
