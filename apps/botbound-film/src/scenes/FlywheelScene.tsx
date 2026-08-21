import {
  Easing,
  Interactive,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {BotMark, Eyebrow} from '../components/Brand';
import {FilmBackground} from '../components/FilmBackground';

const steps = [
  {label: 'Build', detail: 'Your Bot'},
  {label: 'Train', detail: 'Your voice'},
  {label: 'Launch', detail: 'Your number'},
  {label: 'Improve', detail: 'Every call'},
];

export const FlywheelScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const scaleFactor = width / 1920;
  const trackWidth = width * 0.72;

  return (
    <FilmBackground variant="obsidian">
      <div
        style={{
          position: 'absolute',
          left: width * 0.065,
          right: width * 0.065,
          top: height * 0.105,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              opacity: interpolate(frame, [0, 12], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          >
            <Eyebrow fontSize={27 * scaleFactor}>The learning loop</Eyebrow>
          </div>
          <Interactive.Div
            name="Flywheel headline"
            style={{
              marginTop: 30 * scaleFactor,
              color: '#F8F7FC',
              fontFamily: 'BotBound Inter Tight, Inter Tight, sans-serif',
              fontSize: 100 * scaleFactor,
              fontWeight: 800,
              letterSpacing: '-0.058em',
              lineHeight: 0.92,
              opacity: interpolate(frame, [6, 24], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(frame, [6, 24], ['0px 54px', '0px 0px'], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            Better every call.
          </Interactive.Div>
        </div>
        <div
          style={{
            marginRight: 18 * scaleFactor,
            opacity: interpolate(frame, [12, 30], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            scale: spring({frame: frame - 8, fps, config: {damping: 18, stiffness: 120, mass: 0.7}}),
            filter: `drop-shadow(0 0 ${54 * scaleFactor}px rgba(139,92,246,0.34))`,
          }}
        >
          <BotMark size={230 * scaleFactor} />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: width * 0.14,
          top: height * 0.56,
          width: trackWidth,
          height: 8 * scaleFactor,
          borderRadius: 999,
          background: 'rgba(196,181,253,0.18)',
          overflow: 'visible',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: trackWidth,
            height: 8 * scaleFactor,
            borderRadius: 999,
            background: 'linear-gradient(90deg, #6D3DEB, #A78BFA, #C4B5FD)',
            boxShadow: '0 0 38px rgba(139,92,246,0.7)',
            scale: `${interpolate(frame, [18, 92], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            })} 1`,
            transformOrigin: 'left center',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -16 * scaleFactor,
            left: interpolate(frame, [18, 92], [0, trackWidth - 40 * scaleFactor], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            width: 40 * scaleFactor,
            height: 40 * scaleFactor,
            borderRadius: '50%',
            background: '#F8F7FC',
            border: `${5 * scaleFactor}px solid #8B5CF6`,
            boxShadow: `0 0 ${54 * scaleFactor}px rgba(167,139,250,0.95)`,
          }}
        />
      </div>

      {steps.map((step, index) => {
        const left = width * 0.14 + (trackWidth * index) / 3;
        const at = 20 + index * 20;
        return (
          <div
            key={step.label}
            style={{
              position: 'absolute',
              left,
              top: height * 0.56,
              translate: '-50% -50%',
              opacity: interpolate(frame, [at, at + 14], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
              scale: spring({
                frame: frame - at,
                fps,
                config: {damping: 17, stiffness: 140, mass: 0.6},
              }),
            }}
          >
            <div
              style={{
                width: 86 * scaleFactor,
                height: 86 * scaleFactor,
                display: 'grid',
                placeItems: 'center',
                borderRadius: '50%',
                color: '#08080D',
                background: '#F8F7FC',
                border: `${6 * scaleFactor}px solid #8B5CF6`,
                boxShadow: '0 18px 70px rgba(0,0,0,0.34)',
                fontFamily: 'BotBound Plex Mono, monospace',
                fontSize: 22 * scaleFactor,
                fontWeight: 700,
              }}
            >
              0{index + 1}
            </div>
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 118 * scaleFactor,
                width: 280 * scaleFactor,
                translate: '-50% 0px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  color: '#F8F7FC',
                  fontFamily: 'BotBound Inter Tight, sans-serif',
                  fontSize: 38 * scaleFactor,
                  fontWeight: 800,
                  letterSpacing: '-0.045em',
                }}
              >
                {step.label}
              </div>
              <div
                style={{
                  marginTop: 10 * scaleFactor,
                  color: '#9E9BA8',
                  fontFamily: 'BotBound Inter, sans-serif',
                  fontSize: 21 * scaleFactor,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                }}
              >
                {step.detail}
              </div>
            </div>
          </div>
        );
      })}
    </FilmBackground>
  );
};
