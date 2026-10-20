import { useEffect } from "react";
import { Navigate, useLocation } from "react-router";
import { Button } from "../atoms/Button";
import { useAuth } from "../../contexts/AuthContext";
import { consumeRedirectHash, stashRedirectHash } from "../../lib/redirect-hash-stash";
import { workspacePageTitle } from "../../constants/navigation";
import AppRoutes from "../../routes/AppRoutes";
import TransitionSurface from "../TransitionSurface";
import TrialGateModal from "../TrialGateModal";
import { CommandBar } from "../organisms";

export default function AppShell() {
  const { user, loading, sessionUnavailable, retrySessionProbe } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (loading || !user) return;
    document.title = `${workspacePageTitle(location.pathname)} - BotBound`;
  }, [loading, location.pathname, user]);

  if (loading) {
    return (
      <TransitionSurface
        eyebrow="Workspace"
        title="Opening Your Workspace"
        busyLabel="Checking your session"
      />
    );
  }

  if (!user && sessionUnavailable) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground">Workspace</p>
        <h1 className="text-2xl font-semibold text-foreground">Session Could Not Be Confirmed</h1>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          BotBound could not verify this sign-in. Your place in the workspace is unchanged. Try
          again before starting a new account.
        </p>
        <Button type="button" onClick={retrySessionProbe}>
          Try Again
        </Button>
      </div>
    );
  }

  if (!user) {
    if (location.hash) stashRedirectHash(location.pathname, location.hash);
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/signin?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  if (!location.hash) {
    const restoredHash = consumeRedirectHash(location.pathname);
    if (restoredHash) {
      return <Navigate to={`${location.pathname}${location.search}${restoredHash}`} replace />;
    }
  }

  return (
    <>
      <AppRoutes />
      <CommandBar />
      <TrialGateModal />
    </>
  );
}
