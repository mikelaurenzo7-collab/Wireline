import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import AgentFace from "../AgentFace";
import { authFetch } from "../../lib/api";
import { buildAgentIdentityPreview } from "../../lib/agent-identity";
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";

type CatalogAvatar = {
  id: string;
  name: string;
  previewImageUrl?: string | null;
  defaultVoiceId?: string | null;
};

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
  const [avatars, setAvatars] = useState<CatalogAvatar[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matchedVoice, setMatchedVoice] = useState<MatchedPresenterVoice | null>(null);
  const [resolvingVoice, setResolvingVoice] = useState(false);

  const identity = buildAgentIdentityPreview({
    name: agentName,
    role,
    isBusinessAgent,
  });

  useEffect(() => {
    if (!isBusinessAgent) return;
    let cancelled = false;
    setLoading(true);
    void authFetch("/api/video-presenter/avatars")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) return { avatars: [] as CatalogAvatar[], ready: false };
        return {
          avatars: Array.isArray(payload.avatars) ? payload.avatars : [],
          ready: true,
        };
      })
      .then((result) => {
        if (cancelled) return;
        setAvatars(result.avatars);
        setCatalogReady(result.ready);
      })
      .catch(() => {
        if (!cancelled) {
          setAvatars([]);
          setCatalogReady(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isBusinessAgent]);

  useEffect(() => {
    if (value.mode !== "catalog") {
      setMatchedVoice(null);
      onMatchedVoiceChange?.(null);
      return;
    }

    const avatar = avatars.find((row) => row.id === value.avatarId);
    const hintedVoiceId = avatar?.defaultVoiceId?.trim();
    if (hintedVoiceId) {
      const next = {
        voiceId: hintedVoiceId,
        name: `${avatar?.name ?? "Presenter"} voice`,
      };
      setMatchedVoice(next);
      onMatchedVoiceChange?.(next);
      setResolvingVoice(false);
      return;
    }

    let cancelled = false;
    setResolvingVoice(true);
    void authFetch(
      `/api/video-presenter/avatars/${encodeURIComponent(value.avatarId)}/matched-voice`,
    )
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        if (payload?.matched && payload.voice?.voiceId) {
          const next = {
            voiceId: String(payload.voice.voiceId),
            name: String(payload.voice.name || "Matched presenter voice"),
          };
          setMatchedVoice(next);
          onMatchedVoiceChange?.(next);
          return;
        }
        setMatchedVoice(null);
        onMatchedVoiceChange?.(null);
      })
      .catch(() => {
        if (!cancelled) {
          setMatchedVoice(null);
          onMatchedVoiceChange?.(null);
        }
      })
      .finally(() => {
        if (!cancelled) setResolvingVoice(false);
      });

    return () => {
      cancelled = true;
    };
  }, [avatars, onMatchedVoiceChange, value]);

  function selectCatalogFace(avatarId: string) {
    onChange({ mode: "catalog", avatarId });
  }

  function selectWirelineFace() {
    onChange({ mode: "wireline" });
    setMatchedVoice(null);
    onMatchedVoiceChange?.(null);
  }

  return (
    <div className="grid gap-3">
      <p className={WL_APP_CLASSES.wiredEyebrow}>Agent face</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Every agent ships with a deterministic Wireline face. Business agents can also pick a
        catalog presenter — included before live video.
      </p>

      <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-card/60 p-3">
        <AgentFace seed={identity.seed} size={52} title={`${agentName} Wireline face`} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{identity.persona.label}</p>
          <p className="text-xs text-muted-foreground">{identity.video.headline}</p>
        </div>
        <button
          type="button"
          onClick={selectWirelineFace}
          className={`ml-auto shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            value.mode === "wireline"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/30"
          }`}
        >
          {value.mode === "wireline" ? "Selected" : "Use Wireline"}
        </button>
      </div>

      {isBusinessAgent ? (
        <>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-busy="true">
              <Loader2 className="size-3.5 animate-spin" />
              Loading presenter catalog…
            </div>
          ) : null}

          {catalogReady && avatars.length ? (
            <>
              {value.mode === "catalog" && (resolvingVoice || matchedVoice) ? (
                <p className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  {resolvingVoice
                    ? "Resolving matched presenter voice…"
                    : matchedVoice
                      ? `Matched voice: ${matchedVoice.name}. Apply it in the voice picker above for lip-sync.`
                      : null}
                </p>
              ) : null}
              <div className="grid max-h-[min(52vh,28rem)] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                {avatars.map((avatar) => {
                  const selected = value.mode === "catalog" && value.avatarId === avatar.id;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => selectCatalogFace(avatar.id)}
                      className={`relative overflow-hidden rounded-xl border text-left transition-colors ${
                        selected
                          ? "border-primary ring-2 ring-primary/25"
                          : "border-border hover:border-primary/35"
                      }`}
                      aria-pressed={selected}
                    >
                      {avatar.previewImageUrl ? (
                        <img
                          src={avatar.previewImageUrl}
                          alt=""
                          className="aspect-[3/4] w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid aspect-[3/4] place-items-center bg-muted text-[10px] text-muted-foreground">
                          {avatar.name}
                        </div>
                      )}
                      {avatar.defaultVoiceId ? (
                        <span className="absolute left-1.5 top-1.5 rounded-md border border-primary/25 bg-background/85 px-1.5 py-0.5 text-[9px] font-semibold text-primary shadow-sm">
                          Voice match
                        </span>
                      ) : null}
                      <span className="block truncate px-2 py-1.5 text-[10px] font-medium text-foreground">
                        {avatar.name}
                      </span>
                      {selected ? (
                        <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check size={11} aria-hidden="true" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : !loading ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
              Catalog presenters load when live video keys are configured. Your Wireline face is
              active until then.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
