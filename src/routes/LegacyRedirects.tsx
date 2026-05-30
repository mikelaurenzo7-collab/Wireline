import { Navigate, useSearchParams } from "react-router-dom";

/** Legacy /activity → Phone channel (call history lives under Phone, not Live Ops). */
export function ActivityRedirect() {
  const [params] = useSearchParams();
  const tab = params.get("tab");
  const target = tab === "appointments" ? "/phone?tab=appointments" : "/phone";
  return <Navigate to={target} replace />;
}
