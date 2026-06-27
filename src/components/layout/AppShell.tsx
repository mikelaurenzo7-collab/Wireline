import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import AppRoutes from "../../routes/AppRoutes";
import ActivationCheckpoint from "../ActivationCheckpoint";
import TrialGateModal from "../TrialGateModal";
import WirelineMark from "../brand/WirelineMark";
import { CommandBar } from "../organisms";

export default function AppShell() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="studio-route-loading" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="grid size-11 place-items-center rounded-[var(--radius-lg)] border border-border bg-card text-primary shadow-[var(--wireline-shadow-sm)]">
            <WirelineMark className="size-6" />
          </span>
          <div>
            <p className="font-[var(--wireline-font-display)] text-[var(--wireline-typography-body-size)] font-semibold tracking-[-.02em] text-foreground">
              Opening Wireline
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Preparing your workspace...</p>
          </div>
        </div>
      </div>
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
      <ActivationCheckpoint />
      <TrialGateModal />
    </>
  );
}
