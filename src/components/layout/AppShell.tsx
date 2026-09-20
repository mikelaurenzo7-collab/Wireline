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
