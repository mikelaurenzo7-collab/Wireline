import * as base from "./api-base";

export * from "./api-base";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * Preserve the shared authenticated-fetch behavior while attaching the explicit
 * consent acknowledgement represented by the Account Holder selecting
 * “Add live video” immediately below the presenter consent disclosure.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: base.AuthFetchOptions = {},
): Promise<Response> {
  const url = requestUrl(input);
  const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "POST" && /\/api\/agents\/[^/]+\/video-presenter\/enable(?:\?|$)/.test(url)) {
    const headers = new Headers(init.headers || {});
    headers.set("Content-Type", "application/json");
    return base.authFetch(input, {
      ...init,
      headers,
      body: JSON.stringify({ consentAcknowledged: true }),
    });
  }
  return base.authFetch(input, init);
}
