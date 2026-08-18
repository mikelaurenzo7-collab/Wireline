import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import TransitionSurface from "../components/TransitionSurface";
import { PageMeta } from "../lib/page-meta";
import { customerAgentLanguage } from "../lib/product-copy";
import { emitProductEventOnce } from "../lib/product-event-client";

const target = "/studio?create=1";
const language = customerAgentLanguage("personal");

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    emitProductEventOnce({
      event: "onboarding_create_redirect",
      metadata: { workspace_model: "one_workspace", object: "bot", target },
    });
    navigate(target, { replace: true });
  }, [navigate]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowFallback(true), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <PageMeta title="Create Bot" noIndex />
      <TransitionSurface
        eyebrow="Create"
        title={language.createCta}
        busyLabel="Opening"
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
