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
            for assistive tech only so the page is not labelled twice on screen.
            The setup panel below carries its own intro, so no description here. */}
        <WorkspacePageIntro title="Phone" titleHidden />
        <PhoneSetupPanel />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
