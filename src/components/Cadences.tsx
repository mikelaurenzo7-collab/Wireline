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
  Repeat,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { logFetchError } from "../lib/utils";
import { useToast } from "../contexts/ToastContext";
import { useApiError } from "../hooks/useApiError";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { EmptyState } from "./ui/EmptyState";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import { OPS_CHANNEL_EMPTY, OPS_CHANNEL_TOOLBAR } from "../lib/wireline-ops-design";
import { cn } from "../lib/utils";

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
function stepBadgeClass(_t: StepType) {
  return "text-brand border-brand/40";
}

export default function Cadences() {
  const { success: toastSuccess } = useToast();
  const { handleApiError, handleCatchError } = useApiError();
  const [cadences, setCadences] = useState<Cadence[]>([]);
  const [runs, setRuns] = useState<CadenceRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftSteps, setDraftSteps] = useState<Step[]>([{ type: "call", delayHours: 0 }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
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
      setLoadErr("Could not load sequences. Check your connection and retry.");
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

  if (loading) {
    return (
      <ClientRouteLoading
        icon={<Repeat className="w-6 h-6" />}
        label={OPS_CHANNEL_TOOLBAR.cadences.loading}
        className="h-full min-h-[200px]"
      />
    );
  }

  if (loadErr) {
    return (
      <div className="h-full min-h-[200px] flex items-center justify-center">
        <EmptyState
          icon={Repeat}
          eyebrow="Sequences unavailable"
          title="Couldn't load cadences"
          description={loadErr}
          actions={[{ label: "Retry", onClick: load, primary: true }]}
          density="compact"
          withHalo={false}
          className="py-10"
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-4 pb-4">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="wl-label text-brand mb-1">Outbound · Sequences</p>
          <h3 className="font-display italic text-xl text-foreground leading-none">
            Multi-touch cadences
          </h3>
          <p className="text-[var(--wireline-typography-overline-size)] text-foreground/55 mt-1.5 max-w-xl leading-relaxed">
            Automate consent-checked call, SMS, and email follow-up.
          </p>
        </div>
        {cadences.length > 0 ? (
          <ShadButton
            type="button"
            variant="editorial"
            disableAnimations
            onClick={() => setShowBuilder(true)}
            className="touch-press rounded-full text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.16em]"
          >
            <Plus className="w-3.5 h-3.5" />
            Create sequence
          </ShadButton>
        ) : null}
      </div>

      {!showBuilder && cadences.length === 0 && (
        <EmptyState
          icon={Repeat}
          title={OPS_CHANNEL_EMPTY.cadences.title}
          titleTone="ui"
          actions={[
            {
              label: "Create sequence",
              onClick: () => setShowBuilder(true),
              primary: true,
            },
          ]}
          density="compact"
          withHalo={false}
          className="py-4"
        >
          <div className="w-full max-w-3xl mt-2 text-left">
            <p className="mb-2 text-center text-xs font-semibold text-brand">
              Or start from a template
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {STARTER_TEMPLATES.map((t) => (
                <ShadButton
                  key={t.name}
                  type="button"
                  variant="outline"
                  disableAnimations
                  onClick={() => loadTemplate(t)}
                  className="h-auto w-full justify-start text-left rounded-md border-border hover:border-brand/30 p-4 group touch-press hover:scale-[1.02]"
                >
                  <p className="text-[var(--wireline-typography-caption-size)] font-semibold text-foreground mb-1">
                    {t.name}
                  </p>
                  <p className="wl-micro-meta mb-3">{t.description}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {t.steps.map((s, i) => (
                      <span
                        key={i}
                        className={cn(
                          "wl-label px-1.5 py-0.5 rounded border inline-flex items-center gap-1",
                          stepBadgeClass(s.type),
                        )}
                      >
                        {stepIcon(s.type)} {s.type}
                      </span>
                    ))}
                  </div>
                </ShadButton>
              ))}
            </div>
          </div>
        </EmptyState>
      )}

      {cadences.length > 0 && (
        <div className="space-y-2">
          {cadences.map((c) => (
            <div
              key={c.id}
              className="rounded-md wl-panel border border-border p-4 flex items-center gap-4 flex-wrap touch-press hover:scale-[1.02]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-[var(--wireline-typography-caption-size)] font-semibold text-foreground">
                    {c.name}
                  </h4>
                  {c.active ? (
                    <span className="wl-label px-1.5 py-0.5 rounded bg-brand/15 text-brand border border-brand/30">
                      Active
                    </span>
                  ) : (
                    <span className="wl-label px-1.5 py-0.5 rounded bg-muted text-muted border border-border">
                      Paused
                    </span>
                  )}
                  {runsByCadence[c.id] > 0 && (
                    <span className="wl-label px-1.5 py-0.5 rounded bg-brand/15 text-brand border border-brand/30">
                      {runsByCadence[c.id]} active run{runsByCadence[c.id] === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                {c.description && (
                  <p className="text-[var(--wireline-typography-overline-size)] text-muted mb-2">
                    {c.description}
                  </p>
                )}
                <div className="flex items-center gap-1 flex-wrap">
                  {c.steps.map((s, i) => (
                    <span
                      key={i}
                      className={cn(
                        "wl-label px-1.5 py-0.5 rounded border inline-flex items-center gap-1",
                        stepBadgeClass(s.type),
                      )}
                    >
                      {stepIcon(s.type)} {s.type}
                      {s.delayHours > 0 && (
                        <span className="text-foreground/55 normal-case">+{s.delayHours}h</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  disableAnimations
                  onClick={() => togglePause(c)}
                  title={c.active ? "Pause" : "Resume"}
                  aria-label={c.active ? "Pause cadence" : "Resume cadence"}
                  className="w-8 h-8 rounded-md text-muted hover:text-foreground"
                >
                  {c.active ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <PlayCircle className="w-3.5 h-3.5" />
                  )}
                </ShadButton>
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  disableAnimations
                  onClick={() => remove(c)}
                  title="Delete"
                  aria-label="Delete cadence"
                  className="w-8 h-8 rounded-md text-muted hover:text-rose-500 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </ShadButton>
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
            className="rounded-md wl-panel-elevated border border-brand/40 p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-display italic text-lg text-foreground">Build a sequence</h4>
              <ShadButton
                type="button"
                variant="ghost"
                size="icon"
                disableAnimations
                onClick={() => setShowBuilder(false)}
                aria-label="Close cadence builder"
                className="w-8 h-8 rounded-md text-muted"
              >
                <X className="w-4 h-4" />
              </ShadButton>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="wl-label-muted/80 mb-1.5 block">Name</label>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g. Standard 3-touch"
                  className="w-full px-3 py-2 rounded-md bg-black/[0.03] border border-input text-foreground text-[var(--wireline-typography-caption-size)] focus:outline-none focus:border-brand/50"
                />
              </div>
              <div>
                <label className="wl-label-muted/80 mb-1.5 block">Description (optional)</label>
                <Input
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  placeholder="One-line summary"
                  className="w-full px-3 py-2 rounded-md bg-black/[0.03] border border-input text-foreground text-[var(--wireline-typography-caption-size)] focus:outline-none focus:border-brand/50"
                />
              </div>
            </div>

            <div className="space-y-2 mb-3">
              {draftSteps.map((s, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md bg-muted/20 border border-border p-3"
                >
                  <span
                    className={cn(
                      "shrink-0 w-7 h-7 rounded-md flex items-center justify-center wl-label font-bold border",
                      stepBadgeClass(s.type),
                    )}
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
                          className="w-full pl-2 py-1.5 rounded-md bg-black/[0.03] border border-input text-foreground text-[var(--wireline-typography-overline-size)] h-auto"
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
                      <Clock className="w-3 h-3 text-foreground/55" />
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={s.delayHours}
                        onChange={(e) => updateStep(i, { delayHours: Number(e.target.value) || 0 })}
                        className="w-20 px-2 py-1.5 rounded-md bg-black/[0.03] border border-input text-foreground text-[var(--wireline-typography-overline-size)]"
                      />
                      <span className="wl-micro-meta">hours delay</span>
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
                        className="px-2 py-1.5 rounded-md bg-black/[0.03] border border-input text-foreground text-[var(--wireline-typography-overline-size)]"
                      />
                    )}
                  </div>
                  <ShadButton
                    type="button"
                    variant="ghost"
                    size="icon"
                    disableAnimations
                    onClick={() => removeStep(i)}
                    title="Remove step"
                    aria-label="Remove step"
                    className="w-8 h-8 text-muted hover:text-rose-500 hover:bg-rose-500/10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </ShadButton>
                </div>
              ))}
              <ShadButton
                type="button"
                variant="ghost"
                size="sm"
                disableAnimations
                onClick={addStep}
                className="h-auto px-0 wl-label text-muted hover:text-brand"
              >
                <Plus className="w-3 h-3" />
                Add step
              </ShadButton>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <ShadButton
                type="button"
                variant="ghost"
                size="sm"
                disableAnimations
                onClick={() => setShowBuilder(false)}
                className="text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.28em] text-muted"
              >
                Cancel
              </ShadButton>
              <ShadButton
                type="button"
                variant="editorial"
                disableAnimations
                onClick={save}
                disabled={saving}
                className="touch-press hover:scale-[1.05] rounded-md text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.28em]"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                Save sequence
              </ShadButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
