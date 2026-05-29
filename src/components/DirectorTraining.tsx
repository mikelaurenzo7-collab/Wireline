/**
 * DirectorTraining — the "Training" tab inside the Director workspace.
 *
 * This is the Director's equivalent of an agent's Training inputs. Instead of
 * per-agent knowledge/voice/flow, it captures the operator's BUSINESS BRIEF —
 * the durable context that grounds every strategic reply ("you run a 3-van
 * HVAC shop, your goal is more booked jobs") — plus two behaviour toggles.
 *
 * Saves via PUT /api/director/profile. The business NAME is mirrored onto the
 * account settings row server-side so the rest of the app stays in sync.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  GraduationCap,
  Building2,
  Briefcase,
  Target,
  StickyNote,
  Loader2,
  Check,
  Sparkles,
  Wand2,
  BookOpen,
  Plus,
  Trash2,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import type { DirectorProfileData } from "./DirectorWorkspace";
import { cn } from "../lib/utils";

interface Props {
  profile: DirectorProfileData | null;
  loading: boolean;
  onSaved: (profile: DirectorProfileData) => void;
}

const EMPTY: DirectorProfileData = {
  businessName: "",
  industry: "",
  offerings: "",
  primaryGoal: "",
  notes: "",
  autoSuggestAgents: true,
  deepAnalysisDefault: false,
};

export default function DirectorTraining({ profile, loading, onSaved }: Props) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [draft, setDraft] = useState<DirectorProfileData>(EMPTY);
  const [saving, setSaving] = useState(false);

  // Seed the form when the profile arrives / changes.
  useEffect(() => {
    if (profile) {
      setDraft({
        businessName: profile.businessName ?? "",
        industry: profile.industry ?? "",
        offerings: profile.offerings ?? "",
        primaryGoal: profile.primaryGoal ?? "",
        notes: profile.notes ?? "",
        autoSuggestAgents: profile.autoSuggestAgents,
        deepAnalysisDefault: profile.deepAnalysisDefault,
      });
    }
  }, [profile]);

  const dirty = useMemo(() => {
    const base = profile ?? EMPTY;
    return (
      (base.businessName ?? "") !== (draft.businessName ?? "") ||
      (base.industry ?? "") !== (draft.industry ?? "") ||
      (base.offerings ?? "") !== (draft.offerings ?? "") ||
      (base.primaryGoal ?? "") !== (draft.primaryGoal ?? "") ||
      (base.notes ?? "") !== (draft.notes ?? "") ||
      base.autoSuggestAgents !== draft.autoSuggestAgents ||
      base.deepAnalysisDefault !== draft.deepAnalysisDefault
    );
  }, [profile, draft]);

  const set = <K extends keyof DirectorProfileData>(k: K, v: DirectorProfileData[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const r = await authFetch("/api/director/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!r.ok) throw new Error("Save failed");
      const data = await r.json();
      if (data?.profile) onSaved(data.profile as DirectorProfileData);
      toastSuccess("Brief saved", "Your Director will use this on every reply");
    } catch {
      toastError("Couldn't save", "Try again in a moment");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Hero */}
      <section className="rounded-2xl glass border border-white/10 p-4 relative overflow-hidden">
        <div
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #4F1E7B, transparent)" }}
        />
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl glass border border-brand/30 text-brand flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display italic lowercase text-xl text-ink leading-tight">
              train your Director
            </h3>
            <p className="text-[10px] uppercase tracking-[0.28em] text-muted/70">
              The brief behind every strategic reply
            </p>
          </div>
        </div>
        <p className="relative z-10 mt-3 text-[12px] text-muted leading-relaxed">
          The more your Director knows about your business, the sharper its advice. This brief is
          read on every turn — it&apos;s how the Director gives you specifics instead of generic
          tips.
        </p>
      </section>

      {/* Brief fields */}
      <section className="rounded-2xl glass border border-white/10 p-4 space-y-4">
        <Field icon={Building2} label="Business name">
          <input
            type="text"
            value={draft.businessName ?? ""}
            onChange={(e) => set("businessName", e.target.value)}
            maxLength={200}
            placeholder="e.g. Lauren's Mobile HVAC"
            className="w-full h-10 px-3 rounded-lg border border-black/12 bg-paper text-[13px] text-ink placeholder:text-muted/60 outline-none focus:border-brand/40 transition-colors"
          />
        </Field>

        <Field icon={Briefcase} label="What you do / industry">
          <input
            type="text"
            value={draft.industry ?? ""}
            onChange={(e) => set("industry", e.target.value)}
            maxLength={500}
            placeholder="e.g. Residential HVAC repair & install, 3 vans, Phoenix metro"
            className="w-full h-10 px-3 rounded-lg border border-black/12 bg-paper text-[13px] text-ink placeholder:text-muted/60 outline-none focus:border-brand/40 transition-colors"
          />
        </Field>

        <Field icon={Sparkles} label="Products & services">
          <textarea
            value={draft.offerings ?? ""}
            onChange={(e) => set("offerings", e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="What you sell, key packages, pricing tiers, anything an agent should know to sell or support it."
            className="w-full px-3 py-2.5 rounded-lg border border-black/12 bg-paper text-[13px] text-ink placeholder:text-muted/60 outline-none focus:border-brand/40 transition-colors resize-none leading-relaxed"
          />
        </Field>

        <Field icon={Target} label="Primary goal right now">
          <input
            type="text"
            value={draft.primaryGoal ?? ""}
            onChange={(e) => set("primaryGoal", e.target.value)}
            maxLength={500}
            placeholder="e.g. Book more service calls without hiring a receptionist"
            className="w-full h-10 px-3 rounded-lg border border-black/12 bg-paper text-[13px] text-ink placeholder:text-muted/60 outline-none focus:border-brand/40 transition-colors"
          />
        </Field>

        <Field icon={StickyNote} label="Anything else the Director should remember">
          <textarea
            value={draft.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="Constraints, tone preferences, busy seasons, the things you'd tell a new ops manager on day one."
            className="w-full px-3 py-2.5 rounded-lg border border-black/12 bg-paper text-[13px] text-ink placeholder:text-muted/60 outline-none focus:border-brand/40 transition-colors resize-none leading-relaxed"
          />
        </Field>
      </section>

      {/* Behaviour toggles */}
      <section className="rounded-2xl glass border border-white/10 p-4 space-y-2.5">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl glass border border-brand/30 text-brand flex items-center justify-center shrink-0">
            <Wand2 className="w-4 h-4" />
          </div>
          <h4 className="font-display italic lowercase text-lg text-ink leading-none">
            director behaviour
          </h4>
        </div>
        <Toggle
          checked={draft.autoSuggestAgents}
          onChange={(v) => set("autoSuggestAgents", v)}
          title="Proactive suggestions"
          hint="Let the Director surface quick action chips (hire an agent, open a chat, jump to insights) alongside its replies."
        />
        <Toggle
          checked={draft.deepAnalysisDefault}
          onChange={(v) => set("deepAnalysisDefault", v)}
          title="Always deep-analyze"
          hint="Run every turn on the deeper (slower, pricier) strategist model instead of only when you explicitly ask for an audit."
        />
      </section>

      {/* Company knowledge — flows down to every agent */}
      <CompanyKnowledge />

      {/* Sticky save bar */}
      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-gradient-to-t from-paper via-paper/95 to-transparent">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className={cn(
            "w-full h-11 rounded-xl text-[13px] font-medium flex items-center justify-center gap-2 transition-all",
            dirty && !saving
              ? "bg-brand text-on-brand hover:opacity-90"
              : "bg-black/5 text-muted cursor-not-allowed",
          )}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Saving…
            </>
          ) : dirty ? (
            <>
              <Check className="w-4 h-4" /> Save brief
            </>
          ) : (
            "Brief up to date"
          )}
        </button>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-muted/70 mb-1.5">
        <Icon className="w-3 h-3" />
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={cn(
        "w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all",
        checked ? "border-brand/30 bg-brand/[0.04]" : "border-black/10 hover:border-black/20",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors",
          checked ? "bg-brand" : "bg-black/15",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
          className={cn(
            "block w-4 h-4 rounded-full bg-paper shadow-sm",
            checked ? "ml-auto" : "ml-0",
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-ink leading-snug">{title}</span>
        <span className="block text-[11px] text-muted leading-relaxed mt-0.5">{hint}</span>
      </span>
    </button>
  );
}

interface SharedFact {
  id: string;
  content: string;
  createdAt: string;
}

/**
 * CompanyKnowledge — shared facts the Director holds that flow to EVERY agent.
 *
 * Stored as agent-wide knowledge (agent_id NULL); the voice runtime unions
 * these into each agent's knowledge so a fact added once (hours, pricing,
 * policies, the pitch) reaches every call without per-agent duplication.
 * Persists immediately on add/remove — independent of the brief's Save button.
 */
function CompanyKnowledge() {
  const { error: toastError } = useToast();
  const [facts, setFacts] = useState<SharedFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authFetch("/api/director/knowledge")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setFacts(Array.isArray(d?.knowledge) ? d.knowledge : []);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const add = async () => {
    const content = draft.trim();
    if (!content || adding) return;
    setAdding(true);
    try {
      const r = await authFetch("/api/director/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed");
      setFacts((prev) => [{ id: String(data.id), content, createdAt: data.createdAt }, ...prev]);
      setDraft("");
    } catch (e) {
      toastError("Couldn't add", e instanceof Error ? e.message : undefined);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const r = await authFetch(`/api/director/knowledge/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Failed");
      setFacts((prev) => prev.filter((f) => f.id !== id));
    } catch {
      toastError("Couldn't remove that fact");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl glass border border-white/10 p-4">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-8 h-8 rounded-xl glass border border-emerald-500/30 text-emerald-600 flex items-center justify-center shrink-0">
          <BookOpen className="w-4 h-4" />
        </div>
        <div>
          <h4 className="font-display italic lowercase text-lg text-ink leading-none">
            company knowledge
          </h4>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">
            Flows to every agent on calls
          </p>
        </div>
      </div>
      <p className="text-[11.5px] text-muted leading-relaxed mt-2 mb-3">
        Facts true for your whole business — hours, pricing, policies, the pitch. Add once here and
        every agent uses them; no need to repeat per agent.
      </p>

      {/* Add row */}
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="e.g. We offer a 1-year warranty on all installs and a free annual tune-up."
          className="flex-1 resize-none rounded-lg border border-black/12 bg-paper px-3 py-2 text-[13px] text-ink placeholder:text-muted/60 outline-none focus:border-brand/40 transition-colors leading-relaxed"
        />
        <button
          onClick={add}
          disabled={!draft.trim() || adding}
          className="shrink-0 h-10 px-3 rounded-lg bg-brand text-on-brand text-[12px] font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-40"
          aria-label="Add company knowledge"
        >
          {adding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          Add
        </button>
      </div>

      {/* List */}
      <div className="mt-3">
        {loading ? (
          <div className="flex items-center justify-center py-4 text-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : facts.length === 0 ? (
          <p className="text-[11px] text-muted/70 italic py-2">
            No company-wide facts yet. The first one you add reaches every agent immediately.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {facts.map((f) => (
              <li
                key={f.id}
                className="flex items-start gap-2 rounded-lg border border-black/8 bg-paper/50 px-3 py-2"
              >
                <BookOpen className="w-3.5 h-3.5 text-emerald-600/80 mt-0.5 shrink-0" />
                <span className="flex-1 min-w-0 text-[12.5px] text-ink/90 leading-relaxed break-words">
                  {f.content}
                </span>
                <button
                  onClick={() => remove(f.id)}
                  disabled={busyId === f.id}
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted/70 hover:text-rose-500 hover:bg-rose-500/8 transition-colors disabled:opacity-40"
                  aria-label="Remove this fact"
                >
                  {busyId === f.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
