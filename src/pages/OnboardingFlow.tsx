import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import TransitionSurface from "../components/TransitionSurface";
import { PageMeta } from "../lib/page-meta";
import { customerAgentLanguage } from "../lib/product-copy";
import { emitProductEventOnce } from "../lib/product-event-client";

const CREATE_DESTINATION = "/studio?create=1";

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const language = customerAgentLanguage();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    emitProductEventOnce({
      event: "onboarding_create_redirect",
      metadata: { workspace_model: "one_workspace", target: CREATE_DESTINATION },
    });
    navigate(CREATE_DESTINATION, { replace: true });
  }, [navigate]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowFallback(true), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <PageMeta title="Create" noIndex />
      <TransitionSurface
        eyebrow="Create"
        title={language.createCta}
        busyLabel="Opening"
        actions={
          showFallback
            ? [
                { href: CREATE_DESTINATION, label: "Continue now" },
                { href: "/", label: "Back home", variant: "secondary" },
              ]
            : []
        }
      />
    </>
  );
}
