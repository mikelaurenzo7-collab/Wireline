import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import WorkspaceShell from "../components/WorkspaceShell";
import FounderOperatingCockpit from "../components/FounderOperatingCockpit";
import FounderAccountHolderConsole from "../components/admin/FounderOperatorConsole";
import ClientRouteLoading from "../components/layout/ClientRouteLoading";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { useAuth } from "../contexts/AuthContext";
import { Crown } from "lucide-react";

/** Founder-only operating surface — never mounted in tenant Admin. */
export default function FounderDashboardPage() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user && !user.founder_cockpit) {
      document.title = "Wireline";
    }
  }, [loading, user]);

  if (loading) {
    return (
      <WorkspaceShell>
        <ClientRouteLoading icon={<Crown className="w-7 h-7" />} label="Loading founder cockpit" />
      </WorkspaceShell>
    );
  }

  if (!user?.founder_cockpit) {
    return <Navigate to={user ? "/overview" : "/"} replace />;
  }

  return (
    <WorkspaceShell contentClassName="pt-2 pb-8">
      <WorkspacePageFrame>
        <header className="mb-4">
          <p className="app-section-title mb-1">Founder cockpit</p>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Platform-wide acquisition, activation, margin, and launch readiness — visible only to
            approved operator accounts.
          </p>
        </header>
        <FounderOperatingCockpit />
        <FounderAccountHolderConsole />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
