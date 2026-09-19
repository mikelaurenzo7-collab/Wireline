import AppearanceSettings from "../components/settings/AppearanceSettings";
import SettingsTabs from "../components/settings/SettingsTabs";
import WorkspaceBrandingSettings from "../components/settings/WorkspaceBrandingSettings";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function CustomizationSettings() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-5">
      <WorkspacePageFrame mode="narrow">
        <SettingsTabs />
        <WorkspacePageIntro title="Appearance & brand" titleHidden />
        <AppearanceSettings />
        <WorkspaceBrandingSettings />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
