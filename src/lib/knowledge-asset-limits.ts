/**
 * Client-safe knowledge-asset ingestion limits — no server/db imports.
 * Shared by KnowledgeBaseClaude (browser) and agent-routes-v2 (API).
 *
 * These numbers used to live only inside the route handler, as arguments to a
 * `cleanText(value, max)` helper that silently `.slice()`s whatever it is given.
 * That made every limit invisible to the user: the drop zone advertised a
 * ceiling the transport could not carry, oversized text was truncated and
 * reported as a complete success, and an oversized image was cut mid-base64 and
 * handed to the vision model as corrupt bytes. Naming the limits in one place
 * lets the browser refuse a file before uploading it and lets the API answer
 * honestly about anything that still arrives too large.
 */

/**
 * Largest single file accepted for knowledge ingestion, in bytes.
 *
 * The binding constraint is the 6 MiB `express.json` body limit in `server.ts`:
 * images travel as base64 data URLs, which inflate by 4/3, so the original file
 * has to stay well under that ceiling. 4 MB decimal (what a file manager shows
 * the customer) becomes ~5.33 M base64 characters — comfortably inside the
 * transport budget with room for the rest of the JSON envelope.
 */
export const KNOWLEDGE_ASSET_MAX_BYTES = 4_000_000;

/** Files accepted per pick/drop. Extra files are dropped, so the UI says so. */
export const KNOWLEDGE_ASSET_MAX_FILES = 5;

/**
 * How much of a text asset the extraction model actually reads.
 *
 * Anything past this is not ingested. Truncating is deliberate — the model has a
 * finite context — but it has to be reported, or a customer who uploads a long
 * policy document is told their whole file was saved when most of it was never
 * read.
 */
export const KNOWLEDGE_TEXT_EXTRACT_CHARS = 28_000;

/**
 * Ceiling for an inbound image data URL, derived from the file-size cap.
 *
 * Base64 emits 4 characters per 3 input bytes; the `data:<mime>;base64,` prefix
 * adds a few dozen more. Deriving it here keeps the API's rejection threshold
 * and the browser's pre-flight check from drifting apart.
 */
export const KNOWLEDGE_IMAGE_MAX_DATA_URL_CHARS = Math.ceil(KNOWLEDGE_ASSET_MAX_BYTES / 3) * 4 + 64;

function megabytes(bytes: number): string {
  const value = bytes / 1_000_000;
  return `${value >= 10 || Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} MB`;
}

/** Size ceiling as shown to customers, e.g. "4 MB". */
export const KNOWLEDGE_ASSET_MAX_LABEL = megabytes(KNOWLEDGE_ASSET_MAX_BYTES);

/** Rejection copy for a file the transport cannot carry. Names the file. */
export function knowledgeAssetTooLargeMessage(fileName: string, bytes?: number): string {
  const measured = typeof bytes === "number" && bytes > 0 ? ` is ${megabytes(bytes)} and` : "";
  return `${fileName}${measured} exceeds the ${KNOWLEDGE_ASSET_MAX_LABEL} limit for a single upload. Split it into smaller files.`;
}

/** Warning for the files beyond the per-pick cap, which are not uploaded. */
export function knowledgeAssetFileCountNotice(picked: number): string | null {
  if (picked <= KNOWLEDGE_ASSET_MAX_FILES) return null;
  const dropped = picked - KNOWLEDGE_ASSET_MAX_FILES;
  return `Only the first ${KNOWLEDGE_ASSET_MAX_FILES} files were uploaded — ${dropped} more ${dropped === 1 ? "was" : "were"} skipped. Add them in another batch.`;
}

/**
 * Suffix appended to the ingest summary when only part of a text asset was read.
 * Returns null when the whole file fit, so the common case reads unchanged.
 */
export function knowledgeTextTruncationNotice(originalChars: number): string | null {
  if (originalChars <= KNOWLEDGE_TEXT_EXTRACT_CHARS) return null;
  return `Only the first ${KNOWLEDGE_TEXT_EXTRACT_CHARS.toLocaleString()} of ${originalChars.toLocaleString()} characters were read — split the document if the rest matters.`;
}
