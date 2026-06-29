import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CreateAgentDialog from "../components/CreateAgentDialog";
import StudioContextChrome from "../components/studio/StudioContextChrome";
import StudioWorkspaceV2 from "../components/StudioWorkspaceV2";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";

export default function AgentStudioHomeClaude() {
  const [params] = useSearchParams();
  const { loading } = useAgents();
  const wantsBusinessAgent = params.get("posture") === "business";
  const workspaceView = params.get("view") === "workspace";
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!loading && params.get("create") === "1") setShowCreate(true);
  }, [loading, params]);

  return (
    <>
      <WorkspaceShell
        eyebrow="Workspace"
        title="Studio"
        contentClassName={
          workspaceView ? "h-full min-h-0 p-0" : "h-full min-h-0 p-0 overflow-hidden"
        }
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <StudioContextChrome />
          <div className="min-h-0 flex-1 overflow-hidden">
            <StudioWorkspaceV2 />
          </div>
        </div>
      </WorkspaceShell>
      <CreateAgentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        initialBrief={params.get("brief") || ""}
        business={wantsBusinessAgent}
      />
    </>
  );
}
