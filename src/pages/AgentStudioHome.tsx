import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import StudioContextChrome from "../components/studio/StudioContextChrome";
import StudioPageShell from "../components/studio/StudioPageShell";
import StudioWorkspaceV2 from "../components/StudioWorkspaceV2";
import BoOnboarding from "../components/onboarding/BoOnboarding";
import { useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import {
  browserCommandBrief,
  clearBrowserCommandHash,
  readBrowserCommandContext,
  type BrowserCommandContext,
} from "../lib/browser-command-context";
import { readBoOnboarding } from "../lib/bo-onboarding";
import { authFetch } from "../lib/api";

/** Links from before one Bot per account; they now simply open the Workspace. */
const RETIRED_CREATE_PARAMS = ["create", "another"] as const;

export default function AgentStudioHome() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { loading, degraded } = useAgents();
  const { agents } = useStudioActiveAgentId();
  const { toast } = useToast();
  const [browserContext, setBrowserContext] = useState<BrowserCommandContext | null>(() =>
    readBrowserCommandContext(),
  );
  // A brief to start from: a marketing link (?brief=), or a page the browser
  // extension captured. It becomes Bo's first answer, or a chat draft.
  const [brief, setBrief] = useState(() => params.get("brief") || "");

  useEffect(() => {
    if (!RETIRED_CREATE_PARAMS.some((key) => params.has(key)) && !params.has("brief")) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of RETIRED_CREATE_PARAMS) next.delete(key);
        next.delete("brief");
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);

  useEffect(() => {
    if (!browserContext) return;
    clearBrowserCommandHash();
    setBrief(browserCommandBrief(browserContext));
  }, [browserContext]);

  const handoffId = params.get("handoff_id");

  useEffect(() => {
    if (!handoffId || loading) return;

    let cancelled = false;
    const clearHandoffParam = () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("handoff_id");
          return next;
        },
        { replace: true },
      );
    void (async () => {
      const response = await authFetch(
        `/api/browser/handoff/redeem?handoff_id=${encodeURIComponent(handoffId)}`,
      );
      const body = (await response.json().catch(() => null)) as {
        context?: BrowserCommandContext;
        error?: string;
      } | null;
      if (cancelled) return;

      if (!response.ok || !body?.context) {
        toast({
          type: "warning",
          title: "Handoff Expired",
          message: body?.error || "Open BotBound Command and capture the page again.",
          duration: 10_000,
        });
        clearHandoffParam();
        return;
      }

      setBrowserContext(body.context);
      clearHandoffParam();
    })().catch(() => {
      if (cancelled) return;
      toast({
        type: "warning",
        title: "Handoff Unavailable",
        message:
          "The captured page could not be retrieved. Capture it again from BotBound Command.",
        duration: 10_000,
      });
      clearHandoffParam();
    });

    return () => {
      cancelled = true;
    };
  }, [loading, handoffId, setParams, toast]);

  // One Bot per account. An account without one meets Bo, and Bo's first
  // conversation stays open until the owner finishes or leaves it for later.
  const onboarding = readBoOnboarding(user?.id);
  const meetingBo =
    Boolean(user) &&
    !loading &&
    !degraded &&
    (agents.length === 0 || agents.some((agent) => agent.id === onboarding?.agentId));

  if (meetingBo) {
    return (
      <StudioPageShell>
        <BoOnboarding key={user?.id} initialAbout={brief} />
      </StudioPageShell>
    );
  }

  return (
    <StudioPageShell>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <StudioContextChrome />
        <div className="min-h-0 flex-1 overflow-hidden">
          <StudioWorkspaceV2 composerPrefill={brief} onComposerPrefilled={() => setBrief("")} />
        </div>
      </div>
    </StudioPageShell>
  );
}
