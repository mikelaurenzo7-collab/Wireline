/**
 * Browser audio for relayed voice rehearsal: microphone capture as 24 kHz
 * PCM16 frames and gapless playback of the Bot's PCM16 replies, with an
 * immediate flush when the owner interrupts.
 */
export const RELAY_SAMPLE_RATE = 24_000;
/** Lead time before the first chunk of a reply, to absorb network jitter. */
const PLAYBACK_LEAD_SECONDS = 0.06;

/**
 * Resample float samples to 16-bit little-endian mono PCM. Downsampling
 * averages each output window (a box filter that also suppresses aliasing);
 * upsampling interpolates linearly.
 */
export function resampleToPcm16(
  input: Float32Array,
  inputRate: number,
  outputRate: number = RELAY_SAMPLE_RATE,
): Int16Array {
  if (!input.length || !(inputRate > 0) || !(outputRate > 0)) return new Int16Array(0);
  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const output = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    let value: number;
    if (ratio > 1) {
      const start = Math.floor(index * ratio);
      const end = Math.min(input.length, Math.max(start + 1, Math.floor((index + 1) * ratio)));
      let sum = 0;
      for (let cursor = start; cursor < end; cursor += 1) sum += input[cursor] || 0;
      value = sum / (end - start);
    } else {
      const position = index * ratio;
      const base = Math.floor(position);
      const fraction = position - base;
      const first = input[base] || 0;
      const second = base + 1 < input.length ? input[base + 1] || 0 : first;
      value = first + (second - first) * fraction;
    }
    const clamped = Math.max(-1, Math.min(1, value));
    output[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
}

/** Decode 16-bit little-endian PCM into float samples. */
export function pcm16ToFloat32(data: ArrayBuffer): Float32Array {
  const view = new DataView(data);
  const samples = new Float32Array(Math.floor(data.byteLength / 2));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000;
  }
  return samples;
}

export function arrayBufferToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

export type RelayCapture = { stop: () => void };

/** Stream the microphone as PCM16 frames; muted tracks produce silence frames. */
export function startRelayCapture(
  context: AudioContext,
  stream: MediaStream,
  onFrame: (pcm: ArrayBuffer) => void,
): RelayCapture {
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(2048, 1, 1);
  const sink = context.createGain();
  sink.gain.value = 0;
  processor.onaudioprocess = (event) => {
    const pcm = resampleToPcm16(event.inputBuffer.getChannelData(0), context.sampleRate);
    if (pcm.length) onFrame(pcm.buffer as ArrayBuffer);
  };
  source.connect(processor);
  processor.connect(sink);
  sink.connect(context.destination);
  return {
    stop() {
      processor.onaudioprocess = null;
      processor.disconnect();
      source.disconnect();
      sink.disconnect();
    },
  };
}

export type RelayPlayback = {
  enqueue: (pcm: ArrayBuffer) => void;
  /** Stop everything queued, as when the owner starts talking over the Bot. */
  flush: () => void;
  isPlaying: () => boolean;
};

export function createRelayPlayback(
  context: AudioContext,
  handlers: { onActive?: () => void; onIdle?: () => void } = {},
): RelayPlayback {
  const sources = new Set<AudioBufferSourceNode>();
  let nextStart = 0;
  const settle = () => {
    if (sources.size) return;
    nextStart = 0;
    handlers.onIdle?.();
  };
  return {
    enqueue(pcm) {
      const samples = pcm16ToFloat32(pcm);
      if (!samples.length) return;
      const buffer = context.createBuffer(1, samples.length, RELAY_SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(context.destination);
      const now = context.currentTime;
      // Starting fresh (or after an underrun) waits briefly so the next
      // chunks arrive before this one finishes.
      const start = nextStart > now ? nextStart : now + PLAYBACK_LEAD_SECONDS;
      node.start(start);
      nextStart = start + buffer.duration;
      const wasIdle = sources.size === 0;
      sources.add(node);
      node.onended = () => {
        sources.delete(node);
        settle();
      };
      if (wasIdle) handlers.onActive?.();
    },
    flush() {
      for (const node of sources) {
        node.onended = null;
        try {
          node.stop();
        } catch {
          /* already stopped */
        }
        node.disconnect();
      }
      sources.clear();
      settle();
    },
    isPlaying: () => sources.size > 0,
  };
}
