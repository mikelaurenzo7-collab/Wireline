import {Img, staticFile} from 'remotion';

export const BrandWordmark: React.FC<{
  fontSize: number;
  justify?: 'flex-start' | 'center';
}> = ({fontSize, justify = 'flex-start'}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: justify,
        fontFamily: 'BotBound Inter Tight, Inter Tight, sans-serif',
        fontSize,
        fontWeight: 800,
        letterSpacing: '-0.055em',
        lineHeight: 0.88,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{color: '#F8F7FC'}}>Bot</span>
      <span style={{color: '#8B5CF6'}}>Bound</span>
    </div>
  );
};

export const BotMark: React.FC<{
  size: number;
  opacity?: number;
  image?: 'operator' | 'app';
}> = ({size, opacity = 1, image = 'operator'}) => {
  return (
    <Img
      src={staticFile(
        image === 'operator'
          ? 'brand/botbound-operator-primary.png'
          : 'brand/botbound-app-icon.png',
      )}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        opacity,
      }}
    />
  );
};

export const BrandLockup: React.FC<{
  markSize: number;
  wordmarkSize: number;
  centered?: boolean;
}> = ({markSize, wordmarkSize, centered = false}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: centered ? 'center' : 'flex-start',
        gap: markSize * 0.13,
      }}
    >
      <BotMark size={markSize} />
      <BrandWordmark fontSize={wordmarkSize} />
    </div>
  );
};

export const Eyebrow: React.FC<{children: React.ReactNode; fontSize: number}> = ({
  children,
  fontSize,
}) => {
  return (
    <div
      style={{
        color: '#B9A4FF',
        fontFamily: 'BotBound Plex Mono, IBM Plex Mono, monospace',
        fontSize,
        fontWeight: 700,
        letterSpacing: '0.18em',
        lineHeight: 1,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
};
