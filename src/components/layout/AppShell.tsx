import { useEffect } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { consumeRedirectHash, stashRedirectHash } from "../../lib/redirect-hash-stash";
import { workspacePageTitle } from "../../constants/navigation";
import AppRoutes from "../../routes/AppRoutes";
import TransitionSurface from "../TransitionSurface";
import TrialGateModal from "../TrialGateModal";
import { CommandBar } from "../organisms";

export default function AppShell() {
  const { user, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (loading || !user) return;
    document.title = `${workspacePageTitle(location.pathname)} - Wireline`;
  }, [loading, location.pathname, user]);

  if (loading) {
    return (
      <TransitionSurface
        eyebrow="Workspace"
        title="Opening your workspace"
        busyLabel="Checking your session"
      />
    );
  }

  if (!user) {
    // Preserve the fragment WITHOUT putting it in the URL: the extension
    // handoff hash carries captured page content (reversible base64), so it
    // must never ride the /signin query string into HTTP logs or the auth
    // portal's persisted redirect. Stash it client-side and restore below
    // after authentication; the redirect itself stays pathname + search.
    if (location.hash) stashRedirectHash(location.pathname, location.hash);
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/signin?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  // Authenticated: re-attach a fragment stashed on the way to sign-in (the
  // extension handoff, or an anchor like #company-identity) exactly once.
  if (!location.hash) {
    const restoredHash = consumeRedirectHash(location.pathname);
    if (restoredHash) {
      return <Navigate to={`${location.pathname}${location.search}${restoredHash}`} replace />;
    }
  }

  // Authenticated: render routes (see AppRoutes.tsx). Post-login destination resolved in
  // AuthPortal/OAuthComplete via resolvePostAuthDestination -> defaults to /overview.
  return (
    <>
      <AppRoutes />
      <CommandBar />
      <TrialGateModal />
    </>
  );
}
