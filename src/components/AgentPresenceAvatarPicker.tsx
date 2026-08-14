/**
 * Live Video presenter catalog for business agents.
 *
 * Catalog inventory is loaded through Wireline's authenticated server route so
 * provider credentials never reach the browser. A selected public presenter is
 * stored per agent and remains independent from the always-on in-app identity badge.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { authFetch } from "../lib/api";
import { presenterCustomizationMessage } from "../lib/video-presenter/copy";
import type { AgentVideoPresenterConfig } from "../lib/video-presenter/types";
import { Button } from "./atoms";

type CatalogAvatar = {
  id: string;
  name: string;
  previewImageUrl?: string | null;
  defaultVoiceId?: string | null;
};

type CatalogResponse = {
  avatars?: CatalogAvatar[];
  sandbox?: boolean;
  error?: string;
};

const INITIAL_VISIBLE_AVATARS = 12;

export function hasPresenceCatalogPick(
  presenter: Pick<AgentVideoPresenterConfig, "chosenAvatarId"> | null | undefined,
  workspaceDefaultAvatarId?: string | null,
): boolean {
  return Boolean(presenter?.chosenAvatarId || workspaceDefaultAvatarId);
}

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
  const [expanded, setExpanded] = useState(false);
  const customizationNote = presenterCustomizationMessage(presenter);
  const selectedId = presenter.chosenAvatarId || workspaceDefaultAvatarId || null;

  const loadCatalog = useCallback(async () => {
    if (!platformConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/video-presenter/avatars");
      const payload = (await response.json().catch(() => null)) as CatalogResponse | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error || "Presenter catalog could not be loaded.");
      }
      setAvatars(Array.isArray(payload.avatars) ? payload.avatars : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Presenter catalog could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [platformConfigured]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const visibleAvatars = useMemo(
    () => (expanded ? avatars : avatars.slice(0, INITIAL_VISIBLE_AVATARS)),
    [avatars, expanded],
  );

  if (!platformConfigured) return null;

  const selectAvatar = async (avatarId: string) => {
    if (savingId || avatarId === presenter.chosenAvatarId) return;
    setSavingId(avatarId);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/video-presenter`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatarId }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        presenter?: AgentVideoPresenterConfig;
        error?: string;
        message?: string;
      } | null;
      if (!response.ok || !payload?.presenter) {
        throw new Error(payload?.error || payload?.message || "Presenter could not be saved.");
      }
      onUpdated(payload.presenter);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Presenter could not be saved.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mt-4 rounded-[12px] border border-border bg-card/45 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Live Video presenter
          </p>
          <p className="mt-1 max-w-[58ch] text-xs leading-relaxed text-muted-foreground">
            Choose the on-screen presenter for this business agent. Your Wireline identity badge
            stays available as the fallback everywhere else.
          </p>
        </div>
        {customizationNote ? (
          <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            {customizationNote}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 flex min-h-24 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading presenters…
        </div>
      ) : avatars.length ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {visibleAvatars.map((avatar) => {
              const selected = avatar.id === selectedId;
              const saving = savingId === avatar.id;
              return (
                <button
                  key={avatar.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => void selectAvatar(avatar.id)}
                  disabled={Boolean(savingId)}
                  className={`group relative overflow-hidden rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-action-primary-default)] disabled:cursor-wait disabled:opacity-70 ${
                    selected
                      ? "border-[var(--wireline-color-action-primary-default)] bg-[var(--wireline-color-surface-subtle)]"
                      : "border-border bg-[var(--wireline-color-surface-default)] hover:border-[var(--wireline-color-action-primary-default)]/60"
                  }`}
                >
                  <div className="aspect-[4/3] overflow-hidden bg-[var(--wireline-color-surface-subtle)]">
                    {avatar.previewImageUrl ? (
                      <img
                        src={avatar.previewImageUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-lg font-semibold text-muted-foreground">
                        {(avatar.name || "P").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex min-h-10 items-center justify-between gap-2 px-2.5 py-2">
                    <span className="truncate text-xs font-medium text-foreground">{avatar.name}</span>
                    {saving ? (
                      <Loader2
                        className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : selected ? (
                      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)]">
                        <Check className="size-3" aria-hidden="true" />
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
          {avatars.length > INITIAL_VISIBLE_AVATARS ? (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="mt-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {expanded ? "Show fewer" : `Show all ${avatars.length}`}
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          No presenter faces are available from the configured catalog right now.
        </p>
      )}

      {error ? (
        <div className="mt-3 flex flex-wrap items-center gap-3" role="alert">
          <p className="text-xs text-[var(--wireline-color-status-warning)]">{error}</p>
          {!savingId ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void loadCatalog()}>
              Retry catalog
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
