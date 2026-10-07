import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import RouteFallback from "../components/layout/RouteFallback";
import WorkspaceShell from "../components/WorkspaceShell";
import NotFound from "../components/layout/NotFound";
import RouteChangeA11y from "../components/RouteChangeA11y";
import { VisualQaPageMarker, withVisualQaPage } from "../components/VisualQaMarker";
import { legacyAppointmentsDestination } from "../lib/page-sub-tabs";

const AgentStudioHome = lazy(() =>
  import("../pages/AgentStudioHome").then((module) => withVisualQaPage(module, "studio")),
);
const BrowserHandoffBridge = lazy(() => import("../pages/BrowserHandoffBridge"));
const SettingsPage = lazy(() =>
  import("../pages/SettingsPage").then((module) => withVisualQaPage(module, "settings", "account")),
);
const AdminSettings = lazy(() =>
  import("../components/AdminSettings").then((module) => withVisualQaPage(module, "admin")),
);
const TemplatesPage = lazy(() =>
  import("../pages/TemplatesPage").then((module) => withVisualQaPage(module, "templates")),
);
const KnowledgePage = lazy(() =>
  import("../pages/KnowledgePage").then((module) => withVisualQaPage(module, "knowledge")),
);
const ConnectionsPage = lazy(() =>
  import("../pages/ConnectionsPage").then((module) => withVisualQaPage(module, "connections")),
);
const SalesforceIntegrationPage = lazy(() =>
  import("../pages/SalesforceIntegrationPage").then((module) =>
    withVisualQaPage(module, "salesforce"),
  ),
);
const PhonePage = lazy(() =>
  import("../pages/PhonePage").then((module) => withVisualQaPage(module, "phone")),
);
const CalendarPage = lazy(() =>
  import("../pages/CalendarPage").then((module) => withVisualQaPage(module, "calendar")),
);
const ComputerPage = lazy(() =>
  import("../pages/ComputerPage").then((module) => withVisualQaPage(module, "computer")),
);
const InsightsPage = lazy(() =>
  import("../pages/InsightsPage").then((module) => withVisualQaPage(module, "insights")),
);
const EmailPage = lazy(() =>
  import("../pages/EmailPage").then((module) => withVisualQaPage(module, "inbox")),
);
const ApprovalsPage = lazy(() =>
  import("../pages/ApprovalsPage").then((module) => withVisualQaPage(module, "approvals")),
);
const ClientAppsPage = lazy(() =>
  import("../pages/ClientAppsPage").then((module) => withVisualQaPage(module, "settings", "apps")),
);
const BrowserCommandInstallPage = lazy(() =>
  import("../pages/BrowserCommandInstallPage").then((module) =>
    withVisualQaPage(module, "settings", "apps-command"),
  ),
);
const BillingSettings = lazy(() =>
  import("../pages/BillingSettings").then((module) =>
    withVisualQaPage(module, "settings", "billing"),
  ),
);
const TeamSettings = lazy(() =>
  import("../pages/TeamSettings").then((module) => withVisualQaPage(module, "settings", "team")),
);
const ComplianceCenterPage = lazy(() =>
  import("../pages/ComplianceCenterPage").then((module) =>
    withVisualQaPage(module, "settings", "compliance"),
  ),
);
const CustomizationSettings = lazy(() =>
  import("../pages/CustomizationSettings").then((module) =>
    withVisualQaPage(module, "settings", "customization"),
  ),
);

const loading = <RouteFallback />;

function PreservingRedirect({
  to,
  searchParams,
}: {
  to: string;
  searchParams?: Record<string, string>;
}) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(searchParams ?? {})) search.set(key, value);
  const query = search.toString();
  return <Navigate to={`${to}${query ? `?${query}` : ""}${location.hash}`} replace />;
}

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

/** Appointments have one home; retain scoped bookmarks and anchors. */
export function PhoneRoute() {
  const location = useLocation();
  const destination = legacyAppointmentsDestination(location.search, location.hash);
  return destination ? <Navigate to={destination} replace /> : <PhonePage />;
}

/** Apps lives under Settings; preserve old bookmarks without maintaining two chromes. */
function AppsToSettingsRedirect({ command = false }: { command?: boolean }) {
  const location = useLocation();
  const suffix = command ? "/command" : "";
  return <Navigate to={`/settings/apps${suffix}${location.search}${location.hash}`} replace />;
}

function AuthNotFound() {
  return (
    <VisualQaPageMarker page="authenticated-not-found" state="not-found">
      <WorkspaceShell>
        <NotFound />
      </WorkspaceShell>
    </VisualQaPageMarker>
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
      <RouteChangeA11y />
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
        <Route
          path="/call-logs"
          element={<PreservingRedirect to="/phone" searchParams={{ tab: "logs" }} />}
        />
        <Route
          path="/logs"
          element={<PreservingRedirect to="/phone" searchParams={{ tab: "logs" }} />}
        />
        <Route path="/calls" element={<PreservingRedirect to="/phone" />} />
        <Route path="/phone" element={<PhoneRoute />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/computer" element={<ComputerPage />} />
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
        <Route path="/dnc" element={<PreservingRedirect to="/settings/compliance" />} />
        <Route
          path="/audit"
          element={<PreservingRedirect to="/admin" searchParams={{ tab: "activity" }} />}
        />
        <Route path="/admin" element={<AdminWorkspace />} />
        <Route path="/admin/*" element={<AdminWorkspace />} />

        <Route path="*" element={<AuthNotFound />} />
      </Routes>
    </Suspense>
  );
}
