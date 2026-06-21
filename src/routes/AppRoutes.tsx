import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const AgentStudioHome = lazy(() => import("../pages/AgentStudioHome"));
const AgentsPage = lazy(() => import("../pages/AgentsPage"));
const KnowledgePage = lazy(() => import("../pages/KnowledgePage"));
const IntegrationsPage = lazy(() => import("../pages/IntegrationsPage"));
const OperationsPage = lazy(() => import("../pages/OperationsPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));

const loading = <div className="min-h-screen bg-[#f7f7f5] p-8 text-sm text-[#66666d]">Opening workspace…</div>;

export default function AppRoutes() {
  return <Suspense fallback={loading}><Routes>
    <Route path="/" element={<Navigate to="/agents" replace />} />
    <Route path="/agents" element={<AgentsPage />} />
    <Route path="/studio" element={<AgentStudioHome />} />
    <Route path="/knowledge" element={<KnowledgePage />} />
    <Route path="/training" element={<KnowledgePage />} />
    <Route path="/integrations" element={<IntegrationsPage />} />
    <Route path="/ops" element={<OperationsPage />} />
    <Route path="/ops/*" element={<OperationsPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/admin" element={<Navigate to="/settings" replace />} />
    <Route path="/help" element={<Navigate to="/studio" replace />} />
    <Route path="*" element={<Navigate to="/agents" replace />} />
  </Routes></Suspense>;
}
