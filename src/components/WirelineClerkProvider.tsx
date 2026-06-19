import { ClerkProvider } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import ClerkSignOutRegistrar from "./ClerkSignOutRegistrar";
import { isClerkAuthEnabled } from "../lib/auth-provider";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/** @deprecated Use isClerkAuthEnabled() — respects VITE_AUTH_PROVIDER. */
export function isClerkClientConfigured(): boolean {
  return isClerkAuthEnabled();
}

export default function WirelineClerkProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  if (!isClerkAuthEnabled() || !publishableKey?.trim()) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/signin"
      signUpUrl="/signup"
      signInFallbackRedirectUrl="/auth/clerk-complete"
      signUpFallbackRedirectUrl="/auth/clerk-complete"
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
    >
      <ClerkSignOutRegistrar />
      {children}
    </ClerkProvider>
  );
}
