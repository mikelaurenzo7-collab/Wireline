import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { ConversationScene } from "./scenes/ConversationScene";
import { EndCardScene } from "./scenes/EndCardScene";
import { FlywheelScene } from "./scenes/FlywheelScene";
import { HandsFullScene } from "./scenes/HandsFullScene";
import { LiveAnswerScene } from "./scenes/LiveAnswerScene";
import { OutcomeScene } from "./scenes/OutcomeScene";
import { SignalAwakensScene } from "./scenes/SignalAwakensScene";

export type SecondRingFilmProps = {
  variant: "master30" | "horizontal15" | "bumper6" | "vertical15" | "square10";
};

const Soundtrack: React.FC<{ secondRingFrame: number; scoreOffset?: number }> = ({
  secondRingFrame,
  scoreOffset = 0,
}) => {
  const { durationInFrames, fps } = useVideoConfig();

  return (
    <>
      <Audio
        src={staticFile("audio/botbound-score.mp3")}
        trimBefore={scoreOffset * fps}
        volume={(audioFrame) =>
          interpolate(
            audioFrame,
            [0, 24, durationInFrames - 42, durationInFrames - 1],
            [0, 0.34, 0.34, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )
        }
      />
      <Audio src={staticFile("audio/phone-ring.wav")} volume={0.33} />
      <Sequence from={Math.max(22, secondRingFrame - 24)} durationInFrames={30} layout="none">
        <Audio src={staticFile("audio/phone-ring.wav")} volume={0.42} />
      </Sequence>
      <Sequence from={secondRingFrame} durationInFrames={56} layout="none">
        <Audio src={staticFile("audio/transfer-chime-approved.wav")} volume={0.78} />
      </Sequence>
    </>
  );
};

const Master30: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#08080D" }}>
      <Soundtrack secondRingFrame={66} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={78} name="Hands full">
          <HandsFullScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={102} name="The second ring">
          <SignalAwakensScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={126} name="Live answer">
          <LiveAnswerScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={192} name="Conversation">
          <ConversationScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={222} name="Outcome">
          <OutcomeScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={132} name="Your Bots. Your Rules.">
          <FlywheelScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={120} name="Brand close">
          <EndCardScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

const FifteenSecondCut: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#08080D" }}>
      <Soundtrack secondRingFrame={60} scoreOffset={15} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={70} name="Hands full">
          <HandsFullScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 10 })}
        />
        <TransitionSeries.Sequence durationInFrames={82} name="The second ring">
          <SignalAwakensScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 10 })}
        />
        <TransitionSeries.Sequence durationInFrames={118} name="Live answer">
          <LiveAnswerScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 10 })}
        />
        <TransitionSeries.Sequence durationInFrames={130} name="Outcome">
          <OutcomeScene compact />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 10 })}
        />
        <TransitionSeries.Sequence durationInFrames={90} name="Brand close">
          <EndCardScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

const SixSecondBumper: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#08080D" }}>
      <Soundtrack secondRingFrame={42} scoreOffset={24} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={50} name="Still busy">
          <HandsFullScene bumper />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 8 })}
        />
        <TransitionSeries.Sequence durationInFrames={56} name="Answered">
          <SignalAwakensScene bumper />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 8 })}
        />
        <TransitionSeries.Sequence durationInFrames={90} name="Brand close">
          <EndCardScene bumper />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

const TenSecondSquareCut: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#08080D" }}>
      <Soundtrack secondRingFrame={46} scoreOffset={20} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={52} name="Still busy">
          <HandsFullScene bumper />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 10 })}
        />
        <TransitionSeries.Sequence durationInFrames={70} name="The second ring">
          <SignalAwakensScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 10 })}
        />
        <TransitionSeries.Sequence durationInFrames={98} name="Outcome">
          <OutcomeScene compact />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 10 })}
        />
        <TransitionSeries.Sequence durationInFrames={110} name="Brand close">
          <EndCardScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export const SecondRingFilm: React.FC<SecondRingFilmProps> = ({ variant }) => {
  if (variant === "master30") return <Master30 />;
  if (variant === "bumper6") return <SixSecondBumper />;
  if (variant === "square10") return <TenSecondSquareCut />;
  return <FifteenSecondCut />;
};
