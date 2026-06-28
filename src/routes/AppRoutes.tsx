import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import TransitionSurface from "../components/TransitionSurface";

const AgentStudioHome = lazy(() => import("../pages/AgentStudioHome"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const AdminSettings = lazy(() => import("../components/AdminSettings"));

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
        {/* Masterful agent-centric design:
           - Default /studio is the open canvas.
           - New users: big clean canvas with composer to create first agent.
           - Agents appear as icons in rail + cards in canvas.
           - Each agent has its own workspace containing chat, memory, training, knowledge, everything.
           - Minimal rail: Studio icon + agent icons + settings.
        */}
        <Route path="/" element={<Navigate to="/studio" replace />} />
        <Route path="/studio" element={<AgentStudioHome />} />
        <Route path="/studio/*" element={<AgentStudioHome />} />

        {/* Consolidated legacy redirects to the studio canvas */}
        <Route path="/overview" element={<Navigate to="/studio" replace />} />
        <Route path="/pulse" element={<Navigate to="/studio" replace />} />
        <Route path="/fleet" element={<Navigate to="/studio" replace />} />
        <Route path="/agents" element={<Navigate to="/studio" replace />} />
        <Route path="/ops" element={<Navigate to="/studio" replace />} />
        <Route path="/ops/*" element={<Navigate to="/studio" replace />} />
        <Route path="/training" element={<Navigate to="/studio" replace />} />
        <Route path="/knowledge" element={<Navigate to="/studio" replace />} />
        <Route path="/actions" element={<Navigate to="/studio" replace />} />
        <Route path="/nexus" element={<Navigate to="/studio" replace />} />
        <Route path="/inbox" element={<Navigate to="/studio" replace />} />
        <Route path="/wires" element={<Navigate to="/studio" replace />} />
        {/* Single redirect for old connections paths */}
        <Route path="/connections" element={<Navigate to="/studio" replace />} />
        <Route path="/connections/*" element={<Navigate to="/studio" replace />} />

        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/*" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminSettings />} />
        <Route path="/admin/*" element={<AdminSettings />} />

        <Route path="*" element={<Navigate to="/studio" replace />} />
      </Routes>
    </Suspense>
  );
}
