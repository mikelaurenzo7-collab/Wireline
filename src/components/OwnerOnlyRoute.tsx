import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { isWirelineOperator } from "../lib/admin-access";

/**
 * Gates owner-only surfaces (Founder's Dashboard). Waits for session hydration
 * before rendering children so non-owners never flash platform-Account Holder UI.
 */
export default function OwnerOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="flex flex-1 min-h-[40vh] items-center justify-center text-muted"
        role="status"
        aria-live="polite"
        aria-label="Loading"
      >
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }

  if (!isWirelineOperator(user)) {
    return <Navigate to="/studio" replace />;
  }

  return <>{children}</>;
}
