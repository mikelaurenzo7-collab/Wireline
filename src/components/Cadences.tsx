import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Trash2,
  Pause,
  PlayCircle,
  Phone,
  MessageSquare,
  Mail,
  Clock,
  X,
  Loader2,
  Zap,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { logFetchError } from "../lib/utils";
import { useToast } from "../contexts/ToastContext";
import { useApiError } from "../hooks/useApiError";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { Input } from "./ui/shadcn/Input";

type StepType = "call" | "sms" | "email";
type Step = { type: StepType; delayHours: number; template?: string };

interface Cadence {
  id: string;
  name: string;
  description: string | null;
  steps: Step[];
  active: boolean;
  createdAt: string;
}

interface CadenceRun {
  id: string;
  cadenceId: string;
  leadId: string | number;
  currentStep: number;
  status: string;
  nextDueAt: string | null;
  lastResult: string | null;
}

const STARTER_TEMPLATES: { name: string; description: string; steps: Step[] }[] = [
  {
    name: "Standard 3-touch",
    description: "Call · wait 24h · SMS · wait 48h · Call",
    steps: [
      { type: "call", delayHours: 0 },
      {
        type: "sms",
        delayHours: 24,
        template: "Hi {{name}}, following up on our call — got a minute later today?",
      },
      { type: "call", delayHours: 48 },
    ],
  },
  {
    name: "Warm intro week",
    description: "Email · call · SMS · call",
    steps: [
      {
        type: "email",
        delayHours: 0,
        template:
          "Hi {{name}},\n\nReaching out from Wireline — would love a quick conversation this week. Reply with a time that works?",
      },
      { type: "call", delayHours: 24 },
      {
        type: "sms",
        delayHours: 48,
        template: "Hey {{name}}, sent you a note — happy to jump on a call whenever's good.",
      },
      { type: "call", delayHours: 96 },
    ],
  },
  {
    name: "Demo-day reminder",
    description: "SMS day-of, then SMS confirm after",
    steps: [
      {
        type: "sms",
        delayHours: 0,
        template:
          "Hi {{name}}, looking forward to our demo today. Anything specific you'd like us to cover?",
      },
      {
        type: "sms",
        delayHours: 4,
        template: "Hi {{name}}, hope the demo was useful. Reply with any follow-up questions.",
      },
    ],
  },
];

function stepIcon(t: StepType) {
  if (t === "call") return <Phone className="w-3 h-3" />;
  if (t === "sms") return <MessageSquare className="w-3 h-3" />;
  return <Mail className="w-3 h-3" />;
}
function stepTint(t: StepType) {
  if (t === "call") return "#7C3AED";
  if (t === "sms") return "#7C3AED";
  return "#7C3AED";
}

export default function Cadences() {
  const { success: toastSuccess } = useToast();
  const { handleApiError, handleCatchError } = useApiError();
  const [cadences, setCadences] = useState<Cadence[]>([]);
  const [runs, setRuns] = useState<CadenceRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftSteps, setDraftSteps] = useState<Step[]>([{ type: "call", delayHours: 0 }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cR, rR] = await Promise.all([
        authFetch("/api/cadences"),
        authFetch("/api/cadences/runs"),
      ]);
      if (cR.ok) {
        const d = await cR.json();
        setCadences(d.cadences || []);
      }
      if (rR.ok) {
        const d = await rR.json();
        setRuns(d.runs || []);
      }
    } catch (e) {
      logFetchError("Failed to load cadences", e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const loadTemplate = (t: (typeof STARTER_TEMPLATES)[number]) => {
    setDraftName(t.name);
    setDraftDescription(t.description);
    setDraftSteps(t.steps.map((s) => ({ ...s })));
    setShowBuilder(true);
  };

  const addStep = () => setDraftSteps((prev) => [...prev, { type: "call", delayHours: 24 }]);
  const removeStep = (i: number) => setDraftSteps((prev) => prev.filter((_, idx) => idx !== i));
  const updateStep = (i: number, patch: Partial<Step>) =>
    setDraftSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const save = async () => {
    if (!draftName.trim()) {
      handleCatchError(new Error("Give your sequence a name first."), "Name required");
      return;
    }
    if (draftSteps.length === 0) {
      handleCatchError(new Error("Sequences need a step to run."), "Add at least one step");
      return;
    }
    setSaving(true);
    try {
      const r = await authFetch("/api/cadences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName,
          description: draftDescription || null,
          steps: draftSteps,
        }),
      });
      if (!r.ok) {
        await handleApiError(r, "Failed to save sequence");
        return;
      }
      toastSuccess("Sequence created", `"${draftName}" is live.`);
      setShowBuilder(false);
      setDraftName("");
      setDraftDescription("");
      setDraftSteps([{ type: "call", delayHours: 0 }]);
      load();
    } catch (e: unknown) {
      handleCatchError(e, "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const togglePause = async (c: Cadence) => {
    try {
      const r = await authFetch(`/api/cadences/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !c.active }),
      });
      if (!r.ok) {
        await handleApiError(r, "Failed to update sequence");
        return;
      }
      load();
    } catch (e: unknown) {
      handleCatchError(e, "Update failed");
    }
  };

  const remove = async (c: Cadence) => {
    if (!confirm(`Delete "${c.name}"? Any active runs will be paused.`)) return;
    try {
      const r = await authFetch(`/api/cadences/${c.id}`, { method: "DELETE" });
      if (!r.ok) {
        await handleApiError(r, "Failed to delete sequence");
        return;
      }
      toastSuccess("Sequence deleted", `"${c.name}" removed.`);
      load();
    } catch (e: unknown) {
      handleCatchError(e, "Delete failed");
    }
  };

  const runsByCadence = runs.reduce<Record<string, number>>((acc, r) => {
    if (r.status === "active") acc[r.cadenceId] = (acc[r.cadenceId] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-4 pb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-1">
            Outbound · Sequences
          </p>
          <h3 className="font-display italic text-xl text-ink leading-none">
            Multi-touch cadences
          </h3>
          <p className="text-[11px] text-muted/70 mt-1.5 max-w-xl leading-relaxed">
            Define a sequence of call → SMS → email steps with delays. Enroll any lead from
            /pipeline or the API. The job-worker ticks each step automatically.
          </p>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.28em] hover:bg-brand/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New sequence
        </button>
      </div>

      {!showBuilder && cadences.length === 0 && !loading && (
        <div className="rounded-2xl glass border border-white/8 p-6">
          <p className="text-[11px] uppercase tracking-[0.32em] text-brand mb-2">
            Start from a template
          </p>
          <p className="text-[12px] text-muted/80 mb-4 max-w-xl leading-relaxed">
            No sequences yet. Pick a proven cadence to start with — you can edit it after.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {STARTER_TEMPLATES.map((t) => (
              <button
                key={t.name}
                onClick={() => loadTemplate(t)}
                className="text-left rounded-xl border border-white/12 hover:border-white/30 p-4 transition-colors group"
              >
                <p className="text-[12px] font-semibold text-ink mb-1">{t.name}</p>
                <p className="text-[10px] text-muted/70 mb-3">{t.description}</p>
                <div className="flex items-center gap-1">
                  {t.steps.map((s, i) => (
                    <span
                      key={i}
                      className="text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border border-white/10 inline-flex items-center gap-1"
                      style={{ color: stepTint(s.type), borderColor: `${stepTint(s.type)}40` }}
                    >
                      {stepIcon(s.type)} {s.type}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {cadences.length > 0 && (
        <div className="space-y-2">
          {cadences.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl glass border border-white/8 p-4 flex items-center gap-4 flex-wrap"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-[13px] font-semibold text-ink">{c.name}</h4>
                  {c.active ? (
                    <span className="text-[9px] uppercase tracking-[0.25em] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                      Active
                    </span>
                  ) : (
                    <span className="text-[9px] uppercase tracking-[0.25em] px-1.5 py-0.5 rounded bg-white/5 text-muted border border-white/15">
                      Paused
                    </span>
                  )}
                  {runsByCadence[c.id] > 0 && (
                    <span className="text-[9px] uppercase tracking-[0.25em] px-1.5 py-0.5 rounded bg-brand/15 text-brand border border-brand/30">
                      {runsByCadence[c.id]} active run{runsByCadence[c.id] === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                {c.description && <p className="text-[11px] text-muted/70 mb-2">{c.description}</p>}
                <div className="flex items-center gap-1 flex-wrap">
                  {c.steps.map((s, i) => (
                    <span
                      key={i}
                      className="text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border inline-flex items-center gap-1"
                      style={{ color: stepTint(s.type), borderColor: `${stepTint(s.type)}40` }}
                    >
                      {stepIcon(s.type)} {s.type}
                      {s.delayHours > 0 && (
                        <span className="text-muted/70 normal-case">+{s.delayHours}h</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => togglePause(c)}
                  className="p-1.5 rounded-lg hover:bg-white/8 text-muted hover:text-ink transition-colors"
                  title={c.active ? "Pause" : "Resume"}
                >
                  {c.active ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <PlayCircle className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => remove(c)}
                  className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted hover:text-rose-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showBuilder && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="rounded-2xl glass-strong border border-brand/40 p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-display italic text-lg text-ink">Build a sequence</h4>
              <button
                onClick={() => setShowBuilder(false)}
                className="p-1 rounded hover:bg-white/8"
              >
                <X className="w-4 h-4 text-muted" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[10px] uppercase tracking-[0.32em] text-muted/80 mb-1.5 block">
                  Name
                </label>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g. Standard 3-touch"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-ink text-[12px] focus:outline-none focus:border-brand/50"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.32em] text-muted/80 mb-1.5 block">
                  Description (optional)
                </label>
                <Input
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  placeholder="One-line summary"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-ink text-[12px] focus:outline-none focus:border-brand/50"
                />
              </div>
            </div>

            <div className="space-y-2 mb-3">
              {draftSteps.map((s, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-xl bg-white/3 border border-white/8 p-3"
                >
                  <span
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold border"
                    style={{ color: stepTint(s.type), borderColor: `${stepTint(s.type)}40` }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="relative">
                      <Select
                        value={s.type}
                        onValueChange={(v) => updateStep(i, { type: v as StepType })}
                      >
                        <SelectTrigger
                          aria-label="Step type"
                          className="w-full pl-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-ink text-[11px] h-auto"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">Call</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-muted/70" />
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={s.delayHours}
                        onChange={(e) => updateStep(i, { delayHours: Number(e.target.value) || 0 })}
                        className="w-20 px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-ink text-[11px]"
                      />
                      <span className="text-[10px] text-muted/70">hours delay</span>
                    </div>
                    {s.type !== "call" && (
                      <Input
                        value={s.template || ""}
                        onChange={(e) => updateStep(i, { template: e.target.value })}
                        placeholder={
                          s.type === "sms"
                            ? "Hi {{name}}, ..."
                            : "Subject + body — vars: {{name}}, {{email}}"
                        }
                        className="px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-ink text-[11px]"
                      />
                    )}
                  </div>
                  <button
                    onClick={() => removeStep(i)}
                    className="p-1 rounded hover:bg-rose-500/10 text-muted hover:text-rose-500 transition-colors"
                    title="Remove step"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={addStep}
                className="text-[10px] uppercase tracking-[0.28em] text-muted hover:text-brand transition-colors inline-flex items-center gap-1.5"
              >
                <Plus className="w-3 h-3" />
                Add step
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/8">
              <button
                onClick={() => setShowBuilder(false)}
                className="px-3 py-2 rounded-lg text-[11px] uppercase tracking-[0.28em] text-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-on-brand text-[11px] uppercase tracking-[0.28em] hover:bg-brand/90 transition-colors disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                Save sequence
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
