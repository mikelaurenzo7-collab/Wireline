import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CreateAgentDialog from "../components/CreateAgentDialog";
import StudioContextChrome from "../components/studio/StudioContextChrome";
import StudioPageShell from "../components/studio/StudioPageShell";
import StudioWorkspaceV2 from "../components/StudioWorkspaceV2";
import { useAgents } from "../contexts/AgentsContext";
import { useToast } from "../contexts/ToastContext";
import {
  browserCommandBrief,
  clearBrowserCommandHash,
  readBrowserCommandContext,
  type BrowserCommandContext,
} from "../lib/browser-command-context";
import { consumeCreateWarning, readPostCreateWizard } from "../lib/wireline-create-flow";
import type { PostCreateWizardPayload } from "../lib/wireline-create-flow";
import PostCreateActivationWizard from "../components/onboarding/PostCreateActivationWizard";
import { authFetch } from "../lib/api";

export default function AgentStudioHomeClaude() {
  const [params, setParams] = useSearchParams();
  const { loading } = useAgents();
  const { toast } = useToast();
  const wantsBusinessAgent = params.get("posture") === "business";
  const [browserContext, setBrowserContext] = useState<BrowserCommandContext | null>(() =>
    readBrowserCommandContext(),
  );
  const browserBrief = browserCommandBrief(browserContext);
  const [showCreate, setShowCreate] = useState(false);
  const [postCreateWizard, setPostCreateWizard] = useState<PostCreateWizardPayload | null>(null);
  const [signedBrief, setSignedBrief] = useState("");

  useEffect(() => {
    if (!loading && params.get("create") === "1") setShowCreate(true);
  }, [loading, params]);

  useEffect(() => {
    if (!browserContext) return;
    clearBrowserCommandHash();
  }, [browserContext]);

  const handoffToken = params.get("handoff");

  useEffect(() => {
    if (!handoffToken || loading) return;

    let cancelled = false;
    void (async () => {
      const response = await authFetch(
        `/api/browser/handoff/redeem?token=${encodeURIComponent(handoffToken)}`,
      );
      const body = (await response.json()) as {
        context?: BrowserCommandContext;
        error?: string;
      };
      if (cancelled) return;

      if (!response.ok || !body.context) {
        toast({
          type: "warning",
          title: "Handoff expired",
          message: body.error || "Open Wireline Command and capture the page again.",
          duration: 10_000,
        });
        return;
      }

      setBrowserContext(body.context);
      setSignedBrief(browserCommandBrief(body.context));
      setShowCreate(true);
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("handoff");
          return next;
        },
        { replace: true },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, handoffToken, setParams, toast]);

  useEffect(() => {
    const warning = consumeCreateWarning();
    if (warning) {
      toast({
        type: "warning",
        title: "Agent created",
        message: warning,
        duration: 12_000,
      });
    }
    const wizard = readPostCreateWizard();
    if (wizard) setPostCreateWizard(wizard);
  }, [toast]);

  const initialBrief = signedBrief || browserBrief || params.get("brief") || "";

  return (
    <>
      <StudioPageShell>
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <StudioContextChrome />
          <div className="min-h-0 flex-1 overflow-hidden">
            <StudioWorkspaceV2 />
          </div>
        </div>
      </StudioPageShell>
      <CreateAgentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        initialBrief={initialBrief}
        business={wantsBusinessAgent}
      />
      {postCreateWizard ? (
        <PostCreateActivationWizard
          payload={postCreateWizard}
          onClose={() => {
            setPostCreateWizard(null);
          }}
        />
      ) : null}
    </>
  );
}
