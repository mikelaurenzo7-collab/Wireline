import {
  VOICE_REFERENCE_MAX_SECONDS,
  VOICE_REFERENCE_MIN_SECONDS,
} from "../../lib/voice/voice-reference-audio";

export const VOICE_RECORDING_SAMPLE_RATE = 24_000;

/** Encode bounded microphone samples to the same portable WAV accepted by the API. */
export function encodeVoiceRecording(
  chunks: readonly Float32Array[],
  inputSampleRate: number,
  bounds: { minSeconds: number; maxSeconds: number } = {
    minSeconds: VOICE_REFERENCE_MIN_SECONDS,
    maxSeconds: VOICE_REFERENCE_MAX_SECONDS,
  },
) {
  if (
    !Number.isSafeInteger(inputSampleRate) ||
    inputSampleRate < 8_000 ||
    inputSampleRate > 192_000 ||
    chunks.length === 0 ||
    chunks.length > 4_096
  )
    throw new Error("The microphone recording could not be read. Record it again.");
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (length < bounds.minSeconds * inputSampleRate || length > bounds.maxSeconds * inputSampleRate)
    throw new Error(
      `Record between ${bounds.minSeconds} and ${bounds.maxSeconds} seconds of your own voice.`,
    );
  const input = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    input.set(chunk, offset);
    offset += chunk.length;
  }
  const outputLength = Math.floor((length * VOICE_RECORDING_SAMPLE_RATE) / inputSampleRate);
  const bytes = new Uint8Array(44 + outputLength * 2);
  const view = new DataView(bytes.buffer);
  const write = (start: number, value: string) => {
    for (let index = 0; index < value.length; index++)
      bytes[start + index] = value.charCodeAt(index);
  };
  write(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, VOICE_RECORDING_SAMPLE_RATE, true);
  view.setUint32(28, VOICE_RECORDING_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, outputLength * 2, true);
  for (let index = 0; index < outputLength; index++) {
    const position = (index * inputSampleRate) / VOICE_RECORDING_SAMPLE_RATE;
    const left = Math.min(Math.floor(position), input.length - 1);
    const right = Math.min(left + 1, input.length - 1);
    const value = input[left] + (input[right] - input[left]) * (position - left);
    if (!Number.isFinite(value))
      throw new Error("The microphone recording could not be read. Record it again.");
    const clamped = Math.max(-1, Math.min(1, value));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return bytes;
}

export function voiceAudioBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    let part = "";
    for (const value of bytes.subarray(offset, offset + 8_192)) part += String.fromCharCode(value);
    parts.push(part);
  }
  return btoa(parts.join(""));
}
