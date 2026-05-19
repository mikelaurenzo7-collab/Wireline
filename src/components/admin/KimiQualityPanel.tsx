import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  ShieldCheck,
  Zap,
  Activity,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Terminal,
  Code,
  Cpu,
} from "lucide-react";
import { clsx } from "clsx";
import { authFetch } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";

interface KimiStatus {
  score: number;
  status: string;
  lastAudit: string;
}

const PRINCIPLES = [
  { id: "p1", title: "Decide, Don't Ask", desc: "Autonomous execution of high-leverage tasks." },
  { id: "p2", title: "Vertical TDD", desc: "Ship working slices with zero placeholders." },
  { id: "p3", title: "Production Data", desc: "Real state over mock-driven development." },
  { id: "p4", title: "Rich Aesthetics", desc: "Premium, glassmorphic visual excellence." },
  { id: "p5", title: "Deep Discovery", desc: "Exhaustive auditing before implementation." },
];

export function KimiQualityPanel() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [status, setStatus] = useState<KimiStatus | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await authFetch("/api/kimi/status");
      if (res.ok) setStatus(await res.json());
    } catch (e) {
      console.error("Failed to fetch Kimi status", e);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const runAudit = async () => {
    setIsAuditing(true);
    try {
      const res = await authFetch("/api/kimi/audit", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setStatus({
          score: data.score,
          status: data.score >= 9 ? "Hardened" : "Beta",
          lastAudit: data.timestamp,
        });
        setReport(data.report);
        toastSuccess("Audit Complete", `Maturity Score: ${data.score}/10`);
      } else {
        throw new Error("Audit failed");
      }
    } catch (e: any) {
      toastError("Audit Failed", e.message);
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Maturity Score Header */}
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-brand/20 to-brand-2/20 rounded-[2rem] blur opacity-25" />
        <div className="relative glass border-black/5 rounded-[2rem] p-8 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-2 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <Sparkles className="w-4 h-4 text-brand" />
              <span className="text-[10px] uppercase tracking-[0.4em] font-bold text-muted">
                Kimi Maturity Index
              </span>
            </div>
            <h2 className="text-4xl font-black tracking-tighter text-ink italic">
              {status?.status || "Calculating..."}
            </h2>
            <p className="text-xs text-muted max-w-sm">
              Your system is evaluated against the 15 Non-Negotiable Principles of the Unstoppable
              Engineer's Playbook.
            </p>
          </div>

          <div className="relative flex items-center justify-center">
            {/* Progress Ring */}
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="58"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-black/5"
              />
              <motion.circle
                cx="64"
                cy="64"
                r="58"
                stroke="url(#kimi-grad)"
                strokeWidth="8"
                strokeDasharray={364}
                initial={{ strokeDashoffset: 364 }}
                animate={{ strokeDashoffset: 364 - (364 * (status?.score || 0)) / 10 }}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="kimi-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4F1E7B" />
                  <stop offset="100%" stopColor="#4F1E7B" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-ink">{status?.score || 0}</span>
              <span className="text-[8px] uppercase tracking-widest text-muted font-bold">
                / 10
              </span>
            </div>
          </div>

          <button
            onClick={runAudit}
            disabled={isAuditing}
            className="brutal-btn !rounded-2xl !px-8 !py-4 flex items-center gap-3 active:scale-95 transition-all shadow-xl shadow-brand/20"
          >
            {isAuditing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            <span className="text-xs font-black uppercase tracking-[0.2em]">Run Deep Audit</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Principles Checklist */}
        <div className="glass border-black/5 rounded-[2rem] p-8 space-y-6">
          <h3 className="text-[10px] uppercase tracking-[0.4em] font-medium text-muted flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-brand" />
            Core Principles
          </h3>
          <div className="space-y-4">
            {PRINCIPLES.map((p) => (
              <div
                key={p.id}
                className="flex items-start gap-4 p-4 rounded-2xl bg-black/[0.02] border border-black/5 hover:border-brand/20 transition-all group"
              >
                <div className="w-8 h-8 rounded-xl bg-white border border-black/5 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-brand" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-ink uppercase tracking-wider">{p.title}</h4>
                  <p className="text-[10px] text-muted leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Audit Log / Report */}
        <div className="glass border-black/5 rounded-[2rem] p-8 flex flex-col min-h-[400px]">
          <h3 className="text-[10px] uppercase tracking-[0.4em] font-medium text-muted flex items-center gap-2 mb-6">
            <Activity className="w-3.5 h-3.5 text-brand" />
            Latest Audit Log
          </h3>

          <div className="flex-1 rounded-2xl bg-black/5 p-6 font-mono text-[10px] overflow-y-auto custom-scrollbar border border-black/5">
            {report ? (
              <pre className="whitespace-pre-wrap text-ink/70 leading-relaxed">{report}</pre>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-muted/40">
                <Cpu className="w-8 h-8 opacity-20" />
                <p className="uppercase tracking-widest italic">Awaiting Telemetry</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
