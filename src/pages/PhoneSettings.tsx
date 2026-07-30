import SettingsTabs from "../components/settings/SettingsTabs";
import PhoneSetupPanel from "../components/PhoneSetupPanel";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function PhoneSettings() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-8">
      <WorkspacePageFrame mode="standard">
        <SettingsTabs />
        <WorkspacePageIntro
          title="Phone"
          description="Configure the voice agent, local number, routing, and company identity from one setup path."
        />
        <PhoneSetupPanel />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
