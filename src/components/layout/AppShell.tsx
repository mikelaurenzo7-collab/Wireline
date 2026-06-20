import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import AppRoutes from "../../routes/AppRoutes";

export default function AppShell() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="studio-route-loading">Opening Wireline…</div>;

  if (!user) {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/signin?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  return <AppRoutes />;
}
