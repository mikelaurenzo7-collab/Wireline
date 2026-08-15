/**
 * Shared credential guard for local and production dogfood scripts.
 * Credentials are intentionally never committed as script defaults.
 */
export const CANONICAL_DOGFOOD_ORIGIN = "https://trywireline.com";

/** Never POST production dogfood credentials to a configurable origin. */
export function requireCanonicalCredentialTarget(value) {
  let parsed;
  try {
    parsed = new URL(String(value || CANONICAL_DOGFOOD_ORIGIN).trim());
  } catch {
    throw new Error("Credentialed dogfood target must be https://trywireline.com.");
  }
  if (
    parsed.origin !== CANONICAL_DOGFOOD_ORIGIN ||
    !["", "/"].includes(parsed.pathname) ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new Error(
      "Refusing to send production dogfood credentials anywhere except https://trywireline.com.",
    );
  }
  return CANONICAL_DOGFOOD_ORIGIN;
}

export function requireCompleteCredentialPair(pairs, missingMessage) {
  for (const { label, email: rawEmail, password: rawPassword } of pairs) {
    const email = String(rawEmail || "").trim();
    const password = String(rawPassword || "");
    if (!email && !password) continue;
    if (!email || !password) {
      throw new Error(
        `Set both ${label}_EMAIL and ${label}_PASSWORD; credential aliases cannot be mixed.`,
      );
    }
    return { email: email.toLowerCase(), password };
  }

  throw new Error(missingMessage);
}

export function requireDogfoodCredentials() {
  return requireCompleteCredentialPair(
    [
      {
        label: "DOGFOOD",
        email: process.env.DOGFOOD_EMAIL,
        password: process.env.DOGFOOD_PASSWORD,
      },
      {
        label: "WIRELINE_E2E",
        email: process.env.WIRELINE_E2E_EMAIL,
        password: process.env.WIRELINE_E2E_PASSWORD,
      },
      {
        label: "E2E_USER",
        email: process.env.E2E_USER_EMAIL,
        password: process.env.E2E_USER_PASSWORD,
      },
    ],
    "Set DOGFOOD_EMAIL/DOGFOOD_PASSWORD, WIRELINE_E2E_EMAIL/WIRELINE_E2E_PASSWORD, or E2E_USER_EMAIL/E2E_USER_PASSWORD before running a dogfood script.",
  );
}
