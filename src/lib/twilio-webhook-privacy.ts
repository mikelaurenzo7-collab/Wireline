export interface FailoverVoicemailEmailInput {
  from: string;
  to: string;
  durationSeconds: number | null;
  recordingUrl: string;
  transcription: string;
}

export function phoneSuffixForLog(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits ? `***${digits.slice(-4)}` : null;
}

export function opaqueIdSuffixForLog(value: string): string | null {
  const normalized = value.trim();
  return normalized ? `…${normalized.slice(-8)}` : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function trustedTwilioRecordingUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const isTwilioHost = url.hostname === "api.twilio.com" || url.hostname.endsWith(".twilio.com");
    if (url.protocol !== "https:" || !isTwilioHost || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function buildFailoverVoicemailEmail(
  input: FailoverVoicemailEmailInput,
): { text: string; html: string } {
  const escapedFrom = escapeHtml(input.from);
  const escapedTo = escapeHtml(input.to);
  const escapedRecordingUrl = escapeHtml(input.recordingUrl);
  const escapedTranscription = escapeHtml(input.transcription);
  const trustedRecordingUrl = trustedTwilioRecordingUrl(input.recordingUrl);
  const recordingHtml = trustedRecordingUrl
    ? `<a href="${escapeHtml(trustedRecordingUrl)}">${escapedRecordingUrl}</a>`
    : escapedRecordingUrl;

  return {
    text: [
      "A caller left a voicemail while your AI voice line was in failover mode.",
      "",
      input.from ? `From: ${input.from}` : null,
      input.to ? `To: ${input.to}` : null,
      input.durationSeconds != null ? `Duration: ${input.durationSeconds}s` : null,
      `Recording: ${input.recordingUrl}`,
      input.transcription ? `Transcript: ${input.transcription}` : null,
      "",
      "Open Phone → History in Wireline to review.",
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <p>A caller left a voicemail while your AI voice line was in failover mode.</p>
      <ul>
        ${input.from ? `<li><strong>From:</strong> ${escapedFrom}</li>` : ""}
        ${input.to ? `<li><strong>To:</strong> ${escapedTo}</li>` : ""}
        ${input.durationSeconds != null ? `<li><strong>Duration:</strong> ${input.durationSeconds}s</li>` : ""}
        <li><strong>Recording:</strong> ${recordingHtml}</li>
        ${input.transcription ? `<li><strong>Transcript:</strong> ${escapedTranscription}</li>` : ""}
      </ul>
      <p>Open Phone → History in Wireline to review.</p>
    `,
  };
}
