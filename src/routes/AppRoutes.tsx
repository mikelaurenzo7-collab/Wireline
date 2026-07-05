import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import TransitionSurface from "../components/TransitionSurface";
import WorkspaceShell from "../components/WorkspaceShell";

const AgentStudioHome = lazy(() => import("../pages/AgentStudioHomeClaude"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const AdminSettings = lazy(() => import("../components/AdminSettings"));
const OverviewPage = lazy(() => import("../pages/OverviewPage"));
const TemplatesPage = lazy(() => import("../pages/TemplatesPage"));
const KnowledgePage = lazy(() => import("../pages/KnowledgePage"));
const ConnectionsPage = lazy(() => import("../pages/ConnectionsPage"));
const SalesforceIntegrationPage = lazy(() => import("../pages/SalesforceIntegrationPage"));
const CallLogsPage = lazy(() => import("../pages/CallLogsPage"));
const InsightsPage = lazy(() => import("../pages/InsightsPage"));
const EmailPage = lazy(() => import("../pages/EmailPage"));
const ClientAppsPage = lazy(() => import("../pages/ClientAppsPage"));
const BillingSettings = lazy(() => import("../pages/BillingSettings"));
const PhoneSettings = lazy(() => import("../pages/PhoneSettings"));
const TeamSettings = lazy(() => import("../pages/TeamSettings"));
const CustomizationSettings = lazy(() => import("../pages/CustomizationSettings"));

const loading = <TransitionSurface eyebrow="Workspace" title="Loading" busyLabel="Loading route" />;

/** Preserve ?tab= when retiring /ops links in emails and Slack. */
function LegacyOpsRedirect() {
  const location = useLocation();
  return <Navigate to={`/call-logs${location.search}`} replace />;
}

/** Admin panels predate the workspace rail — give them the shared shell so
 *  /admin sits inside the same chrome and rhythm as every other surface. */
function AdminWorkspace() {
  return (
    <WorkspaceShell fullBleed contentClassName="px-4 pt-4 pb-6 sm:px-6 lg:px-8">
      <AdminSettings />
    </WorkspaceShell>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />

        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/studio" element={<AgentStudioHome />} />
        <Route path="/studio/*" element={<AgentStudioHome />} />
        <Route path="/agents" element={<Navigate to="/overview" replace />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />

        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/connections/salesforce" element={<SalesforceIntegrationPage />} />
        <Route path="/connections/*" element={<ConnectionsPage />} />
        <Route path="/call-logs" element={<CallLogsPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/inbox" element={<EmailPage />} />
        <Route path="/apps" element={<ClientAppsPage />} />

        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/billing" element={<BillingSettings />} />
        <Route path="/settings/phone" element={<PhoneSettings />} />
        <Route path="/settings/team" element={<TeamSettings />} />
        <Route path="/settings/customization" element={<CustomizationSettings />} />
        <Route path="/settings/apps" element={<ClientAppsPage />} />
        <Route path="/settings/*" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminWorkspace />} />
        <Route path="/admin/*" element={<AdminWorkspace />} />

        <Route path="/pulse" element={<Navigate to="/overview" replace />} />
        <Route path="/fleet" element={<Navigate to="/studio" replace />} />
        <Route path="/ops" element={<LegacyOpsRedirect />} />
        <Route path="/ops/*" element={<LegacyOpsRedirect />} />
        <Route path="/training" element={<Navigate to="/knowledge" replace />} />
        <Route path="/chat" element={<Navigate to="/studio" replace />} />
        <Route path="/chat/*" element={<Navigate to="/studio" replace />} />
        <Route path="/actions" element={<Navigate to="/connections" replace />} />
        <Route
          path="/actions/salesforce"
          element={<Navigate to="/connections/salesforce" replace />}
        />
        <Route path="/actions/*" element={<Navigate to="/connections" replace />} />
        <Route path="/nexus" element={<Navigate to="/connections" replace />} />
        <Route path="/wires" element={<Navigate to="/connections" replace />} />

        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Suspense>
  );
}
