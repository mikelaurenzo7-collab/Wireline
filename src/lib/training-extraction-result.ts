export type TrainingExtractionBody = {
  responseContent?: unknown;
  alreadySaved?: unknown;
  readiness?: { rules?: unknown; facts?: unknown; tone?: unknown };
  directives?: unknown;
  knowledge?: unknown;
  personality?: unknown;
};

/** True when the submission has a saved fact, rule, or tone, including an exact repeat. */
export function extractionBodyPersistedSomething(
  body: TrainingExtractionBody | null | undefined,
): boolean {
  if (body?.alreadySaved === true) return true;
  const readiness = body?.readiness;
  if (readiness) {
    return (
      (typeof readiness.rules === "number" && readiness.rules > 0) ||
      (typeof readiness.facts === "number" && readiness.facts > 0) ||
      readiness.tone === true
    );
  }
  // Older responses can still prove extraction with the returned content.
  return (
    (Array.isArray(body?.directives) && body.directives.length > 0) ||
    (Array.isArray(body?.knowledge) && body.knowledge.length > 0) ||
    (typeof body?.personality === "string" && body.personality.trim().length > 0)
  );
}
