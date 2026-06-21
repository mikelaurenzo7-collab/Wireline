import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const AgentStudioHome = lazy(() => import("../pages/AgentStudioHome"));
const AgentsPage = lazy(() => import("../pages/AgentsPage"));
const KnowledgePage = lazy(() => import("../pages/KnowledgePage"));
const ActionsPage = lazy(() => import("../pages/ActionsPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const BillingSettings = lazy(() => import("../pages/BillingSettings"));
const AdminSettings = lazy(() => import("../components/AdminSettings"));

const loading = (
  <div className="min-h-screen bg-background p-8 text-sm text-muted-foreground">
    Opening workspace…
  </div>
);

export default function AppRoutes() {
  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route path="/" element={<Navigate to="/studio" replace />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/studio" element={<AgentStudioHome />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/training" element={<Navigate to="/knowledge" replace />} />
        <Route path="/actions" element={<ActionsPage />} />
        <Route path="/ops" element={<Navigate to="/studio" replace />} />
        <Route path="/ops/*" element={<Navigate to="/studio" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/billing" element={<BillingSettings />} />
        <Route path="/admin" element={<AdminSettings />} />
        <Route path="/admin/*" element={<AdminSettings />} />
        <Route path="/help" element={<Navigate to="/studio" replace />} />
        <Route path="/app/personal" element={<Navigate to="/studio" replace />} />
        <Route path="/app/business" element={<Navigate to="/studio" replace />} />
        <Route path="/app/business/*" element={<Navigate to="/studio" replace />} />
        <Route path="*" element={<Navigate to="/studio" replace />} />
      </Routes>
    </Suspense>
  );
}
