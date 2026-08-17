export const XAI_BROWSER_PCM_RATE_HZ = 24_000;
export const XAI_BROWSER_PCM_CHUNK_SAMPLES = 2_400;

function clampSample(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

function appendFloat32(left: Float32Array, right: Float32Array): Float32Array {
  if (!left.length) return new Float32Array(right);
  if (!right.length) return new Float32Array(left);
  const combined = new Float32Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
}

export function pcm16LeToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function base64Pcm16LeToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const output = new Float32Array(pcm.length);
  for (let index = 0; index < pcm.length; index += 1) {
    output[index] = pcm[index] / (pcm[index] < 0 ? 0x8000 : 0x7fff);
  }
  return output;
}

/**
 * Stateful mono resampler + PCM16 chunker for xAI browser realtime.
 *
 * Browsers may ignore AudioContext/getUserMedia sample-rate requests and expose
 * the hardware rate instead. This class uses the context's actual rate,
 * preserves interpolation state across callbacks, and emits exact 100 ms
 * chunks at xAI's required 24 kHz PCM16 format.
 */
export class XAIStreamingPcmEncoder {
  private readonly sourceRateHz: number;
  private readonly targetRateHz: number;
  private readonly chunkSamples: number;
  private readonly sourceStep: number;
  private sourceTail = new Float32Array(0);
  private sourcePosition = 0;
  private chunk: Int16Array;
  private chunkLength = 0;

  constructor(input: {
    sourceRateHz: number;
    targetRateHz?: number;
    chunkSamples?: number;
  }) {
    if (!Number.isFinite(input.sourceRateHz) || input.sourceRateHz <= 0) {
      throw new Error("A valid browser source sample rate is required.");
    }
    this.sourceRateHz = input.sourceRateHz;
    this.targetRateHz = input.targetRateHz ?? XAI_BROWSER_PCM_RATE_HZ;
    this.chunkSamples = input.chunkSamples ?? XAI_BROWSER_PCM_CHUNK_SAMPLES;
    if (!Number.isFinite(this.targetRateHz) || this.targetRateHz <= 0) {
      throw new Error("A valid target sample rate is required.");
    }
    if (!Number.isInteger(this.chunkSamples) || this.chunkSamples <= 0) {
      throw new Error("A positive PCM chunk size is required.");
    }
    this.sourceStep = this.sourceRateHz / this.targetRateHz;
    this.chunk = new Int16Array(this.chunkSamples);
  }

  reset(): void {
    this.sourceTail = new Float32Array(0);
    this.sourcePosition = 0;
    this.chunk = new Int16Array(this.chunkSamples);
    this.chunkLength = 0;
  }

  push(input: Float32Array): string[] {
    if (!input.length) return [];
    const chunks: string[] = [];

    if (this.sourceRateHz === this.targetRateHz) {
      for (let index = 0; index < input.length; index += 1) {
        this.appendSample(input[index] || 0, chunks);
      }
      return chunks;
    }

    const source = appendFloat32(this.sourceTail, input);
    while (this.sourcePosition + 1 < source.length) {
      const leftIndex = Math.floor(this.sourcePosition);
      const rightIndex = leftIndex + 1;
      const fraction = this.sourcePosition - leftIndex;
      const sample =
        (source[leftIndex] || 0) * (1 - fraction) + (source[rightIndex] || 0) * fraction;
      this.appendSample(sample, chunks);
      this.sourcePosition += this.sourceStep;
    }

    const consumed = Math.max(0, Math.floor(this.sourcePosition));
    this.sourceTail = source.slice(consumed);
    this.sourcePosition -= consumed;
    return chunks;
  }

  private appendSample(sample: number, chunks: string[]): void {
    const value = clampSample(sample);
    this.chunk[this.chunkLength] = Math.round(value < 0 ? value * 0x8000 : value * 0x7fff);
    this.chunkLength += 1;
    if (this.chunkLength !== this.chunkSamples) return;
    chunks.push(pcm16LeToBase64(this.chunk));
    this.chunk = new Int16Array(this.chunkSamples);
    this.chunkLength = 0;
  }
}
