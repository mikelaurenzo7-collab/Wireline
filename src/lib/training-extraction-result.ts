/** /api/train/extract success must contain a persisted fact, rule, or tone. */
export async function extractionPersistedSomething(response: Response): Promise<boolean> {
  if (!response.ok) return false;
  try {
    const body = (await response.json()) as {
      readiness?: { rules?: unknown; facts?: unknown; tone?: unknown };
      directives?: unknown;
      knowledge?: unknown;
      personality?: unknown;
    };
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
  } catch {
    return false;
  }
}
