/**
 * Avatar picker — choose a catalog presenter for a business agent.
 *
 * Workspace env default (LIVEAVATAR_DEFAULT_AVATAR_ID) is a bootstrap fallback
 * for preview and go-live. Each agent stores its own pick in
 * video_presenter_avatar_id — that choice always wins.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { authFetch } from "../lib/api";
import { consentLabel, presenterCustomizationMessage } from "../lib/video-presenter/copy";
import type { AgentVideoPresenterConfig } from "../lib/video-presenter/types";

type CatalogAvatar = {
  id: string;
  name: string;
  previewImageUrl?: string | null;
};

export default function AgentPresenceAvatarPicker({
  agentId,
  presenter,
  platformConfigured,
  workspaceDefaultAvatarId = null,
  onUpdated,
}: {
  agentId: string;
  presenter: AgentVideoPresenterConfig;
  platformConfigured: boolean;
  workspaceDefaultAvatarId?: string | null;
  onUpdated: (next: AgentVideoPresenterConfig) => void;
}) {
  const [avatars, setAvatars] = useState<CatalogAvatar[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const customizationNote = presenterCustomizationMessage(presenter);

  useEffect(() => {
    if (!platformConfigured) return;
    let cancelled = false;
    setLoading(true);
    authFetch("/api/video-presenter/avatars")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || "Catalog could not be loaded.");
        if (!cancelled) setAvatars(Array.isArray(payload.avatars) ? payload.avatars : []);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Catalog could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [platformConfigured]);

  const selectAvatar = useCallback(
    async (avatarId: string) => {
      setSavingId(avatarId);
      setError(null);
      try {
        const response = await authFetch(
          `/api/agents/${encodeURIComponent(agentId)}/video-presenter`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              avatarId,
              consentStatus: "approved",
            }),
          },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || "Presenter could not be saved.");
        onUpdated(payload.presenter);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Presenter could not be saved.");
      } finally {
        setSavingId(null);
      }
    },
    [agentId, onUpdated],
  );

  if (!platformConfigured) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Presenter catalog
          </p>
          <span className="wl-presence__chip">{consentLabel(presenter.consentStatus)}</span>
        </div>
        <p className="max-w-[58ch] text-xs leading-relaxed text-muted-foreground">
          Each agent gets its own photoreal face. Your workspace default is only a starting point —
          pick any catalog presenter and it saves to this agent only.
        </p>
        {customizationNote ? (
          <p className="text-xs font-medium text-[var(--wireline-color-action-primary-default)]">
            {customizationNote}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-busy="true">
          <Loader2 className="size-3.5 animate-spin" />
          Loading presenters…
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-[var(--wireline-color-status-warning)]" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && avatars.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {avatars.map((avatar) => {
            const agentSelected = presenter.chosenAvatarId === avatar.id;
            const activeViaDefault =
              !presenter.chosenAvatarId &&
              presenter.avatarSource === "workspace_default" &&
              workspaceDefaultAvatarId === avatar.id &&
              presenter.avatarId === avatar.id;
            const isWorkspaceDefault =
              workspaceDefaultAvatarId && avatar.id === workspaceDefaultAvatarId;
            const saving = savingId === avatar.id;

            return (
              <button
                key={avatar.id}
                type="button"
                onClick={() => void selectAvatar(avatar.id)}
                disabled={Boolean(savingId)}
                aria-pressed={agentSelected}
                aria-label={`${avatar.name}${isWorkspaceDefault ? ", workspace default" : ""}${agentSelected ? ", selected for this agent" : activeViaDefault ? ", active via workspace default" : ""}`}
                className={`group relative overflow-hidden rounded-[12px] border text-left transition-colors ${
                  agentSelected
                    ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)]"
                    : activeViaDefault
                      ? "border-primary/25 bg-primary/[0.04]"
                      : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <div className="aspect-[4/5] bg-[var(--wireline-color-surface-subtle)]">
                  {avatar.previewImageUrl ? (
                    <img
                      src={avatar.previewImageUrl}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid size-full place-items-center text-[10px] text-muted-foreground">
                      {avatar.name}
                    </div>
                  )}
                </div>
                <div className="space-y-1 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[11px] font-medium text-foreground">
                      {avatar.name}
                    </span>
                    {agentSelected ? (
                      <Check className="size-3 shrink-0 text-primary" aria-hidden="true" />
                    ) : saving ? (
                      <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
                    ) : null}
                  </div>
                  {isWorkspaceDefault ? (
                    <span className="inline-block rounded-full border border-border bg-[var(--wireline-color-surface-subtle)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                      Workspace default
                    </span>
                  ) : null}
                  {activeViaDefault && !agentSelected ? (
                    <span className="inline-block text-[9px] font-medium text-muted-foreground">
                      Active until you pick
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
