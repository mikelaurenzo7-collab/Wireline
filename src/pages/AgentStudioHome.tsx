import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CreateAgentDialog from "../components/CreateAgentDialog";
import StudioWorkspaceV2 from "../components/StudioWorkspaceV2";
import { useAgents } from "../contexts/AgentsContext";
import { browserCompanionBrief, clearBrowserCompanionHash, readBrowserCompanionContext } from "../lib/browser-companion-context";

export default function AgentStudioHome() {
  const [params] = useSearchParams();
  const { loading } = useAgents();
  const wantsBusinessAgent = params.get("posture") === "business";
  const [browserContext] = useState(readBrowserCompanionContext);
  const browserBrief = browserCompanionBrief(browserContext);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!loading && params.get("create") === "1") setShowCreate(true);
  }, [loading, params]);

  useEffect(() => {
    if (!browserBrief) return;
    setShowCreate(true);
    clearBrowserCompanionHash();
  }, [browserBrief]);

  return (
    <>
      <div className="h-[100dvh] min-h-0 overflow-hidden"><StudioWorkspaceV2 /></div>
      <CreateAgentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        initialBrief={browserBrief}
        business={wantsBusinessAgent}
      />
    </>
  );
}
