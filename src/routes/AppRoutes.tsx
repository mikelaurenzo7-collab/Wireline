import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import RouteFallback from "../components/layout/RouteFallback";
import WorkspaceShell from "../components/WorkspaceShell";
import NotFound from "../components/layout/NotFound";

const AgentStudioHome = lazy(() => import("../pages/AgentStudioHome"));
const BrowserHandoffBridge = lazy(() => import("../pages/BrowserHandoffBridge"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const AdminSettings = lazy(() => import("../components/AdminSettings"));
const OverviewPage = lazy(() => import("../pages/OverviewPage"));
const TemplatesPage = lazy(() => import("../pages/TemplatesPage"));
const KnowledgePage = lazy(() => import("../pages/KnowledgePage"));
const ConnectionsPage = lazy(() => import("../pages/ConnectionsPage"));
const SalesforceIntegrationPage = lazy(() => import("../pages/SalesforceIntegrationPage"));
const PhonePage = lazy(() => import("../pages/PhonePage"));
const InsightsPage = lazy(() => import("../pages/InsightsPage"));
const EmailPage = lazy(() => import("../pages/EmailPage"));
const ApprovalsPage = lazy(() => import("../pages/ApprovalsPage"));
const ClientAppsPage = lazy(() => import("../pages/ClientAppsPage"));
const BrowserCommandInstallPage = lazy(() => import("../pages/BrowserCommandInstallPage"));
const BillingSettings = lazy(() => import("../pages/BillingSettings"));
const PhoneSettings = lazy(() => import("../pages/PhoneSettings"));
const TeamSettings = lazy(() => import("../pages/TeamSettings"));
const ComplianceCenterPage = lazy(() => import("../pages/ComplianceCenterPage"));
const CustomizationSettings = lazy(() => import("../pages/CustomizationSettings"));

const loading = <RouteFallback />;

/** Preserve query/hash when legacy /agents deep-links redirect into Studio. */
function AgentsToStudioRedirect() {
  const location = useLocation();
  return <Navigate to={`/studio${location.search}${location.hash}`} replace />;
}

/** Preserve historical email deep-link state while Inbox remains canonical. */
function EmailToInboxRedirect() {
  const location = useLocation();
  return <Navigate to={`/inbox${location.search}${location.hash}`} replace />;
}

function AuthNotFound() {
  return (
    <WorkspaceShell>
      <NotFound />
    </WorkspaceShell>
  );
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
        <Route path="/studio/handoff" element={<BrowserHandoffBridge />} />
        <Route path="/studio" element={<AgentStudioHome />} />
        <Route path="/studio/*" element={<AgentStudioHome />} />
        <Route path="/agents" element={<AgentsToStudioRedirect />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />

        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/connections/salesforce" element={<SalesforceIntegrationPage />} />
        <Route path="/connections/*" element={<ConnectionsPage />} />
        <Route path="/call-logs" element={<Navigate to="/phone?tab=logs" replace />} />
        <Route path="/logs" element={<Navigate to="/phone?tab=logs" replace />} />
        <Route path="/phone" element={<PhonePage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/inbox" element={<EmailPage />} />
        <Route path="/email" element={<EmailToInboxRedirect />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/apps" element={<ClientAppsPage />} />
        <Route path="/apps/command" element={<BrowserCommandInstallPage />} />
        <Route path="/settings/apps/command" element={<BrowserCommandInstallPage />} />

        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/billing" element={<BillingSettings />} />
        <Route path="/settings/phone" element={<PhoneSettings />} />
        <Route path="/settings/team" element={<TeamSettings />} />
        <Route path="/settings/customization" element={<CustomizationSettings />} />
        <Route path="/settings/compliance" element={<ComplianceCenterPage />} />
        <Route path="/settings/apps" element={<ClientAppsPage />} />
        <Route path="/settings/*" element={<SettingsPage />} />
        <Route path="/dnc" element={<Navigate to="/settings/compliance" replace />} />
        <Route path="/audit" element={<Navigate to="/admin?tab=activity" replace />} />
        <Route path="/admin" element={<AdminWorkspace />} />
        <Route path="/admin/*" element={<AdminWorkspace />} />

        <Route path="*" element={<AuthNotFound />} />
      </Routes>
    </Suspense>
  );
}
