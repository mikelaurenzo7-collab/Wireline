import SettingsTabs from "../components/settings/SettingsTabs";
import PhoneSetupPanel from "../components/PhoneSetupPanel";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function PhoneSettings() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-8">
      <WorkspacePageFrame mode="standard">
        <SettingsTabs />
        {/* The selected Settings tab already reads "Phone"; the heading stays
            for assistive tech only so the page is not labelled twice on screen. */}
        <WorkspacePageIntro
          title="Phone"
          titleHidden
          description="Configure the voice agent, local number, routing, and company identity from one setup path."
        />
        <PhoneSetupPanel />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
