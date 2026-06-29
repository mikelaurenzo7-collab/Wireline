import { Navigate } from "react-router-dom";

/** Retired route compatibility: agent roster lives in Overview. */
export default function AgentsPage() {
  return <Navigate to="/overview" replace />;
}
