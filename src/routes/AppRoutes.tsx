import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

const OverviewPage = lazy(() => import("../pages/OverviewPage"));
const AgentStudioHome = lazy(() => import("../pages/AgentStudioHome"));
const AgentsPage = lazy(() => import("../pages/AgentsPage"));
const KnowledgePage = lazy(() => import("../pages/KnowledgePage"));
const ActionsPage = lazy(() => import("../pages/ActionsPage"));
const EmailPage = lazy(() => import("../pages/EmailPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const BillingSettings = lazy(() => import("../pages/BillingSettings"));
const TeamSettings = lazy(() => import("../pages/TeamSettings"));
const ClientAppsPage = lazy(() => import("../pages/ClientAppsPage"));
const AdminSettings = lazy(() => import("../components/AdminSettings"));
const SalesforceIntegrationPage = lazy(() => import("../pages/SalesforceIntegrationPage"));

const loading = (
  <div className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
    <p className="wl-overline">Opening workspace</p>
  </div>
);

function LegacyConnectionsRedirect() {
  const location = useLocation();
  const suffix = location.pathname.replace(/^\/connections/, "");
  return <Navigate to={`/actions${suffix}${location.search}`} replace />;
}

export default function AppRoutes() {
  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/studio" element={<AgentStudioHome />} />
        <Route path="/training" element={<KnowledgePage />} />
        <Route path="/knowledge" element={<Navigate to="/training" replace />} />
        <Route path="/actions" element={<ActionsPage />} />
        <Route path="/actions/salesforce" element={<SalesforceIntegrationPage />} />
        <Route path="/connections" element={<LegacyConnectionsRedirect />} />
        <Route path="/connections/*" element={<LegacyConnectionsRedirect />} />
        <Route path="/inbox" element={<EmailPage />} />
        <Route path="/email" element={<Navigate to="/inbox" replace />} />
        <Route path="/ops" element={<Navigate to="/studio" replace />} />
        <Route path="/ops/*" element={<Navigate to="/studio" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/billing" element={<BillingSettings />} />
        <Route path="/settings/team" element={<TeamSettings />} />
        <Route path="/settings/apps" element={<ClientAppsPage />} />
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
