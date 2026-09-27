import { readRedirectFromSearch } from "./auth-redirect";

export type EmailVerificationReturn = "1" | "expired" | "error";

/** A navigation hint only: account verification must come from an authenticated response. */
export function readEmailVerificationReturn(search: string): EmailVerificationReturn | null {
  const params = new URLSearchParams(search);
  const value = params.get("verified");
  if (value === "1" || value === "expired" || value === "error") return value;
  if (params.has("verified")) return null;

  // AppShell preserves the verification landing inside the sign-in return path.
  const redirect = readRedirectFromSearch(search);
  if (!redirect) return null;
  const landing = new URL(redirect, "https://wireline.invalid");
  if (landing.pathname !== "/studio") return null;
  const nested = landing.searchParams.get("verified");
  return nested === "1" || nested === "expired" || nested === "error" ? nested : null;
}

export function emailVerificationSignInNotice(result: EmailVerificationReturn) {
  if (result === "1") {
    return {
      tone: "info" as const,
      title: "Verification link accepted",
      message: "Sign in to confirm your email status and continue to your workspace.",
    };
  }
  if (result === "expired") {
    return {
      tone: "warning" as const,
      title: "This verification link is no longer available",
      message:
        "It may have expired or already been used. Sign in to check your email status or resend a link.",
    };
  }
  return {
    tone: "warning" as const,
    title: "We couldn’t finish checking this link",
    message: "Sign in to check your email status or request another verification email.",
  };
}
