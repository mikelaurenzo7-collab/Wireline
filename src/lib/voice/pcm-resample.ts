/**
 * PCM16 LE resampling for live presenter lip-sync.
 *
 * Vapi listenUrl streams 8 kHz phone PCM; LiveAvatar LITE expects ~24 kHz
 * (matches ElevenLabs pcm_24000 and the Knowledge simulator path).
 */
export const VAPI_LISTEN_PCM_RATE_HZ = 8_000;
export const LIVEAVATAR_PCM_RATE_HZ = 24_000;

export function upsamplePcm16Le(
  pcmBytes: Uint8Array,
  inputRateHz: number,
  outputRateHz: number,
): Uint8Array {
  if (inputRateHz === outputRateHz || pcmBytes.length < 2) return pcmBytes;

  const sampleCount = Math.floor(pcmBytes.length / 2);
  const input = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, sampleCount);
  const ratio = inputRateHz / outputRateHz;
  const outLength = Math.max(1, Math.round(sampleCount / ratio));
  const output = new Int16Array(outLength);

  for (let i = 0; i < outLength; i += 1) {
    const index = i * ratio;
    const left = Math.floor(index);
    const right = Math.min(left + 1, sampleCount - 1);
    const fraction = index - left;
    output[i] = Math.round(input[left]! * (1 - fraction) + input[right]! * fraction);
  }

  return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
}

export function pcm16LeToBase64(pcmBytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < pcmBytes.length; i += chunk) {
    binary += String.fromCharCode(...pcmBytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Upsample Vapi listen PCM to LiveAvatar rate and return base64 for feedPcmDelta. */
export function vapiListenPcmToLiveAvatarBase64(buffer: ArrayBuffer): string {
  const input = new Uint8Array(buffer);
  const resampled = upsamplePcm16Le(input, VAPI_LISTEN_PCM_RATE_HZ, LIVEAVATAR_PCM_RATE_HZ);
  return pcm16LeToBase64(resampled);
}
