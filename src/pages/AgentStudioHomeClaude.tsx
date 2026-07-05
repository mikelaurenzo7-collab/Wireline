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
} from "../lib/browser-command-context";
import { consumeCreateWarning } from "../lib/wireline-create-flow";

export default function AgentStudioHomeClaude() {
  const [params] = useSearchParams();
  const { loading } = useAgents();
  const { toast } = useToast();
  const wantsBusinessAgent = params.get("posture") === "business";
  const [browserContext] = useState(readBrowserCommandContext);
  const browserBrief = browserCommandBrief(browserContext);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!loading && params.get("create") === "1") setShowCreate(true);
  }, [loading, params]);

  useEffect(() => {
    if (!browserBrief) return;
    setShowCreate(true);
    clearBrowserCommandHash();
  }, [browserBrief]);

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
  }, [toast]);

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
        initialBrief={browserBrief || params.get("brief") || ""}
        business={wantsBusinessAgent}
      />
    </>
  );
}
