export const WEBSITE_KNOWLEDGE_EXTRACTION_TIMEOUT_MS = 20_000;

export class WebsiteKnowledgeExtractionTimeoutError extends Error {
  constructor() {
    super("Website analysis took too long. Try a smaller or more focused page.");
    this.name = "WebsiteKnowledgeExtractionTimeoutError";
  }
}

/**
 * Bound the metered model step independently from the network-fetch deadline.
 * The callback should pass the provided signal to the provider SDK, while the
 * race below still enforces the deadline if a client ignores cancellation.
 */
export async function runWithWebsiteKnowledgeExtractionTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = WEBSITE_KNOWLEDGE_EXTRACTION_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new WebsiteKnowledgeExtractionTimeoutError());
    }, timeoutMs);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
