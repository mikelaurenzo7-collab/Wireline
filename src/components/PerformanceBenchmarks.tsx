import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { authFetch } from "../lib/api";
import { ShadButton } from "./ui/shadcn/ShadButton";

interface BenchmarkItem {
  label: string;
  user: number;
  benchmark: number;
  unit: string;
  better_when: "higher" | "closer";
  tip: string;
}

interface BenchmarksData {
  benchmarks: Record<string, BenchmarkItem>;
  period: string;
  total_calls: number;
}

type Status = "green" | "yellow" | "red";

function getStatus(item: BenchmarkItem): Status {
  const { user, benchmark, better_when } = item;
  if (better_when === "higher") {
    if (user >= benchmark * 0.9) return "green";
    if (user >= benchmark * 0.6) return "yellow";
    return "red";
  }
  // closer
  const ratio = Math.abs(user - benchmark) / (benchmark || 1);
  if (ratio < 0.3) return "green";
  if (ratio < 0.6) return "yellow";
  return "red";
}

const statusConfig: Record<
  Status,
  { icon: string; color: string; bgColor: string; borderColor: string }
> = {
  green: {
    icon: "✓",
    color: "text-brand",
    bgColor: "bg-brand/10",
    borderColor: "border-brand/25",
  },
  yellow: {
    icon: "~",
    color: "text-brand/90",
    bgColor: "bg-brand/8",
    borderColor: "border-brand/25",
  },
  red: {
    icon: "↑",
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
  },
};

function BenchmarkRow({ item }: { item: BenchmarkItem }) {
  const [expanded, setExpanded] = useState(false);
  const status = getStatus(item);
  const cfg = statusConfig[status];

  // Calculate bar widths (cap at 100%)
  const maxVal = Math.max(item.user, item.benchmark, 1);
  const userPct = Math.min(100, (item.user / maxVal) * 100);
  const benchmarkPct = Math.min(100, (item.benchmark / maxVal) * 100);

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <ShadButton
        type="button"
        disableAnimations
        variant="ghost"
        onClick={() => setExpanded((v) => !v)}
        className="w-full h-auto justify-start text-left px-4 py-3 hover:bg-white/2 group rounded-none"
      >
        <div className="flex items-center gap-3">
          {/* Status badge */}
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border text-xs font-bold ${cfg.bgColor} ${cfg.borderColor} ${cfg.color}`}
          >
            {cfg.icon}
          </div>

          {/* Label + bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="wl-micro-meta">{item.label}</span>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span className="font-mono text-[length:var(--wireline-typography-overline-size)] text-brand">
                  {item.user}
                  <span className="text-foreground/55 ml-0.5 wl-micro-meta">{item.unit}</span>
                </span>
                <span className="wl-micro-meta">vs</span>
                <span className="font-mono text-[length:var(--wireline-typography-overline-size)] text-foreground/70">
                  {item.benchmark}
                  <span className="text-foreground/55 ml-0.5 wl-micro-meta">{item.unit}</span>
                </span>
              </div>
            </div>

            {/* Dual bar */}
            <div className="relative h-1.5 rounded-full bg-white/5 overflow-visible">
              {/* User bar */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${userPct}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="absolute top-0 left-0 h-full rounded-full bg-brand"
              />
              {/* Benchmark marker */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full bg-white/40"
                data-benchmark-left={`${benchmarkPct}%`}
              />
            </div>
          </div>

          {/* Expand chevron */}
          <div className="shrink-0 text-foreground/55 group-hover:text-foreground/55 transition-colors">
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </div>
        </div>
      </ShadButton>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className={`mx-4 mb-3 px-3 py-2.5 rounded-md wl-panel border text-[length:var(--wireline-typography-overline-size)] text-foreground/70 leading-relaxed ${cfg.borderColor}`}
            >
              💡 {item.tip}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="px-4 py-3 border-b border-white/5">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 rounded-full bg-white/8 animate-pulse shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="h-2 w-28 rounded bg-white/8 animate-pulse" />
            <div className="h-2 w-20 rounded bg-white/8 animate-pulse" />
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/8 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default function PerformanceBenchmarks() {
  const [data, setData] = useState<BenchmarksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Race guard: if the panel unmounts (tab swap, route change) while
    // /api/dashboard/benchmarks is in flight, the late response must not
    // call setState on a dead component. AbortController also lets
    // authFetch's deadline drain cleanly on cancel.
    let cancelled = false;
    const controller = new AbortController();
    authFetch("/api/dashboard/benchmarks", { signal: controller.signal })
      .then((r) => r.json() as Promise<BenchmarksData>)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError("Failed to load benchmarks");
        setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <div>
        {[...Array(6)].map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="wl-label text-rose-500/60">{error || "No data"}</p>
      </div>
    );
  }

  if (data.total_calls === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 py-8">
        <TrendingUp className="w-8 h-8 text-foreground/55" />
        <p className="wl-micro-meta">No call data in the last 30 days</p>
        <Link
          to="/phone?tab=outbound"
          className="px-3 py-1.5 rounded-full wl-panel border border-brand/30 text-brand wl-label hover:bg-brand/10 transition-all"
        >
          Start Outbound Campaign →
        </Link>
      </div>
    );
  }

  const items = Object.values(data.benchmarks);

  return (
    <div>
      {items.map((item) => (
        <BenchmarkRow key={item.label} item={item} />
      ))}
    </div>
  );
}
