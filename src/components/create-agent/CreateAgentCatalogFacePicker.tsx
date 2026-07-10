import { useEffect } from "react";

import AgentFace from "../AgentFace";
import { buildAgentIdentityPreview } from "../../lib/agent-identity";
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";

export type MatchedPresenterVoice = {
  voiceId: string;
  name: string;
};

export type FacePickerValue = { mode: "wireline" } | { mode: "catalog"; avatarId: string };

type CreateAgentCatalogFacePickerProps = {
  agentName: string;
  role: string;
  isBusinessAgent: boolean;
  value: FacePickerValue;
  onChange: (next: FacePickerValue) => void;
  onMatchedVoiceChange?: (voice: MatchedPresenterVoice | null) => void;
};

export default function CreateAgentCatalogFacePicker({
  agentName,
  role,
  isBusinessAgent,
  value,
  onChange,
  onMatchedVoiceChange,
}: CreateAgentCatalogFacePickerProps) {
  const identity = buildAgentIdentityPreview({
    name: agentName,
    role,
    isBusinessAgent,
  });

  useEffect(() => {
    onMatchedVoiceChange?.(null);
    if (value.mode !== "wireline") onChange({ mode: "wireline" });
  }, [onChange, onMatchedVoiceChange, value.mode]);

  return (
    <div className="grid gap-3">
      <p className={WL_APP_CLASSES.wiredEyebrow}>Agent identity badge</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        The avatar is only an in-app identifier so you can recognize this agent across Studio,
        training, analytics, and call logs. It is not a video presenter.
      </p>

      <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-card/60 p-3">
        <AgentFace seed={identity.seed} size={52} title={`${agentName} identity badge`} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{identity.persona.label}</p>
          <p className="text-xs text-muted-foreground">{identity.video.headline}</p>
        </div>
        <span className="ml-auto shrink-0 rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
          Selected
        </span>
      </div>

      <p className="rounded-xl border border-dashed border-border px-3 py-4 text-xs leading-relaxed text-muted-foreground">
        Professional human and character presenters are paused until the curated Presence Catalog is
        launch-quality. Keep using the badge for app navigation; video outputs come back as a premium
        catalog, not a placeholder face picker.
      </p>
    </div>
  );
}
