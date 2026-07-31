import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { authFetch } from "../lib/api";

type Profile = {
  id: "bright" | "warm" | "clear" | "balanced" | "direct";
  label: string;
  description: string;
};

const FALLBACK_PROFILES: Profile[] = [
  { id: "bright", label: "Bright", description: "Upbeat, energetic, and personable." },
  { id: "warm", label: "Warm", description: "Friendly, patient, and conversational." },
  { id: "clear", label: "Clear", description: "Confident, crisp, and business-ready." },
  { id: "balanced", label: "Balanced", description: "Neutral, composed, and versatile." },
  { id: "direct", label: "Direct", description: "Decisive, focused, and authoritative." },
];

export default function WirelineLiveVoiceProfile({ agentId }: { agentId: string }) {
  const [profiles, setProfiles] = useState<Profile[]>(FALLBACK_PROFILES);
  const [selected, setSelected] = useState<Profile["id"]>("balanced");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    authFetch(`/api/voice/live/profile?agentId=${encodeURIComponent(agentId)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          profile?: Profile["id"];
          profiles?: Profile[];
        } | null;
        if (!response.ok || !body || !active) return;
        if (body.profile) setSelected(body.profile);
        if (Array.isArray(body.profiles) && body.profiles.length) setProfiles(body.profiles);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [agentId]);

  const choose = async (profile: Profile["id"]) => {
    if (saving || profile === selected) return;
    const previous = selected;
    setSelected(profile);
    setSaving(true);
    try {
      const response = await authFetch("/api/voice/live/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, profile }),
      });
      if (!response.ok) setSelected(previous);
    } catch {
      setSelected(previous);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-primary">
          <Sparkles size={17} />
        </span>
        <div>
          <p className="wl-stitch-label">Wireline voice</p>
          <h3 className="mt-1 font-display text-[length:var(--wireline-typography-h3-size)] font-semibold tracking-[-.02em] text-foreground">
            Pick the live voice character
          </h3>
          <p className="mt-1 max-w-2xl text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
            Role-tuned profiles create distinctive, context-aware voices for live browser and mobile
            conversations. Phone routing keeps its current production voice until Direct SIP is
            deliberately provisioned.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {profiles.map((profile) => {
          const active = profile.id === selected;
          return (
            <button
              key={profile.id}
              type="button"
              aria-pressed={active}
              disabled={loading || saving}
              onClick={() => void choose(profile.id)}
              className={`relative rounded-lg border p-3 text-left transition disabled:cursor-wait disabled:opacity-65 ${active ? "border-primary bg-secondary shadow-sm" : "border-border bg-card hover:border-primary/45 hover:bg-secondary"}`}
            >
              {active ? <Check size={14} className="absolute right-3 top-3 text-primary" /> : null}
              <strong className="block pr-5 text-[length:var(--wireline-typography-caption-size)] font-semibold text-foreground">
                {profile.label}
              </strong>
              <span className="mt-1 block text-[length:var(--wireline-typography-overline-size)] leading-4 text-muted-foreground">
                {profile.description}
              </span>
            </button>
          );
        })}
      </div>
      {saving ? (
        <p className="mt-3 inline-flex items-center gap-2 font-mono text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[.06em] text-muted-foreground">
          <Loader2 size={13} className="animate-spin" /> Saving live voice
        </p>
      ) : null}
    </section>
  );
}
