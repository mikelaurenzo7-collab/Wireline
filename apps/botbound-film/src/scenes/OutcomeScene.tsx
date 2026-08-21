import {
  Easing,
  Interactive,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Eyebrow} from '../components/Brand';
import {FilmBackground} from '../components/FilmBackground';

const outcomes = [
  {code: '01', label: 'Appointment booked', detail: 'Friday · 4:30 PM', accent: '#8B5CF6'},
  {code: '02', label: 'Confirmation sent', detail: 'SMS delivered', accent: '#A78BFA'},
  {code: '03', label: 'Owner updated', detail: 'Without stopping the work', accent: '#C4B5FD'},
];

export const OutcomeScene: React.FC<{compact?: boolean}> = ({compact = false}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const isVertical = height > width;
  const scaleFactor = width / 1920;

  return (
    <FilmBackground variant="platinum">
      <div
        style={{
          position: 'absolute',
          left: isVertical ? width * 0.08 : width * 0.065,
          right: isVertical ? width * 0.08 : width * 0.065,
          top: isVertical ? height * 0.065 : height * 0.1,
        }}
      >
        <div
          style={{
            opacity: interpolate(frame, [0, 14], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <Eyebrow fontSize={isVertical ? 48 : 27 * scaleFactor}>Call complete · Work moving</Eyebrow>
        </div>
        <Interactive.Div
          name="Outcome headline"
          style={{
            marginTop: isVertical ? 36 : 30 * scaleFactor,
            maxWidth: isVertical ? width * 0.84 : width * 0.72,
            color: '#08080D',
            fontFamily: 'BotBound Inter Tight, Inter Tight, sans-serif',
            fontSize: isVertical ? 152 : 106 * scaleFactor,
            fontWeight: 800,
            letterSpacing: '-0.06em',
            lineHeight: 0.91,
            opacity: interpolate(frame, [7, 25], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [7, 25], ['0px 58px', '0px 0px'], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Booked. Confirmed. Logged.
        </Interactive.Div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: isVertical ? width * 0.08 : width * 0.065,
          right: isVertical ? width * 0.08 : width * 0.065,
          top: isVertical ? height * 0.31 : height * 0.42,
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          gap: isVertical ? 42 : 34 * scaleFactor,
        }}
      >
        {outcomes.map((outcome, index) => {
          const at = index * (compact ? 15 : 22);
          return (
            <div
              key={outcome.code}
              style={{
                position: 'relative',
                flex: 1,
                minHeight: isVertical ? height * 0.15 : height * 0.31,
                padding: isVertical ? '48px 50px' : `${42 * scaleFactor}px`,
                borderRadius: isVertical ? 42 : 34 * scaleFactor,
                background: '#FFFFFF',
                border: `${Math.max(2, 1.2 * scaleFactor)}px solid rgba(8,8,13,0.09)`,
                boxShadow: '0 40px 100px rgba(18,10,39,0.12)',
                overflow: 'hidden',
                opacity: interpolate(frame, [at, at + 14], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
                scale: spring({
                  frame: frame - at,
                  fps,
                  config: {damping: 17, stiffness: 130, mass: 0.7},
                }),
                translate: interpolate(frame, [at, at + 22], ['0px 64px', '0px 0px'], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: isVertical ? 12 : 8 * scaleFactor,
                  background: outcome.accent,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    color: '#6D3DEB',
                    fontFamily: 'BotBound Plex Mono, monospace',
                    fontSize: isVertical ? 28 : 16 * scaleFactor,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                  }}
                >
                  {outcome.code}
                </div>
                <div
                  style={{
                    width: isVertical ? 54 : 34 * scaleFactor,
                    height: isVertical ? 54 : 34 * scaleFactor,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '50%',
                    color: '#FFFFFF',
                    background: outcome.accent,
                    fontFamily: 'BotBound Inter, sans-serif',
                    fontSize: isVertical ? 31 : 19 * scaleFactor,
                    fontWeight: 700,
                  }}
                >
                  ✓
                </div>
              </div>
              <div
                style={{
                  marginTop: isVertical ? 28 : 36 * scaleFactor,
                  color: '#08080D',
                  fontFamily: 'BotBound Inter Tight, Inter Tight, sans-serif',
                  fontSize: isVertical ? 58 : 38 * scaleFactor,
                  fontWeight: 800,
                  letterSpacing: '-0.045em',
                  lineHeight: 1.05,
                }}
              >
                {outcome.label}
              </div>
              <div
                style={{
                  marginTop: isVertical ? 16 : 18 * scaleFactor,
                  color: '#565361',
                  fontFamily: 'BotBound Inter, Inter, sans-serif',
                  fontSize: isVertical ? 34 : 22 * scaleFactor,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                }}
              >
                {outcome.detail}
              </div>
            </div>
          );
        })}
      </div>

      <Interactive.Div
        name="Outcome close"
        style={{
          position: 'absolute',
          left: isVertical ? width * 0.08 : width * 0.065,
          right: isVertical ? width * 0.08 : width * 0.065,
          bottom: isVertical ? height * 0.055 : height * 0.095,
          color: '#6A6673',
          fontFamily: 'BotBound Inter, Inter, sans-serif',
          fontSize: isVertical ? 42 : 31 * scaleFactor,
          fontWeight: 600,
          letterSpacing: '-0.025em',
          opacity: interpolate(frame, [compact ? 58 : 74, compact ? 78 : 96], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        The customer moves forward. You never leave the work.
      </Interactive.Div>
    </FilmBackground>
  );
};
