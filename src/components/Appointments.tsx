/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Wrench,
  Loader2,
  CheckCircle2,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Phone,
  StickyNote,
  Bot,
  LayoutList,
  LayoutGrid,
  AlertOctagon,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { authFetch } from "../lib/api";
import { cn, logFetchError } from "../lib/utils";
import PageShell, { Panel } from "./PageShell";
import HubTabs, { CHANNELS_HUB } from "./HubTabs";
import { useToast } from "../contexts/ToastContext";
import ConfirmModal from "./ConfirmModal";

type Appointment = {
  id: string;
  customer_name: string;
  service_type: string;
  date: string;
  time: string;
  status: string;
  phone_number?: string | null;
  notes?: string | null;
  agent_id?: string | null;
  created_at: string;
};

const STATUS_META: Record<
  string,
  { label: string; textColor: string; bgColor: string; borderColor: string; dotColor: string }
> = {
  Scheduled: {
    label: "Scheduled",
    textColor: "var(--color-brand)",
    bgColor: "rgba(139,63,214,0.10)",
    borderColor: "rgba(139,63,214,0.30)",
    dotColor: "var(--color-brand)",
  },
  Confirmed: {
    label: "Confirmed",
    textColor: "#059669",
    bgColor: "rgba(16,185,129,0.10)",
    borderColor: "rgba(16,185,129,0.30)",
    dotColor: "#10b981",
  },
  Completed: {
    label: "Completed",
    textColor: "#7c3aed",
    bgColor: "rgba(139,92,246,0.10)",
    borderColor: "rgba(139,92,246,0.30)",
    dotColor: "#8b5cf6",
  },
  Cancelled: {
    label: "Cancelled",
    textColor: "#E8466A",
    bgColor: "rgba(232,70,106,0.10)",
    borderColor: "rgba(232,70,106,0.30)",
    dotColor: "#E8466A",
  },
  Rescheduled: {
    label: "Rescheduled",
    textColor: "#d97706",
    bgColor: "rgba(245,158,11,0.10)",
    borderColor: "rgba(245,158,11,0.30)",
    dotColor: "#f59e0b",
  },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META["Scheduled"];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] uppercase tracking-[0.3em]"
      style={{ color: m.textColor, background: m.bgColor, borderColor: m.borderColor }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dotColor }} />
      {m.label}
    </span>
  );
}

/* ─── Create/Edit Modal ──────────────────────────────────────────── */
interface ApptModalProps {
  agents: any[];
  initial?: Appointment | null;
  onClose: () => void;
  onSaved: (appt: Appointment) => void;
}

function ApptModal({ agents, initial, onClose, onSaved }: ApptModalProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    customer_name: initial?.customer_name ?? "",
    phone_number: initial?.phone_number ?? "",
    service_type: initial?.service_type ?? "",
    date: initial?.date ?? "",
    time: initial?.time ?? "",
    agent_id: initial?.agent_id ?? "",
    notes: initial?.notes ?? "",
    status: initial?.status ?? "Scheduled",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.customer_name.trim() || !form.date.trim() || !form.time.trim()) {
      setErr("Customer name, date, and time are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const method = isEdit ? "PATCH" : "POST";
      const url = isEdit ? `/api/appointments/${initial!.id}` : "/api/appointments";
      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: form.customer_name.trim(),
          phone_number: form.phone_number.trim() || null,
          service_type: form.service_type.trim() || "General",
          date: form.date.trim(),
          time: form.time.trim(),
          agent_id: form.agent_id || null,
          notes: form.notes.trim() || null,
          status: form.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data.appointment);
    } catch (e: any) {
      setErr(e.message);
    }
    setSaving(false);
  };

  const inputCls =
    "w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/70 transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 16 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-lg rounded-2xl glass-strong border border-black/15 shadow-2xl overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.4em] text-brand mb-0.5">Appointments</p>
            <h2 className="font-display italic text-2xl text-ink">
              {isEdit ? "Edit Appointment" : "New Appointment"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg glass border border-black/10 flex items-center justify-center text-muted hover:text-ink transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh] scrollbar-hide">
          <div className="grid grid-cols-1 gap-4">
            <Field label="Customer Name" icon={User}>
              <input
                className={inputCls}
                placeholder="Jordan Pike"
                value={form.customer_name}
                onChange={(e) => set("customer_name", e.target.value)}
              />
            </Field>
            <Field label="Phone Number" icon={Phone}>
              <input
                className={inputCls}
                placeholder="+1 555 000 0000"
                value={form.phone_number}
                onChange={(e) => set("phone_number", e.target.value)}
                type="tel"
              />
            </Field>
            <Field label="Service Type" icon={Wrench}>
              <input
                className={inputCls}
                placeholder="HVAC Repair, Plumbing Inspection…"
                value={form.service_type}
                onChange={(e) => set("service_type", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" icon={CalendarIcon}>
                <input
                  className={inputCls}
                  placeholder="Oct 15"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </Field>
              <Field label="Time" icon={Clock}>
                <input
                  className={inputCls}
                  placeholder="2:00 PM"
                  value={form.time}
                  onChange={(e) => set("time", e.target.value)}
                />
              </Field>
            </div>
            {agents.length > 0 && (
              <Field label="Agent" icon={Bot}>
                <div className="relative">
                  <select
                    aria-label="Appointment agent"
                    className={cn(inputCls, "appearance-none cursor-pointer pr-8")}
                    value={form.agent_id}
                    onChange={(e) => set("agent_id", e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
                </div>
              </Field>
            )}
            {isEdit && (
              <Field label="Status" icon={CheckCircle2}>
                <div className="relative">
                  <select
                    aria-label="Appointment status"
                    className={cn(inputCls, "appearance-none cursor-pointer pr-8")}
                    value={form.status}
                    onChange={(e) => set("status", e.target.value)}
                  >
                    {Object.keys(STATUS_META).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
                </div>
              </Field>
            )}
            <Field label="Notes" icon={StickyNote}>
              <textarea
                className={cn(inputCls, "resize-none min-h-[72px]")}
                placeholder="Any notes or follow-up details…"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>

          {err && (
            <div
              role="alert"
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30"
            >
              <AlertOctagon className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <p className="text-[11px] text-rose-600 leading-snug">{err}</p>
            </div>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-full glass border border-black/10 text-[10px] uppercase tracking-[0.28em] text-muted hover:text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="h-9 px-5 rounded-full bg-brand/15 border border-brand/50 text-brand text-[10px] uppercase tracking-[0.28em] hover:bg-brand/25 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            {isEdit ? "Save Changes" : "Book"}
          </button>
        </footer>
      </motion.div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: any;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
        {Icon && <Icon className="w-2.5 h-2.5 text-brand" />}
        {label}
      </label>
      {children}
    </div>
  );
}

/* ─── Calendar Grid ──────────────────────────────────────────────── */
function CalendarGrid({
  appointments,
  onSelect,
}: {
  appointments: Appointment[];
  onSelect: (a: Appointment) => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const firstDay = new Date(month.year, month.month, 1).getDay();
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const today = new Date();
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  // Build a quick lookup: day → appointments
  const byDay: Record<number, Appointment[]> = {};
  appointments.forEach((a) => {
    // Try to parse date strings like "Oct 15", "2024-10-15", etc.
    const parsed = new Date(a.date + ", " + month.year);
    if (
      !isNaN(parsed.getTime()) &&
      parsed.getMonth() === month.month &&
      parsed.getFullYear() === month.year
    ) {
      const d = parsed.getDate();
      byDay[d] = byDay[d] ? [...byDay[d], a] : [a];
    }
  });

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push({ day: null });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-black/8">
        <button
          onClick={() =>
            setMonth((m) => {
              const d = new Date(m.year, m.month - 1, 1);
              return { year: d.getFullYear(), month: d.getMonth() };
            })
          }
          aria-label="Previous month"
          className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg glass border border-black/10 flex items-center justify-center text-muted hover:text-ink transition-colors"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <span className="font-display italic lowercase text-xl text-ink">
          {monthNames[month.month]} {month.year}
        </span>
        <button
          onClick={() =>
            setMonth((m) => {
              const d = new Date(m.year, m.month + 1, 1);
              return { year: d.getFullYear(), month: d.getMonth() };
            })
          }
          aria-label="Next month"
          className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg glass border border-black/10 flex items-center justify-center text-muted hover:text-ink transition-colors"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="shrink-0 grid grid-cols-7 border-b border-black/8">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[9px] uppercase tracking-[0.3em] text-muted/70"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="grid grid-cols-7">
          {cells.map((cell, idx) => {
            const isToday =
              cell.day !== null &&
              today.getDate() === cell.day &&
              today.getMonth() === month.month &&
              today.getFullYear() === month.year;
            const dayAppts = cell.day ? byDay[cell.day] || [] : [];

            return (
              <div
                key={idx}
                className={cn(
                  "min-h-[50px] sm:min-h-[60px] md:min-h-[80px] border-b border-r border-white/5 p-1.5",
                  cell.day ? "hover:bg-white/3 cursor-pointer" : "opacity-0 pointer-events-none",
                )}
              >
                {cell.day && (
                  <>
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center mb-1 text-[11px] ml-auto",
                        isToday ? "bg-brand text-on-brand font-bold" : "text-muted/70",
                      )}
                    >
                      {cell.day}
                    </div>
                    <div className="space-y-0.5">
                      {dayAppts.slice(0, 3).map((a) => {
                        const m = STATUS_META[a.status] ?? STATUS_META["Scheduled"];
                        return (
                          <button
                            key={a.id}
                            onClick={() => onSelect(a)}
                            className={cn(
                              "w-full text-left px-1.5 py-0.5 rounded text-[9px] truncate transition-colors hover:opacity-80",
                              m.bg,
                              m.color,
                            )}
                          >
                            {a.time} {a.customer_name}
                          </button>
                        );
                      })}
                      {dayAppts.length > 3 && (
                        <div className="text-[8px] text-muted/70 pl-1">
                          +{dayAppts.length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */
type ConfirmState = { open: boolean; onConfirm: () => void };
const CLOSED_CONFIRM: ConfirmState = { open: false, onConfirm: () => {} };

export default function AppointmentsView({ embedded = false }: { embedded?: boolean }) {
  const { error: toastError } = useToast();
  const [confirmState, setConfirmState] = useState<ConfirmState & { id?: string }>(CLOSED_CONFIRM);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Appointment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [apptRes, agentRes] = await Promise.all([
        authFetch("/api/appointments").then((r) => r.json()),
        authFetch("/api/agents").then((r) => r.json()),
      ]);
      setAppointments(apptRes.appointments || []);
      setAgents(agentRes.agents || []);
    } catch (e) {
      logFetchError("Failed to fetch appointments:", e);
      toastError("Appointments unavailable", "Could not load appointments. Please refresh.");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time fetch on mount
  }, []);

  const handleSaved = (appt: Appointment) => {
    setAppointments((prev) => {
      const idx = prev.findIndex((a) => a.id === appt.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = appt;
        return next;
      }
      return [appt, ...prev];
    });
    setShowModal(false);
    setEditTarget(null);
  };

  const handleDelete = (id: string) => {
    setConfirmState({
      open: true,
      id,
      onConfirm: async () => {
        setConfirmState(CLOSED_CONFIRM);
        setDeletingId(id);
        try {
          await authFetch(`/api/appointments/${id}`, { method: "DELETE" });
          setAppointments((prev) => prev.filter((a) => a.id !== id));
        } catch (e) {
          console.error("Delete failed:", e);
          toastError("Delete failed", "Could not remove this appointment. Please try again.");
        }
        setDeletingId(null);
      },
    });
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await authFetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.appointment) {
        setAppointments((prev) => prev.map((a) => (a.id === id ? data.appointment : a)));
      }
    } catch (e) {
      console.error("Status update failed:", e);
      toastError("Status update failed", "Could not update appointment status.");
    }
  };

  const scheduled = appointments.filter((a) => !["Completed", "Cancelled"].includes(a.status));
  const completed = appointments.filter((a) => ["Completed", "Cancelled"].includes(a.status));

  const actions = (
    <div className="flex items-center gap-2">
      <div className="flex p-1 rounded-full glass border border-black/10">
        <button
          aria-label="List view"
          onClick={() => setViewMode("list")}
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
            viewMode === "list" ? "bg-brand/20 text-brand" : "text-muted hover:text-ink",
          )}
        >
          <LayoutList className="w-3.5 h-3.5" />
        </button>
        <button
          aria-label="Calendar view"
          onClick={() => setViewMode("calendar")}
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
            viewMode === "calendar" ? "bg-brand/20 text-brand" : "text-muted hover:text-ink",
          )}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        onClick={() => {
          setEditTarget(null);
          setShowModal(true);
        }}
        className="h-9 px-4 rounded-full bg-brand/15 border border-brand/50 text-brand text-[10px] uppercase tracking-[0.28em] hover:bg-brand/25 transition-all flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" /> Book
      </button>
    </div>
  );

  return (
    <>
      <div className="h-full flex flex-col min-h-0">
        {!embedded && <HubTabs tabs={CHANNELS_HUB} label="Channels sub-navigation" />}
        <div className="flex-1 min-h-0">
          <PageShell
            title={embedded ? "" : "Appointments"}
            eyebrow={embedded ? undefined : "Operations · Schedule"}
            subtitle={embedded ? undefined : "Appointments scheduled and managed by your agents."}
            actions={actions}
          >
            {isLoading ? (
              <div className="h-full flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
                <span className="app-section-title/70">Loading…</span>
              </div>
            ) : viewMode === "calendar" ? (
              <Panel title="Calendar" hint="Monthly view" icon={CalendarIcon} flush>
                <CalendarGrid
                  appointments={appointments}
                  onSelect={(a) => {
                    setEditTarget(a);
                    setShowModal(true);
                  }}
                />
              </Panel>
            ) : (
              <div className="h-full grid grid-cols-1 xl:grid-cols-2 gap-3 overflow-hidden">
                {/* Active */}
                <Panel
                  title="Upcoming"
                  hint={`${scheduled.length} scheduled`}
                  icon={CalendarIcon}
                  scroll
                  flush
                >
                  <AnimatePresence mode="popLayout">
                    {scheduled.length === 0 ? (
                      <motion.div
                        key="empty-active"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="h-full min-h-[200px] flex flex-col items-center justify-center px-6 py-12 text-center gap-4"
                      >
                        <div className="w-14 h-14 rounded-2xl glass border border-black/10 flex items-center justify-center text-muted">
                          <CalendarIcon className="w-6 h-6" />
                        </div>
                        <div className="space-y-1.5">
                          <h3 className="font-display italic lowercase text-2xl text-ink">
                            no active commitments
                          </h3>
                          <p className="app-section-title/70 max-w-xs">
                            Book a commitment manually or let agents schedule during calls.
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setEditTarget(null);
                            setShowModal(true);
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-brand text-on-brand text-[10px] uppercase tracking-[0.28em] hover:bg-brand/90 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Book appointment
                        </button>
                      </motion.div>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {scheduled.map((appt) => (
                          <AppointmentRow
                            key={appt.id}
                            appt={appt}
                            agents={agents}
                            deleting={deletingId === appt.id}
                            onEdit={() => {
                              setEditTarget(appt);
                              setShowModal(true);
                            }}
                            onDelete={() => handleDelete(appt.id)}
                            onStatusChange={(s) => handleStatusChange(appt.id, s)}
                          />
                        ))}
                      </div>
                    )}
                  </AnimatePresence>
                </Panel>

                {/* Completed/Cancelled */}
                <Panel
                  title="History"
                  hint={`${completed.length} records`}
                  icon={CheckCircle2}
                  scroll
                  flush
                >
                  <AnimatePresence mode="popLayout">
                    {completed.length === 0 ? (
                      <motion.div
                        key="empty-hist"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="h-full min-h-[200px] flex items-center justify-center"
                      >
                        <p className="text-[9px] uppercase tracking-[0.5em] text-muted/70">
                          No completed appointments yet
                        </p>
                      </motion.div>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {completed.map((appt) => (
                          <AppointmentRow
                            key={appt.id}
                            appt={appt}
                            agents={agents}
                            deleting={deletingId === appt.id}
                            onEdit={() => {
                              setEditTarget(appt);
                              setShowModal(true);
                            }}
                            onDelete={() => handleDelete(appt.id)}
                            onStatusChange={(s) => handleStatusChange(appt.id, s)}
                          />
                        ))}
                      </div>
                    )}
                  </AnimatePresence>
                </Panel>
              </div>
            )}
          </PageShell>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <ApptModal
            agents={agents}
            initial={editTarget}
            onClose={() => {
              setShowModal(false);
              setEditTarget(null);
            }}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        open={confirmState.open}
        title="Cancel appointment"
        message="Cancel and remove this appointment? This cannot be undone."
        danger
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(CLOSED_CONFIRM)}
      />
    </>
  );
}

function AppointmentRow({
  appt,
  agents,
  deleting,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  appt: Appointment;
  agents: any[];
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: string) => void;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const agentName = agents.find((a) => a.id === appt.agent_id)?.name;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.18 }}
      className="px-4 py-3.5 hover:bg-white/3 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl glass border border-black/10 flex items-center justify-center text-brand shrink-0 mt-0.5">
          <User className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display italic text-lg text-ink leading-none">
              {appt.customer_name}
            </span>
            <StatusBadge status={appt.status} />
          </div>

          <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted/70">
            <span className="inline-flex items-center gap-1">
              <Wrench className="w-3 h-3 text-brand" />
              {appt.service_type}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="w-3 h-3 text-brand" />
              {appt.date}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3 text-brand" />
              {appt.time}
            </span>
            {appt.phone_number && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3 h-3 text-brand" />
                {appt.phone_number}
              </span>
            )}
            {agentName && (
              <span className="inline-flex items-center gap-1">
                <Bot className="w-3 h-3 text-brand" />
                {agentName}
              </span>
            )}
          </div>

          {appt.notes && (
            <div className="flex items-start gap-1.5 mt-1">
              <StickyNote className="w-3 h-3 text-muted/70 shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted/70 leading-snug line-clamp-2">{appt.notes}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu((v) => !v)}
              title="Change status"
              className="w-7 h-7 rounded-lg glass border border-black/10 flex items-center justify-center text-muted hover:text-brand hover:border-brand/30 transition-all text-[9px]"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
            <AnimatePresence>
              {showStatusMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  // Open UPWARD (`bottom-full mb-1`) instead of downward
                  // (`top-full mt-1`). The Appointments scroll container
                  // has `overflow-y-auto` which clips ANY child whose
                  // top-half overflow extends past it — so a downward
                  // menu on the bottom row gets cut off mid-list. Open
                  // up and the menu always renders inside the scroll
                  // viewport regardless of row position.
                  className="absolute right-0 bottom-full mb-1 z-20 w-36 rounded-xl glass-strong border border-black/15 shadow-2xl overflow-hidden"
                >
                  {Object.keys(STATUS_META).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        onStatusChange(s);
                        setShowStatusMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-[10px] text-ink hover:bg-white/5 transition-colors flex items-center gap-2"
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_META[s].dot)} />
                      {s}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={onEdit}
            title="Edit"
            aria-label="Edit appointment"
            className="w-7 h-7 rounded-lg glass border border-black/10 flex items-center justify-center text-muted hover:text-ink hover:border-white/25 transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            title="Remove"
            aria-label="Remove appointment"
            className="w-7 h-7 rounded-lg glass border border-black/10 flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/30 transition-all disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
