import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

import { emitProductEventOnce } from "../lib/product-event-client";

/**
 * /onboarding predates one Bot per account. The Workspace is where an owner
 * meets Bo, so the old link keeps its query (a starter id, a brief) and opens it.
 */
export default function OnboardingFlow() {
  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    emitProductEventOnce({
      event: "onboarding_create_redirect",
      metadata: { workspace_model: "one_workspace", target: "/studio" },
    });
    navigate(`/studio${search}`, { replace: true });
  }, [navigate, search]);

  return null;
}
