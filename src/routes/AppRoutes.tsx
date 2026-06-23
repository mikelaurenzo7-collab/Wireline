import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

const OverviewPage = lazy(() => import("../pages/OverviewPage"));
const AgentStudioHome = lazy(() => import("../pages/AgentStudioHome"));
const AgentsPage = lazy(() => import("../pages/AgentsPage"));
const KnowledgePage = lazy(() => import("../pages/KnowledgePage"));
const ConnectionsPage = lazy(() => import("../pages/ActionsPage"));
const EmailPage = lazy(() => import("../pages/EmailPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const BillingSettings = lazy(() => import("../pages/BillingSettings"));
const TeamSettings = lazy(() => import("../pages/TeamSettings"));
const AdminSettings = lazy(() => import("../components/AdminSettings"));
const SalesforceIntegrationPage = lazy(() => import("../pages/SalesforceIntegrationPage"));

const loading = (
  <div className="min-h-screen bg-background p-8 text-sm text-muted-foreground">
    Opening workspace…
  </div>
);

function LegacyActionsRedirect() {
  const location = useLocation();
  const suffix = location.pathname.replace(/^\/actions/, "");
  return <Navigate to={`/connections${suffix}${location.search}`} replace />;
}

export default function AppRoutes() {
  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/studio" element={<AgentStudioHome />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/training" element={<Navigate to="/knowledge" replace />} />
        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/connections/salesforce" element={<SalesforceIntegrationPage />} />
        <Route path="/actions" element={<LegacyActionsRedirect />} />
        <Route path="/actions/*" element={<LegacyActionsRedirect />} />
        <Route path="/inbox" element={<EmailPage />} />
        <Route path="/email" element={<Navigate to="/inbox" replace />} />
        <Route path="/ops" element={<Navigate to="/studio" replace />} />
        <Route path="/ops/*" element={<Navigate to="/studio" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/billing" element={<BillingSettings />} />
        <Route path="/settings/team" element={<TeamSettings />} />
        <Route path="/admin" element={<AdminSettings />} />
        <Route path="/admin/*" element={<AdminSettings />} />
        <Route path="/help" element={<Navigate to="/overview" replace />} />
        <Route path="/app/personal" element={<Navigate to="/overview" replace />} />
        <Route path="/app/business" element={<Navigate to="/overview" replace />} />
        <Route path="/app/business/*" element={<Navigate to="/overview" replace />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Suspense>
  );
}
