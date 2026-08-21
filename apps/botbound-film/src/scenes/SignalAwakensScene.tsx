import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {BotMark, Eyebrow} from '../components/Brand';
import {FilmBackground, VioletSignalRings} from '../components/FilmBackground';

export const SignalAwakensScene: React.FC<{bumper?: boolean}> = ({bumper = false}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const isVertical = height > width;
  const scaleFactor = width / 1920;

  return (
    <FilmBackground variant="obsidian">
      <AbsoluteFill>
        <VioletSignalRings
          centerX={isVertical ? '50%' : '73%'}
          centerY={isVertical ? '43%' : '50%'}
          size={isVertical ? width * 0.48 : width * 0.23}
        />
        <div
          style={{
            position: 'absolute',
            left: isVertical ? '50%' : '73%',
            top: isVertical ? '43%' : '50%',
            translate: '-50% -50%',
            scale: spring({frame, fps, config: {damping: 16, mass: 0.7, stiffness: 120}}),
            filter: `drop-shadow(0 0 ${80 * Math.max(1, scaleFactor)}px rgba(139,92,246,0.45))`,
          }}
        >
          <BotMark size={isVertical ? width * 0.68 : width * 0.35} />
        </div>

        <div
          style={{
            position: 'absolute',
            left: isVertical ? width * 0.09 : width * 0.072,
            right: isVertical ? width * 0.09 : width * 0.51,
            top: isVertical ? height * 0.66 : height * 0.26,
          }}
        >
          <div
            style={{
              opacity: interpolate(frame, [6, 20], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          >
            <Eyebrow fontSize={isVertical ? 48 : 28 * scaleFactor}>
              The second ring
            </Eyebrow>
          </div>
          <Interactive.Div
            name="Second ring headline"
            style={{
              marginTop: isVertical ? 34 : 34 * scaleFactor,
              color: '#F8F7FC',
              fontFamily: 'BotBound Inter Tight, Inter Tight, sans-serif',
              fontSize: isVertical ? 152 : 108 * scaleFactor,
              fontWeight: 800,
              letterSpacing: '-0.058em',
              lineHeight: 0.91,
              opacity: interpolate(frame, [12, 30], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(frame, [12, 30], ['0px 62px', '0px 0px'], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            {bumper ? 'Answered.' : 'That’s where BotBound begins.'}
          </Interactive.Div>
          {!bumper ? (
            <Interactive.Div
              name="Second ring support"
              style={{
                marginTop: isVertical ? 38 : 36 * scaleFactor,
                maxWidth: isVertical ? width * 0.78 : width * 0.42,
                color: '#C7CCD6',
                fontFamily: 'BotBound Inter, Inter, sans-serif',
                fontSize: isVertical ? 54 : 36 * scaleFactor,
                fontWeight: 400,
                lineHeight: 1.28,
                letterSpacing: '-0.022em',
                opacity: interpolate(frame, [28, 48], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
              }}
            >
              Your AI phone agent answers in your voice, while you stay in the work.
            </Interactive.Div>
          ) : null}
        </div>

        <div
          style={{
            position: 'absolute',
            top: isVertical ? height * 0.06 : height * 0.085,
            right: isVertical ? width * 0.08 : width * 0.06,
            display: 'flex',
            alignItems: 'center',
            gap: 18 * Math.max(1, scaleFactor),
            padding: isVertical ? '22px 30px' : `${14 * scaleFactor}px ${20 * scaleFactor}px`,
            border: '1px solid rgba(196,181,253,0.3)',
            borderRadius: 999,
            background: 'rgba(8,8,13,0.58)',
            boxShadow: '0 18px 70px rgba(0,0,0,0.28)',
            opacity: interpolate(frame, [22, 38], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div
            style={{
              width: isVertical ? 18 : 12 * scaleFactor,
              height: isVertical ? 18 : 12 * scaleFactor,
              borderRadius: '50%',
              background: '#A78BFA',
              boxShadow: '0 0 28px #8B5CF6',
            }}
          />
          <span
            style={{
              color: '#F8F7FC',
              fontFamily: 'BotBound Plex Mono, monospace',
              fontSize: isVertical ? 34 : 18 * scaleFactor,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Call connected
          </span>
        </div>
      </AbsoluteFill>
    </FilmBackground>
  );
};
