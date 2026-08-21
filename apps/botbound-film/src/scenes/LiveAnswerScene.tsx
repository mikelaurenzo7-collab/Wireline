import {
  Easing,
  Img,
  Interactive,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Eyebrow} from '../components/Brand';
import {FilmBackground} from '../components/FilmBackground';
import {Waveform} from '../components/Waveform';

export const LiveAnswerScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const isVertical = height > width;
  const scaleFactor = width / 1920;
  const cardWidth = isVertical ? width * 0.84 : width * 0.48;
  const cardHeight = isVertical ? height * 0.43 : height * 0.73;

  return (
    <FilmBackground variant="obsidian">
      <div
        style={{
          position: 'absolute',
          left: isVertical ? width * 0.09 : width * 0.07,
          right: isVertical ? width * 0.09 : width * 0.54,
          top: isVertical ? height * 0.07 : height * 0.23,
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
          <Eyebrow fontSize={isVertical ? 48 : 28 * scaleFactor}>Live · Your Bot</Eyebrow>
        </div>
        <Interactive.Div
          name="Live answer headline"
          style={{
            marginTop: isVertical ? 32 : 34 * scaleFactor,
            color: '#F8F7FC',
            fontFamily: 'BotBound Inter Tight, Inter Tight, sans-serif',
            fontSize: isVertical ? 154 : 112 * scaleFactor,
            fontWeight: 800,
            letterSpacing: '-0.06em',
            lineHeight: 0.9,
            opacity: interpolate(frame, [7, 25], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [7, 25], ['0px 54px', '0px 0px'], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          BotBound answers.
        </Interactive.Div>
        <Interactive.Div
          name="Live answer support"
          style={{
            marginTop: isVertical ? 34 : 34 * scaleFactor,
            color: '#C7CCD6',
            fontFamily: 'BotBound Inter, Inter, sans-serif',
            fontSize: isVertical ? 54 : 36 * scaleFactor,
            fontWeight: 400,
            letterSpacing: '-0.025em',
            lineHeight: 1.26,
            opacity: interpolate(frame, [22, 42], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          On-brand. On the second ring. Ready to help.
        </Interactive.Div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: isVertical ? width * 0.08 : width * 0.48,
          top: isVertical ? height * 0.45 : height * 0.135,
          width: cardWidth,
          height: cardHeight,
          borderRadius: isVertical ? 58 : 42 * scaleFactor,
          border: `${Math.max(2, 1.2 * scaleFactor)}px solid rgba(196,181,253,0.34)`,
          background: 'linear-gradient(145deg, rgba(28,22,47,0.96), rgba(10,10,17,0.98))',
          boxShadow: '0 60px 170px rgba(0,0,0,0.52), 0 0 130px rgba(109,61,235,0.16)',
          overflow: 'hidden',
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          scale: spring({frame, fps, config: {damping: 18, stiffness: 110, mass: 0.8}}),
          translate: isVertical
            ? interpolate(frame, [0, 22], ['0px 90px', '0px 0px'], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              })
            : interpolate(frame, [0, 22], ['100px 0px', '0px 0px'], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
        }}
      >
        <div
          style={{
            height: isVertical ? 170 : 112 * scaleFactor,
            display: 'flex',
            alignItems: 'center',
            padding: isVertical ? '0 52px' : `0 ${42 * scaleFactor}px`,
            borderBottom: '1px solid rgba(196,181,253,0.16)',
            background: 'rgba(255,255,255,0.025)',
          }}
        >
          <Img
            src={staticFile('brand/botbound-app-icon.png')}
            style={{
              width: isVertical ? 92 : 64 * scaleFactor,
              height: isVertical ? 92 : 64 * scaleFactor,
              borderRadius: isVertical ? 24 : 17 * scaleFactor,
            }}
          />
          <div style={{marginLeft: isVertical ? 28 : 22 * scaleFactor}}>
            <div
              style={{
                color: '#F8F7FC',
                fontFamily: 'BotBound Inter Tight, sans-serif',
                fontSize: isVertical ? 40 : 27 * scaleFactor,
                fontWeight: 700,
                letterSpacing: '-0.03em',
              }}
            >
              Front Desk Bot
            </div>
            <div
              style={{
                marginTop: 7,
                color: '#A78BFA',
                fontFamily: 'BotBound Plex Mono, monospace',
                fontSize: isVertical ? 25 : 15 * scaleFactor,
                fontWeight: 700,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
              }}
            >
              Live · 00:{String(Math.min(59, 4 + Math.floor(frame / 30))).padStart(2, '0')}
            </div>
          </div>
          <div
            style={{
              marginLeft: 'auto',
              padding: isVertical ? '13px 23px' : `${9 * scaleFactor}px ${16 * scaleFactor}px`,
              borderRadius: 999,
              color: '#08080D',
              background: '#A78BFA',
              fontFamily: 'BotBound Plex Mono, monospace',
              fontSize: isVertical ? 24 : 14 * scaleFactor,
              fontWeight: 700,
              letterSpacing: '0.09em',
            }}
          >
            ANSWERED
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: isVertical ? 58 : 44 * scaleFactor,
          }}
        >
          <Waveform
            width={isVertical ? cardWidth * 0.78 : cardWidth * 0.76}
            height={isVertical ? 150 : 100 * scaleFactor}
          />
        </div>

        <div
          style={{
            margin: isVertical ? '56px 52px 0' : `${44 * scaleFactor}px ${44 * scaleFactor}px 0`,
            padding: isVertical ? '36px 40px' : `${28 * scaleFactor}px ${32 * scaleFactor}px`,
            borderRadius: isVertical ? 32 : 24 * scaleFactor,
            background: 'rgba(139,92,246,0.16)',
            border: '1px solid rgba(167,139,250,0.26)',
            opacity: interpolate(frame, [22, 42], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div
            style={{
              color: '#B9A4FF',
              fontFamily: 'BotBound Plex Mono, monospace',
              fontSize: isVertical ? 24 : 15 * scaleFactor,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            BotBound
          </div>
          <div
            style={{
              marginTop: isVertical ? 18 : 13 * scaleFactor,
              color: '#F8F7FC',
              fontFamily: 'BotBound Inter, Inter, sans-serif',
              fontSize: isVertical ? 42 : 29 * scaleFactor,
              fontWeight: 600,
              lineHeight: 1.3,
              letterSpacing: '-0.022em',
            }}
          >
            “Thanks for calling Northstar Bakery. How can I help?”
          </div>
        </div>
      </div>
    </FilmBackground>
  );
};
