/**
 * @deprecated Supervisor Cockpit merged into Live Ops (/ops?tab=floor).
 * Kept as a redirect for any stale imports; routing uses Navigate in AppRoutes.
 */
import { Navigate } from "react-router-dom";

export default function SupervisorCockpit() {
  return <Navigate to="/ops?tab=floor" replace />;
}
