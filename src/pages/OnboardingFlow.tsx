import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import TransitionSurface from "../components/TransitionSurface";
import { PageMeta } from "../lib/page-meta";
import { readStoredWorkspaceMode } from "../lib/auth-redirect";
import { customerAgentLanguage } from "../lib/product-copy";
import { emitProductEventOnce } from "../lib/product-event-client";

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const workspaceMode = readStoredWorkspaceMode();
  const language = customerAgentLanguage(workspaceMode);
  const [showFallback, setShowFallback] = useState(false);
  // Dedicated entry for direct-to-create flows (e.g. ?onboarding or explicit links).
  // Default post-login (even for fresh) is /overview (Home). Use /studio?create or this flow
  // to go straight to create in Studio when appropriate for signup or dedicated flows.
  const target =
    workspaceMode === "business" ? "/studio?create=1&posture=business" : "/studio?create=1";
  const details = [
    {
      label: "Workspace",
      value: workspaceMode === "business" ? "Business mode ready." : "Personal mode ready.",
    },
    {
      label: "Next",
      value: `Opening your first ${language.singular} brief.`,
    },
  ];

  useEffect(() => {
    emitProductEventOnce({
      event: "onboarding_create_redirect",
      metadata: { workspace_mode: workspaceMode, target },
    });
    navigate(target, { replace: true });
  }, [navigate, target, workspaceMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowFallback(true), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <PageMeta title="Opening create flow - Wireline" noIndex />
      <TransitionSurface
        eyebrow="Create flow"
        title={`Opening your first ${language.singular}`}
        busyLabel="Routing now"
        details={details}
        actions={
          showFallback
            ? [
                { href: target, label: "Continue now" },
                { href: "/", label: "Back home", variant: "secondary" },
              ]
            : []
        }
      />
    </>
  );
}
