import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CreateAgentDialog from "../components/CreateAgentDialog";
import StudioWorkspaceV2 from "../components/StudioWorkspaceV2";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";
import {
  browserCommandBrief,
  clearBrowserCommandHash,
  readBrowserCommandContext,
} from "../lib/browser-command-context";

export default function AgentStudioHome() {
  const [params] = useSearchParams();
  const { loading } = useAgents();
  const wantsBusinessAgent = params.get("posture") === "business";
  const workspaceView = params.get("view") === "workspace";
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

  return (
    <>
      <WorkspaceShell
        eyebrow="Workspace"
        title="Studio"
        contentClassName={
          workspaceView ? "h-full min-h-0 p-0" : "h-full min-h-0 p-0 overflow-hidden"
        }
      >
        <StudioWorkspaceV2 />
      </WorkspaceShell>
      <CreateAgentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        initialBrief={browserBrief || params.get("brief") || ""}
        business={wantsBusinessAgent}
      />
    </>
  );
}
