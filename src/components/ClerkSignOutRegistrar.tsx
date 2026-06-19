import { useEffect } from "react";
import { useClerk } from "@clerk/react";
import { registerClerkSignOutHandler } from "../lib/clerk-sign-out-bridge";

/** Registers Clerk sign-out so AuthContext can clear both sessions. */
export default function ClerkSignOutRegistrar() {
  const clerk = useClerk();

  useEffect(() => {
    registerClerkSignOutHandler(async () => {
      await clerk.signOut({ redirectUrl: "/signin" });
    });
    return () => registerClerkSignOutHandler(null);
  }, [clerk]);

  return null;
}
