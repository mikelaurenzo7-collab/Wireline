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

/** Mask an address down to something an operator can correlate but not read. */
export function emailMaskForLog(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return normalized ? "***" : null;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}

export function conversationShapeForLog(value: string | null | undefined): {
  present: boolean;
  length: number;
} {
  const text = typeof value === "string" ? value : "";
  return { present: text.length > 0, length: text.length };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function trustedBotBoundRecordingUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const isBotBoundHost =
      url.hostname === "botbound.app" ||
      url.hostname === "www.botbound.app" ||
      url.hostname === "botbound.me" ||
      url.hostname === "www.botbound.me" ||
      url.hostname === "trywireline.com" ||
      url.hostname === "www.trywireline.com";
    if (
      url.protocol !== "https:" ||
      !isBotBoundHost ||
      url.username ||
      url.password ||
      !/^\/api\/calls\/\d+\/recording$/.test(url.pathname)
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function buildFailoverVoicemailEmail(input: FailoverVoicemailEmailInput): {
  text: string;
  html: string;
} {
  const escapedFrom = escapeHtml(input.from);
  const escapedTo = escapeHtml(input.to);
  const escapedRecordingUrl = escapeHtml(input.recordingUrl);
  const escapedTranscription = escapeHtml(input.transcription);
  const trustedRecordingUrl = trustedBotBoundRecordingUrl(input.recordingUrl);
  const recordingHtml = trustedRecordingUrl
    ? `<a href="${escapeHtml(trustedRecordingUrl)}">${escapedRecordingUrl}</a>`
    : escapedRecordingUrl;

  return {
    text: [
      "A caller left a voicemail on your BotBound line.",
      "",
      input.from ? `From: ${input.from}` : null,
      input.to ? `To: ${input.to}` : null,
      input.durationSeconds != null ? `Duration: ${input.durationSeconds}s` : null,
      `Recording: ${input.recordingUrl}`,
      input.transcription ? `Transcript: ${input.transcription}` : null,
      "",
      "Open Calls → History in BotBound to review.",
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <p>A caller left a voicemail on your BotBound line.</p>
      <ul>
        ${input.from ? `<li><strong>From:</strong> ${escapedFrom}</li>` : ""}
        ${input.to ? `<li><strong>To:</strong> ${escapedTo}</li>` : ""}
        ${input.durationSeconds != null ? `<li><strong>Duration:</strong> ${input.durationSeconds}s</li>` : ""}
        <li><strong>Recording:</strong> ${recordingHtml}</li>
        ${input.transcription ? `<li><strong>Transcript:</strong> ${escapedTranscription}</li>` : ""}
      </ul>
      <p>Open Calls → History in BotBound to review.</p>
    `,
  };
}
