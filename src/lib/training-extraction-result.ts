/** A successful request can still extract nothing from an unclear brief. */
export function trainingExtractionWasSaved(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const result = body as { success?: unknown; readiness?: unknown };
  if (result.success !== true || !result.readiness || typeof result.readiness !== "object") {
    return false;
  }
  const readiness = result.readiness as { rules?: unknown; facts?: unknown; tone?: unknown };
  const positiveCount = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value > 0;
  return (
    positiveCount(readiness.rules) || positiveCount(readiness.facts) || readiness.tone === true
  );
}
