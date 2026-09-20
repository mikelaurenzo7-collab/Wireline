export const proofApiEvidence = Object.freeze({
  mode: "credential-free-simulated-api",
  checkout_available: false,
  authenticated: false,
  vendorReadinessVerified: false,
});

export function productProofApiResponse(method, requestUrl) {
  if (method !== "GET") return { status: 405, body: { error: "Source preview is read-only." } };
  const pathname = new URL(requestUrl, "http://127.0.0.1").pathname;
  if (pathname === "/api/__botbound_proof_status") return { status: 200, body: proofApiEvidence };
  if (pathname === "/api/auth/session") return { status: 200, body: { user: null } };
  if (pathname === "/api/auth/providers")
    return { status: 200, body: { providers: { google: false, microsoft: false, yahoo: false } } };
  // Pricing obtains display prices from plan-catalog.ts. This empty simulated
  // availability response explicitly keeps every activation CTA closed.
  if (pathname === "/api/billing/plans")
    return {
      status: 200,
      body: { plans: [], stripe_configured: false, checkout_available: false },
    };
  return {
    status: 404,
    body: {
      code: "SOURCE_PREVIEW_API_UNAVAILABLE",
      error: "This endpoint is unavailable in the credential-free source preview.",
    },
  };
}
