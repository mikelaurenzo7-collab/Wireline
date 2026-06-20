import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const AgentStudioHome = lazy(() => import("../pages/AgentStudioHome"));

function StudioRoute() {
  return (
    <Suspense fallback={<div className="studio-route-loading">Opening your studio…</div>}>
      <AgentStudioHome />
    </Suspense>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/agents" replace />} />
      <Route path="/agents" element={<StudioRoute />} />
      <Route path="/integrations" element={<StudioRoute />} />
      <Route path="/training" element={<StudioRoute />} />
      <Route path="/settings" element={<StudioRoute />} />
      <Route path="/admin" element={<Navigate to="/settings" replace />} />

      <Route path="/ops" element={<Navigate to="/agents" replace />} />
      <Route path="/ops/*" element={<Navigate to="/agents" replace />} />
      <Route path="/dashboard" element={<Navigate to="/agents" replace />} />
      <Route path="/command" element={<Navigate to="/agents" replace />} />
      <Route path="/live" element={<Navigate to="/agents" replace />} />
      <Route path="/triage" element={<Navigate to="/agents" replace />} />
      <Route path="/insights" element={<Navigate to="/agents" replace />} />
      <Route path="/pipeline" element={<Navigate to="/agents" replace />} />
      <Route path="/phone" element={<Navigate to="/agents" replace />} />
      <Route path="/email" element={<Navigate to="/agents" replace />} />
      <Route path="/sms" element={<Navigate to="/agents" replace />} />
      <Route path="/personal-home" element={<Navigate to="/agents" replace />} />
      <Route path="/founder" element={<Navigate to="/agents" replace />} />
      <Route path="/chat" element={<Navigate to="/agents" replace />} />
      <Route path="/chat/*" element={<Navigate to="/agents" replace />} />
      <Route path="/director" element={<Navigate to="/agents" replace />} />
      <Route path="/director/*" element={<Navigate to="/agents" replace />} />
      <Route path="/app/*" element={<Navigate to="/agents" replace />} />
      <Route path="/help" element={<StudioRoute />} />
      <Route path="*" element={<Navigate to="/agents" replace />} />
    </Routes>
  );
}
