import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

export const FilmBackground: React.FC<{
  children?: React.ReactNode;
  variant?: 'obsidian' | 'violet' | 'platinum';
}> = ({children, variant = 'obsidian'}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, width} = useVideoConfig();
  const scaleFactor = width / 1920;

  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        backgroundColor:
          variant === 'platinum' ? '#F5F3FA' : variant === 'violet' ? '#120A27' : '#08080D',
      }}
    >
      {variant !== 'platinum' ? (
        <>
          <div
            style={{
              position: 'absolute',
              width: 980 * scaleFactor,
              height: 980 * scaleFactor,
              top: -420 * scaleFactor,
              right: -160 * scaleFactor,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(139,92,246,0.34) 0%, rgba(109,61,235,0.08) 48%, rgba(8,8,13,0) 72%)',
              filter: `blur(${42 * scaleFactor}px)`,
              opacity: interpolate(frame, [0, durationInFrames - 1], [0.78, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
              translate: interpolate(
                frame,
                [0, durationInFrames - 1],
                ['0px 0px', `${-48 * scaleFactor}px ${54 * scaleFactor}px`],
                {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
              ),
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 700 * scaleFactor,
              height: 700 * scaleFactor,
              bottom: -380 * scaleFactor,
              left: 160 * scaleFactor,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(196,181,253,0.18) 0%, rgba(139,92,246,0.04) 55%, rgba(8,8,13,0) 72%)',
              filter: `blur(${54 * scaleFactor}px)`,
            }}
          />
        </>
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: variant === 'platinum' ? 0.14 : 0.1,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: `${96 * scaleFactor}px ${96 * scaleFactor}px`,
          maskImage: 'radial-gradient(circle at center, black 0%, transparent 72%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            variant === 'platinum'
              ? 'radial-gradient(circle at 50% 40%, transparent 35%, rgba(8,8,13,0.08) 100%)'
              : 'radial-gradient(circle at 50% 42%, transparent 38%, rgba(0,0,0,0.5) 100%)',
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

export const VioletSignalRings: React.FC<{
  centerX: string;
  centerY: string;
  size: number;
}> = ({centerX, centerY, size}) => {
  const frame = useCurrentFrame();

  return (
    <>
      {[0, 11, 22].map((delay) => (
        <div
          key={delay}
          style={{
            position: 'absolute',
            left: centerX,
            top: centerY,
            width: size,
            height: size,
            marginLeft: -size / 2,
            marginTop: -size / 2,
            borderRadius: '50%',
            border: `${Math.max(3, size * 0.008)}px solid rgba(167,139,250,0.82)`,
            boxShadow: '0 0 80px rgba(139,92,246,0.44), inset 0 0 50px rgba(139,92,246,0.15)',
            opacity: interpolate(frame, [delay, delay + 9, delay + 52], [0, 0.86, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            scale: interpolate(frame, [delay, delay + 52], [0.42, 2.25], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        />
      ))}
    </>
  );
};
