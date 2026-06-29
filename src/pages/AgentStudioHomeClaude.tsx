import StudioContextChrome from "../components/studio/StudioContextChrome";
import StudioWorkspaceV2 from "../components/StudioWorkspaceV2";

export default function AgentStudioHomeClaude() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <StudioContextChrome />
      <div className="min-h-0 flex-1 overflow-hidden">
        <StudioWorkspaceV2 />
      </div>
    </div>
  );
}
