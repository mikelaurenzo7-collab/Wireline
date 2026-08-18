import { Navigate } from "react-router";

/**
 * Historical route module retained only so old imports/deep links fail safely.
 * Live Video, avatar selection, and face customization are not active product
 * surfaces; Studio owns bot configuration.
 */
export default function LiveVideoStudioPage() {
  return <Navigate to="/studio" replace />;
}
