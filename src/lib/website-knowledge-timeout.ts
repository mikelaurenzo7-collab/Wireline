export const WEBSITE_KNOWLEDGE_EXTRACTION_TIMEOUT_MS = 20_000;

export class WebsiteKnowledgeExtractionTimeoutError extends Error {
  constructor() {
    super("Website analysis took too long. Try a smaller or more focused page.");
    this.name = "WebsiteKnowledgeExtractionTimeoutError";
  }
}

/**
 * Bound the metered model step independently from the network-fetch deadline.
 * The callback must pass the provided signal to the provider SDK.
 */
export async function runWithWebsiteKnowledgeExtractionTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = WEBSITE_KNOWLEDGE_EXTRACTION_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (typeof timer === "object" && "unref" in timer) timer.unref();

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (timedOut) throw new WebsiteKnowledgeExtractionTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
