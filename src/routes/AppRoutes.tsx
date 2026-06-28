import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import TransitionSurface from "../components/TransitionSurface";

const AgentStudioHome = lazy(() => import("../pages/AgentStudioHome"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const AdminSettings = lazy(() => import("../components/AdminSettings"));
const OverviewPage = lazy(() => import("../pages/OverviewPage"));
const AgentsPage = lazy(() => import("../pages/AgentsPage"));
const TemplatesPage = lazy(() => import("../pages/TemplatesPage"));
const KnowledgePage = lazy(() => import("../pages/KnowledgePage"));
const ConnectionsPage = lazy(() => import("../pages/ConnectionsPage"));
const CallLogsPage = lazy(() => import("../pages/CallLogsPage"));
const EmailPage = lazy(() => import("../pages/EmailPage"));
const ClientAppsPage = lazy(() => import("../pages/ClientAppsPage"));

const loading = (
  <TransitionSurface
    eyebrow="Workspace"
    title="Loading the next screen"
    description="Keeping your workspace context in place while this surface loads."
    busyLabel="Loading route"
  />
);

export default function AppRoutes() {
  return (
    <Suspense fallback={loading}>
      <Routes>
        {/* Letterpress workspace — full sidebar IA from the Claude Design.
           Workspace: Home/Overview, Agent Studio, Assistants/Templates, Knowledge.
           Operate: Connections, Call Logs, Inbox, Apps, Settings. */}
        <Route path="/" element={<Navigate to="/overview" replace />} />

        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/studio" element={<AgentStudioHome />} />
        <Route path="/studio/*" element={<AgentStudioHome />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />

        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/connections/*" element={<ConnectionsPage />} />
        <Route path="/call-logs" element={<CallLogsPage />} />
        <Route path="/inbox" element={<EmailPage />} />
        <Route path="/apps" element={<ClientAppsPage />} />

        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/*" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminSettings />} />
        <Route path="/admin/*" element={<AdminSettings />} />

        {/* Legacy path redirects into the restored IA */}
        <Route path="/pulse" element={<Navigate to="/overview" replace />} />
        <Route path="/fleet" element={<Navigate to="/agents" replace />} />
        <Route path="/ops" element={<Navigate to="/call-logs" replace />} />
        <Route path="/ops/*" element={<Navigate to="/call-logs" replace />} />
        <Route path="/training" element={<Navigate to="/knowledge" replace />} />
        <Route path="/actions" element={<Navigate to="/call-logs" replace />} />
        <Route path="/nexus" element={<Navigate to="/connections" replace />} />
        <Route path="/wires" element={<Navigate to="/connections" replace />} />

        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Suspense>
  );
}
