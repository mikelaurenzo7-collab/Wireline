/**
 * Presence catalog hold — live/video presenter selection is intentionally paused.
 *
 * The current deterministic avatars remain useful as in-app identifiers. Premium
 * human/character Presence will return here only after the catalog is curated,
 * rights-cleared, and strong enough to improve trust.
 */
import { presenterCustomizationMessage } from "../lib/video-presenter/copy";
import type { AgentVideoPresenterConfig } from "../lib/video-presenter/types";

export default function AgentPresenceAvatarPicker({
  presenter,
  platformConfigured,
  workspaceDefaultAvatarId = null,
}: {
  agentId: string;
  presenter: AgentVideoPresenterConfig;
  platformConfigured: boolean;
  workspaceDefaultAvatarId?: string | null;
  onUpdated: (next: AgentVideoPresenterConfig) => void;
}) {
  const customizationNote = presenterCustomizationMessage(presenter);
  const hasSavedCatalogPick = Boolean(presenter.chosenAvatarId || workspaceDefaultAvatarId);

  if (!platformConfigured && !hasSavedCatalogPick) return null;

  return (
    <div className="mt-4 rounded-[12px] border border-dashed border-border bg-card/40 p-4">
      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Presence catalog paused
        </p>
        <p className="max-w-[62ch] text-xs leading-relaxed text-muted-foreground">
          Wireline avatars now stay as app-only identifiers for Studio, training, analytics, and
          call logs. Video presenters are paused until the Professional / Character / Custom
          Presence Catalog is curated and launch-quality.
        </p>
        {customizationNote ? (
          <p className="text-xs font-medium text-[var(--wireline-color-action-primary-default)]">
            Saved catalog pick retained for future migration · {customizationNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}
