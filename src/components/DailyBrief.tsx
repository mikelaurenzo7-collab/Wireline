/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Sun,
  Brain,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Zap,
  Mail,
  Send,
  Check,
  X as XIcon,
  Clock,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDate, formatDateTime } from "../lib/safe-date";

interface BriefData {
  brief: {
    headline: string;
    mood: "green" | "yellow" | "red";
    key_metrics_takeaway: string;
    highlights: string[];
    concerns: string[];
    action_items: Array<{ description: string; urgency: "high" | "medium" | "low" }>;
  };
  stats_yesterday: {
    total_calls: number;
    total_minutes: number;
    avg_lead_score: number;
    high_intent_count: number;
    cost: number;
    appointments_booked: number;
  };
  week_delta: {
    calls_pct: number;
    score_pct: number;
    cost_pct: number;
  };
  cached?: boolean;
}

export default function DailyBrief() {
  const [data, setData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  // Mounted guard: load() runs both on mount and on the operator's
  // "Refresh" click. The latter is always in-mount, but the mount path
  // can resolve after navigation away — without this, late responses
  // would call setState on an unmounted DailyBrief.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = async (refresh = false) => {
    if (mountedRef.current) {
      setLoading(true);
      setErr(null);
    }
    try {
      const r = await authFetch(`/api/insights/daily-brief${refresh ? "?refresh=1" : ""}`);
      const d = await r.json();
      if (!mountedRef.current) return;
      if (r.status === 503) {
        setNeedsKey(true);
        return;
      }
      if (!r.ok) throw new Error(d.error);
      setData(d);
    } catch (e: any) {
      if (mountedRef.current) setErr(e.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (needsKey)
    return (
      <div className="relative aurora-ring rounded-3xl">
        <div className="relative p-7 rounded-3xl glass overflow-hidden flex items-center gap-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "#8B3FD6" }}
          >
            <Brain className="w-7 h-7 text-on-brand" />
          </div>
          <div className="flex-1">
            <h3 className="font-display italic text-2xl text-ink leading-tight">
              Daily Brief is offline
            </h3>
            <p className="text-sm text-ink/65">
              Contact your administrator to enable the Wireline Daily Brief.
            </p>
          </div>
        </div>
      </div>
    );

  if (loading && !data)
    return (
      <div className="rounded-3xl glass border border-white/10 p-8 flex items-center gap-4">
        <Loader2 className="w-5 h-5 animate-spin text-brand" />
        <span className="text-[11px] uppercase tracking-[0.4em] text-muted">
          Wireline is analyzing your day…
        </span>
      </div>
    );

  if (err && !data)
    return (
      <div
        role="alert"
        className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-5 flex items-start gap-3"
      >
        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
        <span className="text-sm text-rose-500">{err}</span>
      </div>
    );

  if (!data) return null;

  // Defensive defaults — Claude's structured-output sometimes returns
  // partial shapes (missing fields, null arrays). Don't let a thin API
  // response crash the render with "Cannot read property X of undefined".
  const brief = {
    headline: data.brief?.headline ?? "Today's brief",
    mood: data.brief?.mood ?? "yellow",
    key_metrics_takeaway: data.brief?.key_metrics_takeaway ?? "",
    highlights: Array.isArray(data.brief?.highlights) ? data.brief!.highlights : [],
    concerns: Array.isArray(data.brief?.concerns) ? data.brief!.concerns : [],
    action_items: Array.isArray(data.brief?.action_items) ? data.brief!.action_items : [],
  };
  const stats = {
    total_calls: Number(data.stats_yesterday?.total_calls ?? 0),
    total_minutes: Number(data.stats_yesterday?.total_minutes ?? 0),
    avg_lead_score: Number(data.stats_yesterday?.avg_lead_score ?? 0),
    high_intent_count: Number(data.stats_yesterday?.high_intent_count ?? 0),
    cost: Number(data.stats_yesterday?.cost ?? 0),
    appointments_booked: Number(data.stats_yesterday?.appointments_booked ?? 0),
  };
  const weekDelta = {
    calls_pct: Number.isFinite(data.week_delta?.calls_pct) ? data.week_delta!.calls_pct : 0,
    score_pct: Number.isFinite(data.week_delta?.score_pct) ? data.week_delta!.score_pct : 0,
    cost_pct: Number.isFinite(data.week_delta?.cost_pct) ? data.week_delta!.cost_pct : 0,
  };

  const moodAccent =
    brief.mood === "green" ? "#8B3FD6" : brief.mood === "yellow" ? "#C4B5A0" : "#8B3FD6";
  const moodLabel =
    brief.mood === "green"
      ? "All systems go"
      : brief.mood === "yellow"
        ? "Watch closely"
        : "Needs attention";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative aurora-ring rounded-3xl"
    >
      <div className="relative rounded-3xl glass-strong overflow-hidden">
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full max-w-[60vw] max-h-[60vw] sm:max-w-none sm:max-h-none opacity-30 blur-3xl pointer-events-none"
          style={{ background: `radial-gradient(circle, ${moodAccent}, transparent)` }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-72 h-72 rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #8B3FD6, transparent)" }}
        />

        <div className="relative z-10 px-7 py-5 border-b border-white/8 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${moodAccent}, ${moodAccent}aa)` }}
            >
              <Sun className="w-5 h-5 text-paper" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-brand flex items-center gap-2">
                <Brain className="w-3 h-3" /> Daily Brief ·{" "}
                {formatDate(
                  new Date(),
                  { weekday: "long", month: "long", day: "numeric" },
                  "Today",
                  "en-US",
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: moodAccent, boxShadow: `0 0 12px ${moodAccent}` }}
                />
                <span className="text-[10px] uppercase tracking-[0.3em] text-ink/70">
                  {moodLabel}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSchedule((s) => !s)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.3em] transition-all flex items-center gap-1.5",
                showSchedule
                  ? "bg-brand-2/15 border border-brand-2/40 text-brand-2"
                  : "glass border border-white/10 text-muted hover:text-brand-2 hover:border-brand-2/40",
              )}
            >
              <Mail className="w-3 h-3" /> Email Schedule
            </button>
            <button
              onClick={() => load(true)}
              disabled={loading}
              className="px-3 py-1.5 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.3em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {data.cached ? "Refresh" : "Cached"}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showSchedule && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="relative z-10 overflow-hidden"
            >
              <DailyBriefSchedule onClose={() => setShowSchedule(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative z-10 p-7 space-y-7">
          {/* Headline */}
          <div className="space-y-3">
            <h2 className="font-display italic text-3xl md:text-5xl text-ink leading-tight">
              {brief.headline}
            </h2>
            <p className="text-ink/70 text-sm md:text-base leading-relaxed max-w-3xl">
              {brief.key_metrics_takeaway}
            </p>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Quick label="Calls" value={stats.total_calls} delta={weekDelta.calls_pct} />
            <Quick label="Avg Score" value={stats.avg_lead_score} delta={weekDelta.score_pct} />
            <Quick label="High Intent" value={stats.high_intent_count} />
            <Quick
              label="Spend"
              value={`$${stats.cost.toFixed(2)}`}
              delta={weekDelta.cost_pct}
              invertDelta
            />
          </div>

          {/* Highlights & Concerns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {brief.highlights.length > 0 && (
              <Section title="Highlights" icon={Sparkles} accent="#8B3FD6">
                {brief.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </Section>
            )}
            {brief.concerns.length > 0 && (
              <Section title="Concerns" icon={AlertTriangle} accent="#8B3FD6">
                {brief.concerns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </Section>
            )}
          </div>

          {/* Action items */}
          {brief.action_items.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-[10px] uppercase tracking-[0.4em] text-brand flex items-center gap-2">
                <Zap className="w-3 h-3" /> Do today
              </h4>
              <div className="space-y-2">
                {brief.action_items.map((a, i) => (
                  <div
                    key={i}
                    className="rounded-xl glass border border-white/10 p-4 flex items-start gap-3"
                  >
                    <span
                      className={cn(
                        "shrink-0 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] mt-0.5",
                        a.urgency === "high" &&
                          "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                        a.urgency === "medium" && "bg-brand/15 text-brand border border-brand/30",
                        a.urgency === "low" &&
                          "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
                      )}
                    >
                      {a.urgency}
                    </span>
                    <p className="text-sm text-ink/90 flex-1">{a.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link
            to="/triage"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full glass border border-brand/30 hover:bg-brand/10 transition-all text-[11px] uppercase tracking-[0.3em] text-brand"
          >
            Open Triage Inbox <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

function Quick({
  label,
  value,
  delta,
  invertDelta,
}: {
  label: string;
  value: any;
  delta?: number;
  invertDelta?: boolean;
}) {
  const showDelta = delta !== undefined && Math.abs(delta) >= 0.5;
  const isUp = (delta ?? 0) > 0;
  // For "spend", going up is bad — invert the color sense.
  const isGood = invertDelta ? !isUp : isUp;
  return (
    <div className="rounded-2xl glass border border-white/10 p-4">
      <div className="text-[10px] uppercase tracking-[0.3em] text-muted mb-2">{label}</div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display italic text-3xl text-ink">{value}</span>
        {showDelta && (
          <span
            className="text-[10px] uppercase tracking-[0.2em] flex items-center gap-1"
            style={{ color: isGood ? "#10b981" : "#E8466A" }}
          >
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(Math.round(delta!))}%
          </span>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  accent,
  children,
}: {
  title: string;
  icon: any;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl glass border border-white/10 p-5">
      <h4
        className="text-[10px] uppercase tracking-[0.4em] mb-3 flex items-center gap-2"
        style={{ color: accent }}
      >
        <Icon className="w-3 h-3" /> {title}
      </h4>
      <ul className="space-y-1.5 text-sm text-ink/85 list-disc list-inside marker:text-brand/50">
        {children}
      </ul>
    </div>
  );
}

function DailyBriefSchedule({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [sendAt, setSendAt] = useState("13:00");
  const [recipient, setRecipient] = useState("");
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailAddress, setGmailAddress] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await authFetch("/api/daily-brief/settings");
      const d = await r.json();
      if (r.ok) {
        setEnabled(!!d.settings.enabled);
        setSendAt(d.settings.send_at || "13:00");
        setRecipient(d.settings.recipient || "");
        setLastSentAt(d.settings.last_sent_at);
        setLastError(d.settings.last_error);
        setGmailConnected(!!d.gmail_connected);
        setGmailAddress(d.gmail_address);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    const trimmed = recipient.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFeedback({ kind: "err", text: "Enter a valid email address." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const r = await authFetch("/api/daily-brief/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, send_at: sendAt, recipient: trimmed || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Save failed");
      setFeedback({ kind: "ok", text: "Saved." });
      refresh();
    } catch (e: any) {
      setFeedback({ kind: "err", text: e?.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    setFeedback(null);
    try {
      const r = await authFetch("/api/daily-brief/send-now", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Send failed");
      setFeedback({ kind: "ok", text: `Sent to ${d.recipient}.` });
    } catch (e: any) {
      setFeedback({ kind: "err", text: e?.message || "Send failed" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="px-7 py-5 border-b border-white/8 bg-black/20 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-brand-2">
          <Mail className="w-3 h-3" /> Email this brief on a schedule
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 rounded-full glass border border-white/10 hover:border-white/30 flex items-center justify-center text-ink/70 hover:text-ink"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {!gmailConnected && (
            <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2" style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)", color: "#d97706" }}>
              <AlertTriangle className="w-3.5 h-3.5" />
              Connect a Gmail account in{" "}
              <Link to="/integrations" className="underline">
                Carrier Bridge
              </Link>{" "}
              first — emails are sent through your own Gmail OAuth.
            </div>
          )}

          <button
            type="button"
            onClick={() => setEnabled((e) => !e)}
            disabled={!gmailConnected}
            className={cn(
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "w-full px-4 py-3 rounded-xl border flex items-start gap-3 text-left transition-all",
              !gmailConnected
                ? "bg-black/20 border-white/5 text-muted/70 cursor-not-allowed"
                : enabled
                  ? "bg-brand-2/15 border-brand-2/40 text-brand-2"
                  : "bg-black/5 border-black/10 text-ink/80 hover:border-black/20",
            )}
          >
            <div
              className={cn(
                "shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center mt-0.5",
                enabled && gmailConnected
                  ? "bg-brand-2 border-brand-2 text-on-brand"
                  : "border-white/30",
              )}
            >
              {enabled && gmailConnected && <Check className="w-2.5 h-2.5" strokeWidth={4} />}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium">
                Send the daily brief by email at the time below (UTC)
              </div>
              <div className="text-[10px] leading-snug mt-0.5 text-ink/65">
                Background scheduler ticks every 5 minutes. Emails are sent through{" "}
                {gmailAddress ? (
                  <span className="font-mono text-ink/75">{gmailAddress}</span>
                ) : (
                  "your connected Gmail account"
                )}
                .
              </div>
            </div>
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-[0.3em] text-muted flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Send time (UTC)
              </span>
              <input
                type="time"
                value={sendAt}
                onChange={(e) => setSendAt(e.target.value)}
                className="w-full h-11 px-4 rounded-xl bg-black/5 border border-black/10 outline-none text-ink text-sm focus:border-brand/60 transition-all font-mono"
              />
              <span className="text-[10px] text-ink/65 leading-snug">
                13:00 UTC ≈ 9 AM ET / 6 AM PT. Convert your local time before saving.
              </span>
            </label>
            <label className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-[0.3em] text-muted">Recipient</span>
              <input
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.trimStart())}
                onBlur={(e) => setRecipient(e.target.value.trim())}
                placeholder="you@example.com"
                className="w-full h-11 px-4 rounded-xl bg-black/5 border border-black/10 outline-none text-ink text-sm focus:border-brand/60 transition-all"
              />
            </label>
          </div>

          {lastSentAt && (
            <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "rgba(16,185,129,0.70)" }}>
              Last sent {formatDateTime(lastSentAt, undefined, "—")}
            </div>
          )}
          {lastError && (
            <div className="text-[10px] text-rose-500 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span className="font-mono">Last error: {lastError}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
            <button
              onClick={sendNow}
              disabled={sending || !gmailConnected || !recipient}
              className="h-10 px-4 rounded-lg glass border border-brand-2/30 text-brand-2 hover:bg-brand-2/10 text-[11px] uppercase tracking-[0.25em] flex items-center gap-2 disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Send preview now
            </button>
            <div className="flex items-center gap-3">
              {feedback && (
                <span
                  className="text-[11px]"
                  style={{ color: feedback.kind === "ok" ? "#10b981" : "#E8466A" }}
                >
                  {feedback.text}
                </span>
              )}
              <button
                onClick={save}
                disabled={saving}
                className="h-10 px-4 rounded-lg bg-brand text-on-brand text-[11px] uppercase tracking-[0.25em] flex items-center gap-2 disabled:opacity-50 hover:opacity-90"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
