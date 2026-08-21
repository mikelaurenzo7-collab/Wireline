import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const sampleRate = 48_000;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (value) => {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};

const makeWav = ({durationSeconds, sample}) => {
  const frames = Math.round(durationSeconds * sampleRate);
  const channels = 2;
  const bytesPerSample = 2;
  const dataBytes = frames * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < frames; i += 1) {
    const time = i / sampleRate;
    const [left, right] = sample(time, i);
    buffer.writeInt16LE(Math.round(clamp(left, -1, 1) * 32767), 44 + i * 4);
    buffer.writeInt16LE(Math.round(clamp(right, -1, 1) * 32767), 46 + i * 4);
  }

  return buffer;
};

let randomState = 0x4b6f7442;
const seededNoise = () => {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return ((randomState >>> 0) / 0xffffffff) * 2 - 1;
};

let noiseMemory = 0;
const score = makeWav({
  durationSeconds: 30,
  sample: (time) => {
    const fadeIn = smoothstep(time / 1.5);
    const fadeOut = smoothstep((30 - time) / 2.4);
    const master = fadeIn * fadeOut;
    const act = time < 5.2 ? 0 : time < 15 ? 1 : time < 22 ? 2 : time < 26 ? 3 : 4;
    const roots = [43.65, 65.41, 77.78, 87.31, 65.41];
    const root = roots[act];
    const pulse = 0.62 + 0.38 * Math.pow(Math.max(0, Math.sin(Math.PI * 2 * time * 0.5)), 4);
    const pad =
      Math.sin(Math.PI * 2 * root * time) * 0.26 +
      Math.sin(Math.PI * 2 * root * 1.5 * time + 0.4) * 0.19 +
      Math.sin(Math.PI * 2 * root * 2 * time + 1.2) * 0.12 +
      Math.sin(Math.PI * 2 * root * 3 * time + 0.7) * 0.055;
    const highBloom = act >= 1
      ? Math.sin(Math.PI * 2 * (root * 6) * time + Math.sin(time * 0.7)) * 0.035
      : 0;
    const ending = smoothstep((time - 25.6) / 2.6);
    const resolve = ending * (
      Math.sin(Math.PI * 2 * 261.63 * time) * 0.055 +
      Math.sin(Math.PI * 2 * 392 * time + 0.8) * 0.045
    );
    noiseMemory = noiseMemory * 0.993 + seededNoise() * 0.007;
    const air = noiseMemory * 0.045;
    const sectionHits = [2.2, 5.2, 15, 22, 26].reduce((sum, point) => {
      const elapsed = time - point;
      if (elapsed < 0 || elapsed > 1.8) return sum;
      return sum + Math.sin(Math.PI * 2 * (48 - elapsed * 13) * elapsed) * Math.exp(-elapsed * 3.2) * 0.13;
    }, 0);
    const left = (pad * pulse + highBloom + resolve + air + sectionHits) * master * 0.62;
    const rightPad =
      Math.sin(Math.PI * 2 * root * 1.003 * time + 0.11) * 0.25 +
      Math.sin(Math.PI * 2 * root * 1.503 * time + 0.55) * 0.18 +
      Math.sin(Math.PI * 2 * root * 2.006 * time + 1.35) * 0.115;
    const right = (rightPad * pulse + highBloom * 0.92 + resolve + air * 0.9 + sectionHits) * master * 0.62;
    return [left, right];
  },
});

const phoneRing = makeWav({
  durationSeconds: 0.78,
  sample: (time) => {
    const attack = smoothstep(time / 0.018);
    const release = smoothstep((0.78 - time) / 0.16);
    const tremolo = 0.55 + 0.45 * Math.sin(Math.PI * 2 * 18 * time);
    const body =
      Math.sin(Math.PI * 2 * 440 * time) * 0.44 +
      Math.sin(Math.PI * 2 * 480 * time + 0.15) * 0.38 +
      Math.sin(Math.PI * 2 * 960 * time) * 0.08;
    const sampleValue = body * tremolo * attack * release * 0.38;
    return [sampleValue, sampleValue * 0.96];
  },
});

await mkdir(join(process.cwd(), 'public', 'audio'), {recursive: true});
await Promise.all([
  writeFile(join(process.cwd(), 'public', 'audio', 'botbound-score.wav'), score),
  writeFile(join(process.cwd(), 'public', 'audio', 'phone-ring.wav'), phoneRing),
]);

console.log('Generated deterministic 48 kHz stereo score and phone ring.');
