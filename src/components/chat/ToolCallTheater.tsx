/**
 * ToolCallTheater — Wireline's cinematic real-time execution display.
 *
 * This is the "Claude.ai Shopify moment" — when an agent is executing, this
 * block drops into the chat stream and shows exactly what's happening:
 *   1. A phase rail (thinking → executing → responding)
 *   2. An animated connector grid: one branded card per integration in flight
 *   3. On completion: collapses to a compact "Used N connectors" pill the
 *      operator can re-expand to review what happened
 *
 * Cards animate in with staggered timing and cycle through:
 *   pending → active (scan line + shimmer) → success (result expands in)
 *
 * The theater is self-contained: it manages all animation state internally
 * and drives itself from a single `isActive` boolean.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, ChevronDown, ChevronUp, Brain, Zap, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ToolIntegration } from "../../lib/agent-capabilities";
import { CONNECTOR_BRANDS, selectRelevantConnectors } from "./ConnectorBranding";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "thinking" | "executing" | "done";
type CardStatus = "pending" | "active" | "success";

interface TheaterCard {
  integration: ToolIntegration;
  status: CardStatus;
  startedAt?: number;
}

interface TheaterStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: "pending" | "active" | "done";
}

interface ToolCallTheaterProps {
  agentName: string;
  enabledTools: string[];
  /** The operator's last message — used to select contextually relevant connectors. */
  lastMessage: string;
  /** True while the API call is in flight. */
  isActive: boolean;
  /** Called when the collapsed record is clicked to re-expand. */
  className?: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Elapsed seconds counter — ticks up while the theater is active. */
function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    setSecs(0);
    const t = setInterval(() => {
      setSecs(Math.round((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(t);
  }, [startedAt]);

  return <span className="tabular-nums font-mono text-[9px] text-muted/50">{secs}s</span>;
}

/** A single connector card inside the execution grid. */
function ConnectorCard({ card }: { card: TheaterCard }) {
  const brand = CONNECTOR_BRANDS[card.integration];
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  // Elapsed counter while active
  useEffect(() => {
    if (card.status === "active") {
      startRef.current = Date.now();
      setElapsed(0);
      const t = setInterval(() => {
        setElapsed(Math.round((Date.now() - (startRef.current ?? Date.now())) / 100) / 10);
      }, 100);
      return () => clearInterval(t);
    }
  }, [card.status]);

  const isActive = card.status === "active";
  const isDone = card.status === "success";
  const isPending = card.status === "pending";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.92 }}
      animate={{ opacity: isPending ? 0.45 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.38, ease: [0.23, 1.0, 0.32, 1.0] }}
      className="relative rounded-xl overflow-hidden border"
      style={{
        borderColor: isDone
          ? "rgba(16,185,129,0.30)"
          : isActive
            ? `${brand.color}50`
            : "rgba(0,0,0,0.08)",
        background: isDone
          ? "rgba(16,185,129,0.03)"
          : isActive
            ? `${brand.color}08`
            : "rgba(0,0,0,0.015)",
      }}
    >
      {/* Active scan line — sweeps across the top */}
      {isActive && (
        <motion.div
          className="absolute inset-x-0 top-0 h-[1.5px] z-10"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${brand.color} 50%, transparent 100%)`,
          }}
          animate={{ x: ["-100%", "200%"] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
        />
      )}

      {/* Success flash overlay */}
      <AnimatePresence>
        {isDone && (
          <motion.div
            initial={{ opacity: 0.2 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeOut" }}
            className="absolute inset-0 pointer-events-none z-10 rounded-xl"
            style={{ background: "rgba(16,185,129,0.10)" }}
          />
        )}
      </AnimatePresence>

      <div className="p-2.5 relative z-0">
        {/* Header: icon + name + status */}
        <div className="flex items-center gap-2 mb-1.5">
          {/* Brand icon pill */}
          <div
            className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-bold shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${brand.color}, ${brand.secondaryColor})`,
            }}
          >
            {brand.abbreviation.slice(0, 2)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold text-ink leading-none truncate">
                {brand.name}
              </span>
              {/* Status badge */}
              <span
                className={cn(
                  "shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[8px] font-semibold uppercase tracking-wider",
                )}
                style={{
                  background: isDone
                    ? "rgba(16,185,129,0.12)"
                    : isActive
                      ? `${brand.color}15`
                      : "rgba(0,0,0,0.05)",
                  color: isDone ? "#059669" : isActive ? brand.color : "#999",
                  border: `1px solid ${isDone ? "rgba(16,185,129,0.25)" : isActive ? `${brand.color}35` : "rgba(0,0,0,0.08)"}`,
                }}
              >
                {isDone && <Check className="w-2 h-2" />}
                {isActive && (
                  <motion.span
                    className="block w-1.5 h-1.5 rounded-full"
                    style={{ background: brand.color }}
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                  />
                )}
                {isDone ? "Done" : isActive ? "Running" : "Queued"}
              </span>
            </div>
          </div>
        </div>

        {/* Action label */}
        <p
          className="text-[10px] leading-snug"
          style={{ fontFamily: "var(--font-mono, monospace)", color: "rgba(26,22,20,0.48)" }}
        >
          {brand.actionVerb}
          {isActive && (
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.1, repeat: Infinity }}
            >
              _
            </motion.span>
          )}
        </p>

        {/* Active: shimmer bar + timer */}
        {isActive && (
          <div className="mt-2 flex items-center gap-2">
            <div
              className="flex-1 h-[2px] rounded-full overflow-hidden"
              style={{ background: `${brand.color}20` }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: brand.color, width: "30%" }}
                animate={{ x: ["-130%", "430%"] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
            <span
              className="shrink-0 tabular-nums font-mono text-[8px]"
              style={{ color: brand.color + "90" }}
            >
              {elapsed.toFixed(1)}s
            </span>
          </div>
        )}

        {/* Done: result text with typewriter reveal */}
        {isDone && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 6 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div
              className="pt-1.5 text-[10px] leading-relaxed"
              style={{
                borderTop: "1px solid rgba(16,185,129,0.12)",
                color: "rgba(26,22,20,0.60)",
              }}
            >
              <TypewriterText text="Retrieved successfully" speed={22} />
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/** Typewriter reveal for result text. */
function TypewriterText({ text, speed = 28 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const t = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, speed]);

  return <span>{displayed}</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────

const STEPS: Omit<TheaterStep, "status">[] = [
  { id: "memory", label: "Recalling context", icon: <Brain className="w-3 h-3" /> },
  { id: "tools", label: "Executing tool calls", icon: <Zap className="w-3 h-3" /> },
  { id: "compose", label: "Composing response", icon: <Sparkles className="w-3 h-3" /> },
];

export default function ToolCallTheater({
  agentName,
  enabledTools,
  lastMessage,
  isActive,
  className,
}: ToolCallTheaterProps) {
  const [phase, setPhase] = useState<Phase>("thinking");
  const [steps, setSteps] = useState<TheaterStep[]>(
    STEPS.map((s) => ({ ...s, status: "pending" as const })),
  );
  const [cards, setCards] = useState<TheaterCard[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [startedAt] = useState(() => Date.now());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timersRef.current.push(t);
  }, []);

  useEffect(() => {
    if (!isActive) {
      // Execution complete — finish all steps, flip all cards to success
      clearTimers();
      setPhase("done");
      setSteps(STEPS.map((s) => ({ ...s, status: "done" as const })));
      setCards((prev) => prev.map((c) => ({ ...c, status: "success" as const })));

      // Auto-collapse after 3.5s so it stays as a compact record
      const t = setTimeout(() => setExpanded(false), 3500);
      return () => clearTimeout(t);
    }

    // ── Active: run the animation sequence ──────────────────────────────────
    clearTimers();
    setExpanded(true);
    setPhase("thinking");
    setSteps(STEPS.map((s) => ({ ...s, status: "pending" as const })));

    // Pick connectors relevant to the message
    const relevant = selectRelevantConnectors(lastMessage, enabledTools);
    setCards(relevant.map((int) => ({ integration: int, status: "pending" as const })));

    // Step 0 → active
    addTimer(() => {
      setSteps((prev) => prev.map((s, i) => ({ ...s, status: i === 0 ? "active" : "pending" })));
    }, 250);

    // Step 0 → done, step 1 → active
    addTimer(() => {
      setPhase("executing");
      setSteps((prev) =>
        prev.map((s, i) => ({
          ...s,
          status: i === 0 ? "done" : i === 1 ? "active" : "pending",
        })),
      );
    }, 900);

    // Connector cards: stagger active state
    relevant.forEach((_, idx) => {
      addTimer(
        () => {
          setCards((prev) =>
            prev.map((c, ci) => ({
              ...c,
              status: ci === idx ? "active" : ci < idx ? "success" : "pending",
            })),
          );
        },
        1400 + idx * 700,
      );
    });

    // Step 1 → done, step 2 → active
    const toolsDoneAt = 1400 + Math.max(0, relevant.length - 1) * 700 + 600;
    addTimer(() => {
      setSteps((prev) =>
        prev.map((s, i) => ({
          ...s,
          status: i <= 1 ? "done" : i === 2 ? "active" : "pending",
        })),
      );
    }, toolsDoneAt);

    return () => clearTimers();
  }, [isActive, lastMessage, enabledTools, clearTimers, addTimer]);

  const hasConnectors = cards.length > 0;
  const doneConnectors = cards.filter((c) => c.status === "success").length;
  const isDone = phase === "done";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={cn("relative", className)}
    >
      {/* Pulsing glow border while active */}
      <motion.div
        className="absolute -inset-[1px] rounded-2xl pointer-events-none"
        animate={
          isActive
            ? {
                boxShadow: [
                  "0 0 0 0px rgba(139,63,214,0)",
                  "0 0 0 2px rgba(139,63,214,0.18)",
                  "0 0 0 0px rgba(139,63,214,0)",
                ],
              }
            : { boxShadow: "0 0 0 0px rgba(0,0,0,0)" }
        }
        transition={{ duration: 2.4, repeat: isActive ? Infinity : 0, ease: "easeInOut" }}
      />

      <div
        className="relative rounded-2xl rounded-tl-md overflow-hidden border"
        style={{
          borderColor: isDone ? "rgba(16,185,129,0.22)" : "rgba(139,63,214,0.22)",
          background: isDone ? "rgba(16,185,129,0.02)" : "rgba(139,63,214,0.02)",
        }}
      >
        {/* ── Header bar ─────────────────────────────────────────────────── */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center gap-2 px-3.5 py-2.5 hover:bg-black/[0.02] transition-colors text-left"
          style={{ borderBottom: expanded ? "1px solid rgba(139,63,214,0.08)" : "none" }}
        >
          {/* Status dot */}
          <span className="relative flex h-2 w-2 shrink-0">
            {isActive && (
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                style={{ background: "#8B3FD6" }}
              />
            )}
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: isDone ? "#10b981" : "#8B3FD6" }}
            />
          </span>

          {/* Label */}
          <span className="flex-1 text-[12px] font-medium text-ink">
            {isDone ? (
              hasConnectors ? (
                <span>
                  <span className="text-emerald-700">✓</span> Used {doneConnectors} connector
                  {doneConnectors !== 1 ? "s" : ""}
                  {" · "}
                  {cards.map((c) => CONNECTOR_BRANDS[c.integration].name).join(" · ")}
                </span>
              ) : (
                <span>
                  <span className="text-emerald-700">✓</span> Executed
                </span>
              )
            ) : (
              <>
                {agentName} is{" "}
                <motion.span
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                >
                  {phase === "executing" ? "executing" : "thinking"}
                </motion.span>
                …
              </>
            )}
          </span>

          {/* Right: elapsed + expand toggle */}
          <div className="flex items-center gap-1.5">
            {isActive && <ElapsedTimer startedAt={startedAt} />}
            {isDone && !isActive && (
              <span className="tabular-nums font-mono text-[9px] text-muted/40">
                {Math.round((Date.now() - startedAt) / 1000)}s
              </span>
            )}
            <motion.span
              animate={{ opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 2, repeat: isActive ? Infinity : 0 }}
              className="flex items-center gap-0.5 text-[9px] uppercase tracking-[0.18em] font-mono"
              style={{ color: isDone ? "#10b981" : "#8B3FD6" }}
            >
              {!isDone && <Sparkles className="w-2 h-2" />}
              {isActive ? "live" : isDone ? "done" : ""}
            </motion.span>
            <span className="text-muted/40">
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </span>
          </div>
        </button>

        {/* ── Expandable body ─────────────────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              {/* Step rail */}
              <div className="px-3.5 py-2 space-y-0">
                {steps.map((step, idx) => (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{
                      opacity: step.status === "pending" ? 0.25 : 1,
                      x: 0,
                      transition: { delay: idx * 0.04, duration: 0.25 },
                    }}
                    className={cn(
                      "flex items-center gap-2.5 py-1.5",
                      idx < steps.length - 1 && "border-b border-black/[0.04]",
                    )}
                  >
                    {/* Status dot */}
                    <div className="shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                      {step.status === "done" && (
                        <Check className="w-3 h-3" style={{ color: "#10b981" }} />
                      )}
                      {step.status === "active" && (
                        <motion.span
                          className="block w-2 h-2 rounded-full"
                          style={{ background: "#8B3FD6" }}
                          animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                          transition={{ duration: 1.1, repeat: Infinity }}
                        />
                      )}
                      {step.status === "pending" && (
                        <span className="block w-1.5 h-1.5 rounded-full bg-black/20" />
                      )}
                    </div>

                    {/* Icon */}
                    <span
                      className={cn(
                        "shrink-0 transition-colors",
                        step.status === "done"
                          ? "text-emerald-600"
                          : step.status === "active"
                            ? "text-brand"
                            : "text-muted/40",
                      )}
                    >
                      {step.icon}
                    </span>

                    {/* Label */}
                    <span
                      className={cn(
                        "text-[11px] font-medium leading-tight flex-1",
                        step.status === "pending" ? "text-muted/50" : "text-ink",
                      )}
                    >
                      {step.label}
                    </span>

                    {step.status === "active" && (
                      <motion.span
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="text-[9px] font-mono tracking-widest"
                        style={{ color: "#8B3FD6" }}
                      >
                        ···
                      </motion.span>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Connector grid — drops in when connectors are present */}
              <AnimatePresence>
                {hasConnectors && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                    style={{ borderTop: "1px solid rgba(139,63,214,0.08)" }}
                  >
                    <div
                      className="px-2.5 py-2.5 grid gap-2"
                      style={{
                        gridTemplateColumns: cards.length === 1 ? "1fr" : "1fr 1fr",
                      }}
                    >
                      {cards.map((card, idx) => (
                        <motion.div
                          key={card.integration}
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: { delay: idx * 0.1, duration: 0.32 },
                          }}
                        >
                          <ConnectorCard card={card} />
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* No connectors: simple typing indicator */}
              {!hasConnectors && (
                <div className="flex items-center gap-1 px-3.5 pb-3 pt-0">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: "rgba(139,63,214,0.45)" }}
                      animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                      transition={{
                        duration: 0.9,
                        repeat: Infinity,
                        delay: i * 0.18,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
