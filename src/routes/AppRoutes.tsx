import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import RouteFallback from "../components/layout/RouteFallback";
import WorkspaceShell from "../components/WorkspaceShell";
import NotFound from "../components/layout/NotFound";

const AgentStudioHome = lazy(() => import("../pages/AgentStudioHome"));
const BrowserHandoffBridge = lazy(() => import("../pages/BrowserHandoffBridge"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const AdminSettings = lazy(() => import("../components/AdminSettings"));
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
const TeamSettings = lazy(() => import("../pages/TeamSettings"));
const ComplianceCenterPage = lazy(() => import("../pages/ComplianceCenterPage"));
const CustomizationSettings = lazy(() => import("../pages/CustomizationSettings"));

const loading = <RouteFallback />;

function ToStudioRedirect() {
  const location = useLocation();
  return <Navigate to={`/studio${location.search}${location.hash}`} replace />;
}

/** Preserve historical email deep-link state while Inbox remains canonical. */
function EmailToInboxRedirect() {
  const location = useLocation();
  return <Navigate to={`/inbox${location.search}${location.hash}`} replace />;
}

/** Keep retired settings deep links useful without dropping anchors or filters. */
function PhoneSettingsRedirect() {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  search.set("tab", "setup");
  return <Navigate to={`/phone?${search.toString()}${location.hash}`} replace />;
}

/** Apps lives under Settings; preserve old bookmarks without maintaining two chromes. */
function AppsToSettingsRedirect({ command = false }: { command?: boolean }) {
  const location = useLocation();
  const suffix = command ? "/command" : "";
  return <Navigate to={`/settings/apps${suffix}${location.search}${location.hash}`} replace />;
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
        <Route path="/" element={<Navigate to="/studio" replace />} />
        {/* Overview is retired as a separate command center. Studio is home. */}
        <Route path="/overview" element={<ToStudioRedirect />} />

        <Route path="/studio/handoff" element={<BrowserHandoffBridge />} />
        {/* Historical deep links land in Studio; Live Video is not an active product surface. */}
        <Route path="/studio/live-video" element={<Navigate to="/studio" replace />} />
        <Route path="/studio" element={<AgentStudioHome />} />
        <Route path="/studio/*" element={<AgentStudioHome />} />
        <Route path="/agents" element={<ToStudioRedirect />} />
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
        <Route path="/apps" element={<AppsToSettingsRedirect />} />
        <Route path="/apps/command" element={<AppsToSettingsRedirect command />} />
        <Route path="/settings/apps/command" element={<BrowserCommandInstallPage />} />

        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/billing" element={<BillingSettings />} />
        {/* Phone lines are operational work; keep old settings links compatible. */}
        <Route path="/settings/phone" element={<PhoneSettingsRedirect />} />
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
