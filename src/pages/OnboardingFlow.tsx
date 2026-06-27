import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, WandSparkles } from "lucide-react";

import { PageMeta } from "../lib/page-meta";
import { readStoredWorkspaceMode } from "../lib/auth-redirect";

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const workspaceMode = readStoredWorkspaceMode();
  // Dedicated entry for direct-to-create flows (e.g. ?onboarding or explicit links).
  // Default post-login (even for fresh) is /overview (Home). Use /studio?create or this flow
  // to go straight to create in Studio when appropriate for signup or dedicated flows.
  const target =
    workspaceMode === "business" ? "/studio?create=1&posture=business" : "/studio?create=1";

  useEffect(() => {
    navigate(target, { replace: true });
  }, [navigate, target]);

  return (
    <>
      <PageMeta title="Opening create flow - Wireline" noIndex />
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="studio-card flex w-full max-w-xl flex-col items-center gap-4 p-8 text-center">
          <span className="grid size-12 place-items-center rounded-full border border-border bg-card text-primary">
            <WandSparkles className="size-5" />
          </span>
          <div>
            <h1 className="text-[var(--wireline-typography-h2-size)] font-semibold tracking-[-.03em]">
              Opening Create Agent
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This flow opens Studio create directly. The default logged-in destination is /overview
              (Home). Fresh signups and create links can target Studio create when appropriate.
            </p>
          </div>
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
    </>
  );
}
