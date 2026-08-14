/**
 * Live Video presenter catalog for business agents.
 *
 * Catalog inventory is loaded through Wireline's authenticated server route so
 * provider credentials never reach the browser. A selected public presenter is
 * stored per agent and remains independent from the always-on in-app identity badge.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export type PresenterCatalogSelection = Pick<
  CatalogAvatar,
  "id" | "name" | "previewImageUrl"
>;

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
  onSelectedAvatarChange,
}: {
  agentId: string;
  presenter: AgentVideoPresenterConfig;
  platformConfigured: boolean;
  workspaceDefaultAvatarId?: string | null;
  onUpdated: (next: AgentVideoPresenterConfig) => void;
  onSelectedAvatarChange?: (avatar: PresenterCatalogSelection | null) => void;
}) {
  const [avatars, setAvatars] = useState<CatalogAvatar[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const catalogRequestSerial = useRef(0);
  const customizationNote = presenterCustomizationMessage(presenter);
  const selectedId = presenter.chosenAvatarId || workspaceDefaultAvatarId || null;

  const loadCatalog = useCallback(async () => {
    if (!platformConfigured) return;
    const requestSerial = ++catalogRequestSerial.current;
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/video-presenter/avatars");
      const payload = (await response.json().catch(() => null)) as CatalogResponse | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error || "Presenter catalog could not be loaded.");
      }
      if (requestSerial !== catalogRequestSerial.current) return;
      setAvatars(Array.isArray(payload.avatars) ? payload.avatars : []);
    } catch (reason) {
      if (requestSerial !== catalogRequestSerial.current) return;
      setError(reason instanceof Error ? reason.message : "Presenter catalog could not be loaded.");
    } finally {
      if (requestSerial === catalogRequestSerial.current) setLoading(false);
    }
  }, [platformConfigured]);

  useEffect(() => {
    void loadCatalog();
    return () => {
      catalogRequestSerial.current += 1;
    };
  }, [loadCatalog]);

  useEffect(() => {
    if (!onSelectedAvatarChange) return;
    if (!selectedId) {
      onSelectedAvatarChange(null);
      return;
    }
    const selected = avatars.find((avatar) => avatar.id === selectedId);
    onSelectedAvatarChange(
      selected
        ? {
            id: selected.id,
            name: selected.name,
            previewImageUrl: selected.previewImageUrl ?? null,
          }
        : null,
    );
  }, [avatars, onSelectedAvatarChange, selectedId]);

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
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-label="Presenter catalog">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="wl-stitch-label">Presenter</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Choose the face customers see
          </h2>
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-muted-foreground">
            Pick a catalog presenter for live video. The Wireline identity remains the fallback
            everywhere video is unavailable.
          </p>
        </div>
        {customizationNote ? (
          <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            {customizationNote}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading presenters…
        </div>
      ) : avatars.length ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleAvatars.map((avatar) => {
              const selected = avatar.id === selectedId;
              const saving = savingId === avatar.id;
              return (
                <button
                  key={avatar.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${avatar.name}${selected ? ", selected" : ""}`}
                  onClick={() => void selectAvatar(avatar.id)}
                  disabled={Boolean(savingId)}
                  className={`group relative overflow-hidden rounded-2xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-focus-default)] disabled:cursor-wait disabled:opacity-70 ${
                    selected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-[var(--wireline-color-border-strong)] hover:bg-secondary/40"
                  }`}
                >
                  <div className="relative aspect-[4/5] overflow-hidden bg-secondary">
                    {avatar.previewImageUrl ? (
                      <img
                        src={avatar.previewImageUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.015]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl font-semibold text-muted-foreground">
                        {(avatar.name || "P").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    {selected ? (
                      <span className="absolute right-2.5 top-2.5 inline-flex size-7 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-sm">
                        <Check className="size-4" aria-hidden="true" />
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-h-12 items-center justify-between gap-2 px-3 py-2.5">
                    <span className="truncate text-sm font-semibold text-foreground">{avatar.name}</span>
                    {saving ? (
                      <Loader2
                        className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : selected ? (
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-primary">
                        Selected
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
          {avatars.length > INITIAL_VISIBLE_AVATARS ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-4"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Show fewer" : `Show all ${avatars.length}`}
            </Button>
          ) : null}
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No presenter faces are available from the configured catalog right now.
          </p>
        </div>
      )}

      {error ? (
        <div className="mt-4 flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-[var(--wireline-color-status-warning)]">{error}</p>
          {!savingId ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void loadCatalog()}>
              Retry catalog
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
