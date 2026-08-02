/**
 * Shared credential guard for local and production dogfood scripts.
 * Credentials are intentionally never committed as script defaults.
 */
export function requireDogfoodCredentials() {
  const email = (process.env.DOGFOOD_EMAIL || process.env.E2E_USER_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = process.env.DOGFOOD_PASSWORD || process.env.E2E_USER_PASSWORD || "";

  if (!email || !password) {
    throw new Error(
      "DOGFOOD_EMAIL and DOGFOOD_PASSWORD are required. Set them in your shell or local .env before running a dogfood script.",
    );
  }

  return { email, password };
}
