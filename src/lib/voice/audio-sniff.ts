/**
 * Magic-byte detection for provider-hosted audio samples.
 *
 * Some trusted preview hosts (notably storage.googleapis.com serving
 * ElevenLabs premade samples) return valid audio bytes with a text/plain
 * content type. Response headers alone therefore cannot distinguish real
 * audio from an HTML or JSON error page — the payload can.
 */
export function sniffAudioContentType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

  if (ascii(0, 3) === "ID3") return "audio/mpeg";
  // MPEG audio frame sync: 11 set bits straddling the first two bytes.
  if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) return "audio/mpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(4, 8) === "ftyp") return "audio/mp4";
  // EBML header shared by WebM/Matroska audio containers.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "audio/webm";
  }
  return null;
}
