import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Play, Square } from "lucide-react";
import { authFetch } from "../../lib/api";
import type { CatalogPhoneVoice } from "../../lib/phone-voice-catalog";
import { StatusNotice } from "../molecules";

export default function PhoneVoiceCatalog({
  agentId,
  selected,
  onSelected,
}: {
  agentId: string;
  selected: CatalogPhoneVoice | null;
  onSelected: (voice: CatalogPhoneVoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<CatalogPhoneVoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [visible, setVisible] = useState(12);
  const [saving, setSaving] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const alive = useRef(true);
  const request = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const identity = (voice: CatalogPhoneVoice) => `${voice.provider}:${voice.id}`;
  function stop() {
    request.current += 1;
    audio.current?.pause();
    audio.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    setPlaying(null);
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current += 1;
      audio.current?.pause();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    };
  }, []);
  async function load() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/phone-voices`,
      );
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.voices)) throw new Error("Voices could not load.");
      if (!alive.current) return;
      setVoices(result.voices);
      setUnavailable(result.unavailable?.length > 0);
    } catch {
      if (alive.current) setError("Voices could not load. Try again.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }
  async function choose(voice: CatalogPhoneVoice) {
    if (saving) return;
    setSaving(identity(voice));
    setError("");
    stop();
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/phone-voice`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: voice.id, provider: voice.provider }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.catalogVoice)
        throw new Error(result.error || "Voice could not be saved.");
      if (alive.current) onSelected(result.catalogVoice);
    } catch (reason) {
      if (alive.current)
        setError(reason instanceof Error ? reason.message : "Voice could not be saved.");
    } finally {
      if (alive.current) setSaving(null);
    }
  }
  async function preview(voice: CatalogPhoneVoice) {
    const id = identity(voice);
    const wasPlaying = playing === id;
    stop();
    if (wasPlaying) return;
    const current = ++request.current;
    setPlaying(id);
    setError("");
    try {
      const response = await authFetch(
        `/api/agent-config/${encodeURIComponent(agentId)}/voice/sample?provider=${voice.provider}&voice=${encodeURIComponent(voice.id)}`,
      );
      if (!response.ok) throw new Error("Sample unavailable. Try another voice.");
      const blob = await response.blob();
      if (!alive.current || current !== request.current) return;
      const url = URL.createObjectURL(blob);
      audioUrl.current = url;
      const player = new Audio(url);
      audio.current = player;
      player.onended = () => {
        if (current === request.current) stop();
      };
      await player.play();
    } catch (reason) {
      if (!alive.current || current !== request.current) return;
      stop();
      setError(reason instanceof Error ? reason.message : "Sample unavailable.");
    }
  }
  const filtered = (voices ?? []).filter(
    (voice) =>
      (provider === "all" || voice.provider === provider) &&
      `${voice.name} ${voice.language} ${voice.gender ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <details
      className="rounded-xl border border-border bg-background"
      open={open}
      onToggle={(event) => {
        const expanded = event.currentTarget.open;
        setOpen(expanded);
        if (expanded && voices === null && !loading && !error) void load();
        if (!expanded) stop();
      }}
    >
      <summary className="min-h-12 cursor-pointer rounded-xl px-3 py-3 text-sm font-semibold wl-focus-ring-halo">
        {selected ? `Phone Voice · ${selected.name}` : "More Phone Voices"}
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            aria-label="Search Phone Voices"
            placeholder="Search Voices"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisible(12);
            }}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm wl-focus-ring-halo"
          />
          <select
            aria-label="Voice Provider"
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value);
              setVisible(12);
            }}
            className="min-h-11 rounded-lg border border-border bg-background px-2 text-sm wl-focus-ring-halo"
          >
            <option value="all">All Voices</option>
            <option value="cartesia">Cartesia</option>
            <option value="elevenlabs">ElevenLabs</option>
          </select>
        </div>
        {error ? <StatusNotice tone="warning">{error}</StatusNotice> : null}
        {loading ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading Voices…
          </p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {filtered.slice(0, visible).map((voice) => {
              const id = identity(voice);
              const active = selected && identity(selected) === id;
              return (
                <div
                  key={id}
                  className={`flex min-w-0 items-center gap-2 rounded-lg border p-2 ${active ? "border-primary/40 bg-primary/5" : "border-border"}`}
                >
                  <button
                    type="button"
                    disabled={Boolean(saving)}
                    aria-pressed={Boolean(active)}
                    onClick={() => void choose(voice)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left wl-focus-ring-halo disabled:opacity-60"
                  >
                    {saving === id ? (
                      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                    ) : active ? (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    ) : null}
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold">{voice.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {voice.provider === "cartesia" ? "Cartesia" : "ElevenLabs"} ·{" "}
                        {voice.language.toUpperCase()}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`${playing === id ? "Stop" : "Play"} ${voice.name} Phone Sample`}
                    onClick={() => void preview(voice)}
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted wl-focus-ring-halo"
                  >
                    {playing === id ? (
                      <Square className="size-4" aria-hidden="true" />
                    ) : (
                      <Play className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              );
            })}
            {voices && !filtered.length ? (
              <p className="text-sm text-muted-foreground">No Matching Voices.</p>
            ) : null}
          </div>
        )}
        {filtered.length > visible ? (
          <button
            type="button"
            onClick={() => setVisible((count) => count + 12)}
            className="min-h-11 rounded-lg px-3 text-sm font-semibold wl-focus-ring-halo"
          >
            Show More
          </button>
        ) : null}
        {error || unavailable ? (
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="min-h-11 rounded-lg px-3 text-sm font-semibold wl-focus-ring-halo"
          >
            Refresh Voices
          </button>
        ) : null}
        {!selected ? (
          <p className="text-xs text-muted-foreground">
            For Live Calls. Rehearsal Uses Your Built-In Voice.
          </p>
        ) : null}
      </div>
    </details>
  );
}
