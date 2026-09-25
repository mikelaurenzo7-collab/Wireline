/** Ignore only Chromium's resource error for a URL this capture actually aborted. */
export function isIntentionalCaptureAbort(message, sourceUrl, abortedRequestUrls) {
  return (
    message === "Failed to load resource: net::ERR_FAILED" &&
    typeof sourceUrl === "string" &&
    abortedRequestUrls?.has(sourceUrl) === true
  );
}
