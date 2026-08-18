import { Navigate } from "react-router";

/**
 * Live talking-head lip-sync is retired.
 * Historical route module retained only so old imports/deep links fail safely.
 * The former visual-identity face surface, avatar selection, and face
 * customization are intentionally gone; Studio owns Bot configuration.
 */
export default function LiveVideoStudioPage() {
  return <Navigate to="/studio" replace />;
}
