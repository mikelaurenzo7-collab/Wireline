import { Navigate } from "react-router";

/**
 * Live talking-head lip-sync is retired.
 * Historical route module retained only so old imports/deep links fail safely.
 * The former title="Identity" / AgentFace surface, avatar selection, and face
 * customization are intentionally gone; Studio owns bot configuration.
 */
export default function LiveVideoStudioPage() {
  return <Navigate to="/studio" replace />;
}
