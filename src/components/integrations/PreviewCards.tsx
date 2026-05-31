import React, { useState, useEffect } from "react";
import {
  Database,
  MessageSquare,
  MessageCircle,
  Video,
  CalendarCheck,
  ShoppingBag,
  CreditCard,
  FileText,
  Target,
  Search,
  Sparkles,
  Users2,
  Table2,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { type ToolIntegration } from "../../lib/agent-capabilities";

// ── Animated Preview Cards ────────────────────────────────────────────────────

export function CRMPreviewCard() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 500);
    const t2 = setTimeout(() => setStage(2), 1100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const stages = ["New", "Qualified", "Proposal", "Won"];

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-white"
        style={{ background: "#FF7A59" }}
      >
        <Database size={10} /> Opportunity Created
      </div>
      <div className="p-3 space-y-2.5" style={{ background: "#1C0F33" }}>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
            style={{ background: "#FF7A59" }}
          >
            AC
          </div>
          <div>
            <div className="text-xs text-white font-medium">Acme Corporation</div>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              John Smith · (555) 234-5678
            </div>
          </div>
        </div>

        {/* Animated pipeline stages */}
        <div className="flex items-center gap-0.5">
          {stages.map((s, i) => (
            <div key={s} className="flex items-center gap-0.5 flex-1">
              <div
                className="text-[8px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap transition-all duration-500"
                style={{
                  background: i <= stage ? "#FF7A59" : "rgba(255,255,255,0.08)",
                  color: i <= stage ? "#fff" : "rgba(255,255,255,0.3)",
                  transform: i === stage ? "scale(1.08)" : "scale(1)",
                  boxShadow: i === stage ? "0 0 8px rgba(255,122,89,0.65)" : "none",
                }}
              >
                {s}
              </div>
              {i < stages.length - 1 && (
                <div
                  className="h-px flex-1 transition-all duration-500"
                  style={{ background: i < stage ? "#FF7A59" : "rgba(255,255,255,0.1)" }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
          Deal value: <span className="text-white font-medium">$4,800</span> · Stage moved to{" "}
          <span style={{ color: "#FF7A59" }}>Qualified</span>
        </div>
      </div>
    </div>
  );
}

export function SlackPreviewCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 350);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-2 px-3 py-2 text-[10px] font-semibold"
        style={{ background: "#1A1D21", color: "#E8E8E8" }}
      >
        <span style={{ color: "#36C5F0" }}>#</span> hot-leads
      </div>
      <div className="p-3 space-y-1.5" style={{ background: "#222529", minHeight: 72 }}>
        <div
          className="flex items-start gap-2 transition-all duration-400"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(6px)",
          }}
        >
          <div
            className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[9px] font-bold text-white mt-0.5"
            style={{ background: "#7C3AED" }}
          >
            W
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold" style={{ color: "#E8E8E8" }}>
                Wireline Agent
              </span>
              <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                just now
              </span>
            </div>
            <div className="text-[11px] leading-relaxed" style={{ color: "#C9C9C9" }}>
              🔥 <strong>Qualified lead:</strong> Jennifer Park, ACME Corp
              <br />
              <span style={{ color: "rgba(255,255,255,0.5)" }}>"Interested in the Pro plan"</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              {["👀 1", "⚡ 2"].map((r) => (
                <span
                  key={r}
                  className="text-[9px] px-1.5 py-0.5 rounded border"
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.6)",
                  }}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SMSPreviewCard() {
  const [phase, setPhase] = useState<"typing" | "sent" | "replied">("typing");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("sent"), 900);
    const t2 = setTimeout(() => setPhase("replied"), 1700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center justify-center py-2 text-[10px] font-medium"
        style={{ background: "#1C1C1E", color: "rgba(255,255,255,0.5)" }}
      >
        Wireline · (630) 581-1834
      </div>
      <div className="px-3 py-3 space-y-2" style={{ background: "#F2F2F7", minHeight: 90 }}>
        {/* Typing indicator */}
        {phase === "typing" && (
          <div className="flex justify-end">
            <div
              className="flex gap-1 items-center px-3.5 py-2.5 rounded-2xl rounded-tr-sm"
              style={{ background: "#007AFF" }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[#FFFFFF]"
                  style={{ animation: `typing-dot-bounce 1.2s ease-in-out ${i * 0.18}s infinite` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Bot message */}
        {(phase === "sent" || phase === "replied") && (
          <div className="flex justify-end" style={{ animation: "appear-up 0.28s ease-out" }}>
            <div
              className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm text-[11px] text-white leading-relaxed"
              style={{ background: "#007AFF" }}
            >
              Thanks for calling! Here's your booking confirmation: trywireline.com/b/4x9z
            </div>
          </div>
        )}
        {(phase === "sent" || phase === "replied") && (
          <div
            className="flex items-center justify-end gap-1"
            style={{ animation: "appear-up 0.28s ease-out 0.1s both" }}
          >
            <span className="text-[9px]" style={{ color: "rgba(0,0,0,0.4)" }}>
              Delivered
            </span>
          </div>
        )}

        {/* Customer reply */}
        {phase === "replied" && (
          <div className="flex justify-start" style={{ animation: "appear-up 0.28s ease-out" }}>
            <div
              className="max-w-[75%] px-3 py-2 rounded-2xl rounded-tl-sm text-[11px] leading-relaxed"
              style={{ background: "#E5E5EA", color: "#1C1C1E" }}
            >
              Got it, thanks! 👍
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ZoomPreviewCard() {
  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-white"
        style={{ background: "#2D8CFF" }}
      >
        <Video size={10} /> Meeting Created
      </div>
      <div className="p-3 space-y-2" style={{ background: "#1C0F33" }}>
        <div className="text-xs text-white font-medium">Product Demo — Acme Corp</div>
        <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
          Tomorrow, 2:00 PM CST · 45 min
        </div>
        <div
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[10px]"
          style={{ border: "1px solid rgba(45,140,255,0.3)", background: "rgba(45,140,255,0.1)" }}
        >
          <Video size={12} style={{ color: "#2D8CFF" }} />
          <span style={{ color: "#2D8CFF" }}>zoom.us/j/928473021</span>
        </div>
        <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          Link sent to caller via SMS &amp; email
        </div>
      </div>
    </div>
  );
}

export function CalendarPreviewCard() {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setConfirmed(true), 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-white"
        style={{ background: "#34A853" }}
      >
        <CalendarCheck size={10} /> Appointment Booked
      </div>
      <div className="p-3 space-y-2" style={{ background: "#1C0F33" }}>
        <div className="flex items-center gap-2">
          <div
            className="w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 transition-all duration-500"
            style={{
              background: confirmed ? "rgba(52,168,83,0.2)" : "rgba(52,168,83,0.1)",
              border: `1px solid ${confirmed ? "rgba(52,168,83,0.5)" : "rgba(52,168,83,0.25)"}`,
              boxShadow: confirmed ? "0 0 12px rgba(52,168,83,0.35)" : "none",
            }}
          >
            <div className="text-[8px] font-semibold uppercase" style={{ color: "#34A853" }}>
              JUN
            </div>
            <div className="text-lg font-bold leading-none text-white">17</div>
          </div>
          <div>
            <div className="text-xs text-white font-medium">Site Inspection</div>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              10:00 – 11:00 AM · Google Meet
            </div>
          </div>
        </div>
        <div
          className="flex items-center gap-1.5 text-[10px] transition-all duration-500"
          style={{ color: confirmed ? "rgba(52,168,83,0.9)" : "rgba(255,255,255,0.45)" }}
        >
          <div
            className="w-4 h-4 rounded-full text-[7px] font-bold text-white flex items-center justify-center transition-all duration-500"
            style={{ background: confirmed ? "#34A853" : "rgba(52,168,83,0.4)" }}
          >
            ✓
          </div>
          Confirmed · invite sent to client
        </div>
      </div>
    </div>
  );
}

export function ShopifyPreviewCard() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setProgress(100), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center justify-between px-3 py-2 text-[10px] font-semibold"
        style={{ background: "#1A1A1A", color: "#96BF48" }}
      >
        <span className="flex items-center gap-1.5">
          <ShoppingBag size={10} /> Order #4821
        </span>
        <span
          className="px-1.5 py-0.5 rounded-full text-[8px]"
          style={{ background: "rgba(150,191,72,0.15)", color: "#96BF48" }}
        >
          Fulfilled
        </span>
      </div>
      <div className="p-3 space-y-2" style={{ background: "#1C0F33" }}>
        <div className="flex items-center gap-2">
          <div
            className="w-10 h-10 rounded-lg shrink-0"
            style={{ background: "rgba(150,191,72,0.1)", border: "1px solid rgba(150,191,72,0.2)" }}
          />
          <div>
            <div className="text-xs text-white font-medium">Merino Wool Throw — Forest</div>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>
              Qty 2 · $89.00 each
            </div>
          </div>
        </div>

        {/* Fulfillment progress bar */}
        <div className="space-y-1">
          <div
            className="flex justify-between text-[9px]"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            <span>Fulfillment</span>
            <span style={{ color: "#96BF48" }}>100%</span>
          </div>
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #96BF48, #b5d96a)",
                boxShadow: "0 0 6px rgba(150,191,72,0.5)",
              }}
            />
          </div>
        </div>

        <div
          className="flex items-center justify-between text-[10px] pt-1 border-t"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <span style={{ color: "rgba(255,255,255,0.45)" }}>
            Tracking:{" "}
            <span className="font-mono" style={{ color: "rgba(255,255,255,0.7)" }}>
              1Z999AA10
            </span>
          </span>
          <span className="font-medium text-white">$178.00</span>
        </div>
      </div>
    </div>
  );
}

export function SquarePreviewCard() {
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSent(true), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-white"
        style={{ background: "#3E4348" }}
      >
        <CreditCard size={10} /> Invoice Sent
      </div>
      <div className="p-3 space-y-2.5" style={{ background: "#1C0F33" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-white font-medium">Invoice #INV-0047</div>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>
              Landscaping · Spring Package
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-white">$650.00</div>
            <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Due May 28
            </div>
          </div>
        </div>
        <div
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[10px] font-medium transition-all duration-500"
          style={{
            background: sent ? "#00A2E8" : "rgba(0,162,232,0.2)",
            color: "#fff",
          }}
        >
          {sent ? <CheckCircle2 size={11} /> : <CreditCard size={11} />}
          {sent ? "Sent to mike@example.com via Square" : "Preparing invoice…"}
        </div>
      </div>
    </div>
  );
}

export function DocuSignPreviewCard() {
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSigned(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const fields = ["Signature", "Date", "Initials"];

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold"
        style={{ background: "#FFC720", color: "#1a1a1a" }}
      >
        <FileText size={10} /> Contract Dispatched
      </div>
      <div className="p-3 space-y-2.5" style={{ background: "#1C0F33" }}>
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-11 rounded flex items-center justify-center shrink-0"
            style={{
              background: "rgba(255,199,32,0.12)",
              border: "1px solid rgba(255,199,32,0.25)",
            }}
          >
            <FileText size={16} style={{ color: "#FFC720" }} />
          </div>
          <div>
            <div className="text-xs text-white font-medium">Service Agreement 2025</div>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>
              Sent to john@acmecorp.com
            </div>
          </div>
        </div>
        <div className="space-y-1">
          {fields.map((field, i) => {
            const isThisSigned = signed && i === 0;
            return (
              <div
                key={field}
                className="flex items-center gap-2 px-2 py-1 rounded transition-all duration-600"
                style={{
                  background: isThisSigned ? "rgba(124,58,237,0.08)" : "rgba(255,199,32,0.06)",
                  border: `1px solid ${isThisSigned ? "rgba(124,58,237,0.25)" : "rgba(255,199,32,0.15)"}`,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0 transition-all duration-500"
                  style={{
                    background: isThisSigned
                      ? "#7C3AED"
                      : i === 0
                        ? "#FFC720"
                        : "rgba(255,199,32,0.3)",
                  }}
                />
                <span
                  className="text-[9px] transition-colors duration-500"
                  style={{
                    color: isThisSigned ? "rgba(124,58,237,0.85)" : "rgba(255,255,255,0.55)",
                  }}
                >
                  {field} field
                </span>
                {isThisSigned ? (
                  <CheckCircle2 size={9} style={{ color: "#7C3AED", marginLeft: "auto" }} />
                ) : i === 0 ? (
                  <span className="ml-auto text-[8px]" style={{ color: "#FFC720" }}>
                    Awaiting
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MetaPreviewCard() {
  const [fired, setFired] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFired(true), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-white"
        style={{ background: "#1877F2" }}
      >
        <Target size={10} /> Lead Submitted to Meta CAPI
      </div>
      <div className="p-3 space-y-2" style={{ background: "#1C0F33" }}>
        <div className="flex items-center justify-between">
          <div
            className="text-[9px] uppercase tracking-[0.25em]"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            Conversion Event
          </div>
          <div
            className="text-[8px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: "rgba(24,119,242,0.2)", color: "#1877F2" }}
          >
            Lead
          </div>
        </div>
        <div className="space-y-1.5">
          {[
            ["Name", "Jennifer Park"],
            ["Email", "j.park@acme.com"],
            ["Phone", "+1 (555) 234-5678"],
            ["Campaign", "Spring Outreach"],
          ].map(([label, val]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {label}
              </span>
              <span className="text-[10px] text-white">{val}</span>
            </div>
          ))}
        </div>
        <div
          className="text-[9px] text-center py-1.5 rounded transition-all duration-500"
          style={{
            background: fired ? "rgba(24,119,242,0.2)" : "rgba(24,119,242,0.08)",
            color: fired ? "#1877F2" : "rgba(24,119,242,0.6)",
            boxShadow: fired ? "0 0 8px rgba(24,119,242,0.3)" : "none",
          }}
        >
          {fired ? "✓ Server-side event fired · deduplication enabled" : "Sending event…"}
        </div>
      </div>
    </div>
  );
}

export function ApolloPreviewCard() {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setRevealed(1), 300),
      setTimeout(() => setRevealed(2), 600),
      setTimeout(() => setRevealed(3), 900),
      setTimeout(() => setRevealed(4), 1200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const fields: [string, string][] = [
    ["Company", "Acme Corp"],
    ["Employees", "250–500"],
    ["Revenue", "$40M–$100M"],
    ["LinkedIn", "linkedin.com/in/…"],
  ];

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-white"
        style={{ background: "#8B5CF6" }}
      >
        <Search size={10} /> Lead Enriched
      </div>
      <div className="p-3 space-y-2" style={{ background: "#1C0F33" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #6D28D9)" }}
          >
            JP
          </div>
          <div>
            <div className="text-xs text-white font-medium">Jennifer Park</div>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              VP of Operations · Acme Corp
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {fields.map(([k, v], i) => (
            <div
              key={k}
              className="px-2 py-1 rounded transition-all duration-300"
              style={{
                background: "rgba(139,92,246,0.08)",
                border: "1px solid rgba(139,92,246,0.15)",
                opacity: i < revealed ? 1 : 0,
                transform: i < revealed ? "translateY(0)" : "translateY(4px)",
              }}
            >
              <div className="text-[8px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {k}
              </div>
              <div className="text-[9px] text-white font-medium truncate">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GeminiPreviewCard() {
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowResults(true), 700);
    return () => clearTimeout(t);
  }, []);

  const results = [
    { src: "acmecorp.com", text: "Starter from $49/mo · Pro from $199/mo…" },
    { src: "g2.com", text: "Acme Corp rated 4.7/5 — 312 reviews…" },
  ];

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-white"
        style={{ background: "linear-gradient(90deg, #4285F4, #9B72CB)" }}
      >
        <Sparkles size={10} /> Grounded Web Search
      </div>
      <div className="p-3 space-y-2" style={{ background: "#1C0F33" }}>
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px]"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Search size={10} style={{ color: "rgba(255,255,255,0.35)" }} />
          <span style={{ color: "rgba(255,255,255,0.6)" }}>"Acme Corp pricing page 2025"</span>
        </div>
        <div className="space-y-2">
          {results.map(({ src, text }, i) => (
            <div
              key={src}
              className="flex gap-2 px-2 py-1.5 rounded transition-all duration-400"
              style={{
                background: "rgba(66,133,244,0.06)",
                opacity: showResults ? 1 : 0,
                transform: showResults ? "translateY(0)" : "translateY(5px)",
                transitionDelay: `${i * 150}ms`,
              }}
            >
              <div
                className="w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center text-[7px] font-bold text-white"
                style={{ background: "#4285F4" }}
              >
                G
              </div>
              <div>
                <div className="text-[9px]" style={{ color: "#4285F4" }}>
                  {src}
                </div>
                <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>
                  {text}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TeamsPreviewCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-white"
        style={{ background: "#6264A7" }}
      >
        <Users2 size={10} /> Teams Alert Sent
      </div>
      <div className="p-3 space-y-2" style={{ background: "#1C0F33", minHeight: 72 }}>
        <div className="flex items-center gap-1.5 mb-1">
          <div
            className="text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(98,100,167,0.25)", color: "#9396D0" }}
          >
            # sales-alerts
          </div>
        </div>
        <div
          className="flex items-start gap-2 transition-all duration-400"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(6px)",
          }}
        >
          <div
            className="w-7 h-7 rounded shrink-0 flex items-center justify-center text-[9px] font-bold text-white mt-0.5"
            style={{ background: "#7C3AED" }}
          >
            W
          </div>
          <div>
            <div className="text-[10px] font-semibold text-white">
              Wireline Bot{" "}
              <span className="text-[8px] font-normal" style={{ color: "rgba(255,255,255,0.35)" }}>
                just now
              </span>
            </div>
            <div
              className="mt-1 px-2.5 py-2 rounded text-[10px] leading-relaxed"
              style={{
                background: "rgba(98,100,167,0.15)",
                border: "1px solid rgba(98,100,167,0.25)",
              }}
            >
              <div className="font-semibold text-white mb-0.5">Compliance flag raised</div>
              <div style={{ color: "rgba(255,255,255,0.6)" }}>
                Agent Sarah escalated — caller requested DNC removal. Review required.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExcelPreviewCard() {
  const [highlightNew, setHighlightNew] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setHighlightNew(false), 1500);
    return () => clearTimeout(t);
  }, []);

  const rows: [string, string, string, string][] = [
    ["10:42 AM", "(555) 234-5678", "Qualified", "4m 12s"],
    ["11:05 AM", "(555) 876-4321", "Booked", "6m 38s"],
  ];

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-white"
        style={{ background: "#217346" }}
      >
        <Table2 size={10} /> Row Appended to Log
      </div>
      <div className="overflow-x-auto" style={{ background: "#1C0F33" }}>
        <table className="w-full text-[9px] border-collapse">
          <thead>
            <tr style={{ background: "rgba(33,115,70,0.25)" }}>
              {["Timestamp", "Caller", "Outcome", "Duration"].map((h) => (
                <th
                  key={h}
                  className="px-2 py-1 text-left font-semibold whitespace-nowrap"
                  style={{ color: "#8B6FA8", borderBottom: "1px solid rgba(33,115,70,0.3)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="transition-all duration-700"
                style={{
                  background:
                    i === 0 && highlightNew
                      ? "rgba(33,115,70,0.25)"
                      : i === 0
                        ? "rgba(33,115,70,0.1)"
                        : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="px-2 py-1.5 whitespace-nowrap"
                    style={{ color: i === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)" }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div
          className="px-3 py-1.5 text-[9px]"
          style={{ color: "rgba(255,255,255,0.3)", borderTop: "1px solid rgba(255,255,255,0.04)" }}
        >
          Wireline Call Log · OneDrive · Sheet1
        </div>
      </div>
    </div>
  );
}

export function SheetsPreviewCard() {
  const [highlightNew, setHighlightNew] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setHighlightNew(false), 1500);
    return () => clearTimeout(t);
  }, []);

  const rows: [string, string, string, string][] = [
    ["10:42 AM", "(555) 234-5678", "Qualified", "4m 12s"],
    ["11:05 AM", "(555) 876-4321", "Booked", "6m 38s"],
  ];

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-white"
        style={{ background: "#0F9D58" }}
      >
        <Table2 size={10} /> Row Appended to Sheet
      </div>
      <div className="overflow-x-auto" style={{ background: "#1C0F33" }}>
        <table className="w-full text-[9px] border-collapse">
          <thead>
            <tr style={{ background: "rgba(15,157,88,0.25)" }}>
              {["Timestamp", "Caller", "Outcome", "Duration"].map((h) => (
                <th
                  key={h}
                  className="px-2 py-1 text-left font-semibold whitespace-nowrap"
                  style={{ color: "#8B6FA8", borderBottom: "1px solid rgba(15,157,88,0.3)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="transition-all duration-700"
                style={{
                  background:
                    i === 0 && highlightNew
                      ? "rgba(15,157,88,0.25)"
                      : i === 0
                        ? "rgba(15,157,88,0.1)"
                        : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="px-2 py-1.5 whitespace-nowrap"
                    style={{ color: i === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)" }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div
          className="px-3 py-1.5 text-[9px]"
          style={{ color: "rgba(255,255,255,0.3)", borderTop: "1px solid rgba(255,255,255,0.04)" }}
        >
          Wireline Call Log · Google Drive · Call Log
        </div>
      </div>
    </div>
  );
}

// ── Integration registry ──────────────────────────────────────────────────────

export interface IntegrationMeta {
  key: ToolIntegration;
  label: string;
  color: string;
  Icon: LucideIcon;
  tagline: string;
  PreviewCard: React.FC;
}

export const INTEGRATION_META: readonly IntegrationMeta[] = [
  {
    key: "crm",
    label: "CRM",
    color: "#FF7A59",
    Icon: Database,
    tagline: "Create contacts, log calls, and update pipeline stages in real-time",
    PreviewCard: CRMPreviewCard,
  },
  {
    key: "slack",
    label: "Slack",
    color: "#36C5F0",
    Icon: MessageSquare,
    tagline: "Notify your team the instant something important happens on a call",
    PreviewCard: SlackPreviewCard,
  },
  {
    key: "twilio",
    label: "SMS",
    color: "#F22F46",
    Icon: MessageCircle,
    tagline: "Send text follow-ups and validate phone numbers mid-call",
    PreviewCard: SMSPreviewCard,
  },
  {
    key: "zoom",
    label: "Zoom",
    color: "#2D8CFF",
    Icon: Video,
    tagline: "Generate meeting links and attach them to calendar bookings",
    PreviewCard: ZoomPreviewCard,
  },
  {
    key: "calendar",
    label: "Calendar",
    color: "#34A853",
    Icon: CalendarCheck,
    tagline: "Check live availability and book appointments in real-time",
    PreviewCard: CalendarPreviewCard,
  },
  {
    key: "shopify",
    label: "Shopify",
    color: "#96BF48",
    Icon: ShoppingBag,
    tagline: "Look up orders, manage returns, apply discounts, and draft orders",
    PreviewCard: ShopifyPreviewCard,
  },
  {
    key: "square",
    label: "Square",
    color: "#00A2E8",
    Icon: CreditCard,
    tagline: "Look up orders, create payment links, and send invoices",
    PreviewCard: SquarePreviewCard,
  },
  {
    key: "docusign",
    label: "DocuSign",
    color: "#FFC720",
    Icon: FileText,
    tagline: "Dispatch contracts and collect e-signatures the moment a deal closes",
    PreviewCard: DocuSignPreviewCard,
  },
  {
    key: "meta",
    label: "Meta",
    color: "#1877F2",
    Icon: Target,
    tagline: "Submit qualified leads to Meta CAPI for accurate ad attribution",
    PreviewCard: MetaPreviewCard,
  },
  {
    key: "apollo",
    label: "Apollo",
    color: "#8B5CF6",
    Icon: Search,
    tagline: "Enrich any caller with LinkedIn profile, title, and company revenue",
    PreviewCard: ApolloPreviewCard,
  },
  {
    key: "gemini",
    label: "Gemini",
    color: "#4285F4",
    Icon: Sparkles,
    tagline: "Look up fresh web data — pricing, hours, regulations — live on calls",
    PreviewCard: GeminiPreviewCard,
  },
  {
    key: "microsoft_teams",
    label: "Teams",
    color: "#6264A7",
    Icon: Users2,
    tagline: "Post important updates to your Microsoft Teams channel",
    PreviewCard: TeamsPreviewCard,
  },
  {
    key: "microsoft_excel",
    label: "Excel",
    color: "#217346",
    Icon: Table2,
    tagline: "Append call summaries to your Wireline log spreadsheet in OneDrive",
    PreviewCard: ExcelPreviewCard,
  },
  {
    key: "google_sheets",
    label: "Google Sheets",
    color: "#0F9D58",
    Icon: Table2,
    tagline: "Append call summaries to your Wireline log spreadsheet in Google Drive",
    PreviewCard: SheetsPreviewCard,
  },
] as const;

// ── Recent activity feed (demo content) ──────────────────────────────────────

export const ACTIVITY_LOG: Partial<Record<ToolIntegration, Array<{ text: string; time: string }>>> =
  {
    crm: [
      { text: "Created contact: Jennifer Park, Acme Corp", time: "3 calls ago" },
      { text: "Deal updated → Qualified ($4,800)", time: "7 calls ago" },
      { text: "Call outcome logged to HubSpot", time: "12 calls ago" },
    ],
    slack: [
      { text: '#hot-leads: "Qualified lead: Jennifer Park"', time: "3 calls ago" },
      { text: '#compliance: "DNC request flagged"', time: "Yesterday" },
    ],
    twilio: [
      { text: "SMS confirmation sent to (555) 234-5678", time: "3 calls ago" },
      { text: "Phone validated: (555) 876-4321 → Mobile", time: "4 calls ago" },
    ],
    zoom: [
      { text: "Meeting created: Product Demo — Acme Corp", time: "8 calls ago" },
      { text: "Meeting link sent via SMS + email", time: "8 calls ago" },
    ],
    calendar: [
      { text: "Appointment booked: Jun 17 · 10:00 AM", time: "3 calls ago" },
      { text: "Conflict check: 2 slots available Jun 18", time: "4 calls ago" },
    ],
    shopify: [
      { text: "Order #4821 status: Fulfilled", time: "5 calls ago" },
      { text: "Discount code SUMMER15 applied", time: "11 calls ago" },
    ],
    square: [
      { text: "Invoice #INV-0047 sent: $650.00", time: "2 calls ago" },
      { text: "Payment link generated for landscaping", time: "6 calls ago" },
    ],
    docusign: [
      { text: "Contract dispatched to john@acmecorp.com", time: "9 calls ago" },
      { text: "Service Agreement 2025 signed ✓", time: "2 days ago" },
    ],
    meta: [
      { text: "Lead event fired: Jennifer Park → CAPI", time: "3 calls ago" },
      { text: "Purchase event deduplicated (web + call)", time: "Yesterday" },
    ],
    apollo: [
      { text: "Enriched: Jennifer Park — VP Ops, $40M+", time: "3 calls ago" },
      { text: "Enriched: Mike Torres — Director, 500–1K", time: "5 calls ago" },
    ],
    gemini: [
      { text: 'Web search: "Acme Corp pricing 2025"', time: "3 calls ago" },
      { text: 'Web search: "OSHA regulations Illinois"', time: "6 calls ago" },
    ],
    microsoft_teams: [
      { text: "#sales-alerts: Compliance flag raised", time: "3 calls ago" },
      { text: "#hot-leads: Enterprise lead — $12K ARR", time: "Yesterday" },
    ],
    microsoft_excel: [
      { text: "Row appended: (555) 234-5678 → Qualified", time: "3 calls ago" },
      { text: "Row appended: (555) 876-4321 → Booked", time: "4 calls ago" },
    ],
    google_sheets: [
      { text: "Row appended: (555) 234-5678 → Qualified", time: "3 calls ago" },
      { text: "Row appended: (555) 876-4321 → Booked", time: "4 calls ago" },
    ],
  };

// ── Helper ────────────────────────────────────────────────────────────────────

export function resolveConnected(
  key: ToolIntegration,
  status: Record<string, { connected: boolean }> | null,
): boolean {
  if (!status) return false;
  if (key === "twilio" || key === "gemini") return true;
  if (key === "calendar") return !!(status.google?.connected || status.microsoft?.connected);
  if (key === "crm") return !!(status.hubspot?.connected || status.salesforce?.connected);
  if (key === "microsoft_teams" || key === "microsoft_excel") return !!status.microsoft?.connected;
  return !!status[key]?.connected;
}
