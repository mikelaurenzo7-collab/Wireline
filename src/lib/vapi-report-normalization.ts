type VendorRecord = Record<string, unknown>;

function asRecord(value: unknown): VendorRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as VendorRecord)
    : null;
}

function finiteNonNegativeNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function completeCostSum(value: unknown): number | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  let total = 0;
  for (const item of value) {
    const cost = finiteNonNegativeNumber(asRecord(item)?.cost);
    if (cost == null) return null;
    total += cost;
  }
  return total;
}

function durationBetweenSeconds(startedAt: unknown, endedAt: unknown): number {
  if (
    (typeof startedAt !== "string" && typeof startedAt !== "number") ||
    (typeof endedAt !== "string" && typeof endedAt !== "number")
  ) {
    return 0;
  }

  const startedMs = new Date(startedAt).getTime();
  const endedMs = new Date(endedAt).getTime();
  const durationMs = endedMs - startedMs;
  return Number.isFinite(durationMs) && durationMs > 0 ? Math.floor(durationMs / 1000) : 0;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Resolve the final Vapi cost without turning missing telemetry into a real
 * zero-dollar call. Current reports put cost on the message; call API objects
 * may expose either a total cost or a complete cost breakdown.
 */
export function resolveVapiCallCostUsd(message: unknown, call?: unknown): number | null {
  const report = asRecord(message);
  const callRecord = asRecord(call) || asRecord(report?.call);

  return (
    finiteNonNegativeNumber(report?.cost) ??
    finiteNonNegativeNumber(callRecord?.cost) ??
    completeCostSum(report?.costs) ??
    completeCostSum(callRecord?.costs)
  );
}

/**
 * Resolve duration across current end-of-call reports and retained call-object
 * payloads. Explicit duration wins; current message timestamps precede the
 * compatibility call-object timestamps.
 */
export function resolveVapiCallDurationSeconds(message: unknown, call?: unknown): number {
  const report = asRecord(message);
  const explicit = finiteNonNegativeNumber(report?.durationSeconds);
  if (explicit != null && explicit > 0) return Math.floor(explicit);

  const reportDuration = durationBetweenSeconds(report?.startedAt, report?.endedAt);
  if (reportDuration > 0) return reportDuration;

  const callRecord = asRecord(call) || asRecord(report?.call);
  return durationBetweenSeconds(callRecord?.startedAt, callRecord?.endedAt);
}

/** Resolve transcript from both direct and artifact-based Vapi report shapes. */
export function resolveVapiTranscript(message: unknown): string {
  const report = asRecord(message);
  const artifact = asRecord(report?.artifact);
  return nonEmptyString(report?.transcript) ?? nonEmptyString(artifact?.transcript) ?? "";
}

/** Resolve private recording references from current and compatibility shapes. */
export function resolveVapiRecordingUrl(message: unknown): string | null {
  const report = asRecord(message);
  const artifact = asRecord(report?.artifact);
  const recordingValue = artifact?.recording;
  const recording = asRecord(recordingValue);

  const candidates = [
    report?.recordingUrl,
    report?.stereoRecordingUrl,
    typeof recordingValue === "string" ? recordingValue : null,
    recording?.url,
    recording?.recordingUrl,
    recording?.stereoRecordingUrl,
    recording?.mono,
    recording?.stereo,
    artifact?.recordingUrl,
    artifact?.stereoRecordingUrl,
  ];

  for (const candidate of candidates) {
    const url = nonEmptyString(candidate);
    if (url) return url;
  }
  return null;
}
