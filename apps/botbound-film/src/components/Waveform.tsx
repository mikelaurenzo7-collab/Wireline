import {useCurrentFrame} from 'remotion';

export const Waveform: React.FC<{
  width: number;
  height: number;
  color?: string;
  bars?: number;
}> = ({width, height, color = '#A78BFA', bars = 34}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: width / bars / 2.6,
      }}
    >
      {Array.from({length: bars}).map((_, index) => {
        const harmonic = Math.abs(
          Math.sin(frame * 0.19 + index * 0.81) * 0.55 +
            Math.sin(frame * 0.073 + index * 0.34) * 0.45,
        );
        const envelope = 0.24 + 0.76 * Math.sin((index / Math.max(1, bars - 1)) * Math.PI);
        return (
          <div
            key={index}
            style={{
              width: Math.max(3, width / bars / 2),
              height: Math.max(6, height * (0.12 + harmonic * 0.76 * envelope)),
              borderRadius: 999,
              background: color,
              boxShadow: `0 0 ${Math.max(8, height * 0.16)}px ${color}`,
              opacity: 0.58 + harmonic * 0.42,
            }}
          />
        );
      })}
    </div>
  );
};
