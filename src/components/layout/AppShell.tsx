import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import AppRoutes from "../../routes/AppRoutes";
import TransitionSurface from "../TransitionSurface";
import TrialGateModal from "../TrialGateModal";
import { CommandBar } from "../organisms";

export default function AppShell() {
  const { user, loading } = useAuth();
  const location = useLocation();

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
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/signin?redirect=${encodeURIComponent(redirect)}`} replace />;
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
