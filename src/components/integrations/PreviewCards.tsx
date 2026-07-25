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
  Share2,
  Sparkles,
  Users2,
  Table2,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { type ToolIntegration } from "../../lib/agent-capabilities";
import { BRAND } from "../../constants/brand-colors";
import "./preview-cards.css";

/** Orbit / playbook chrome — mono accent; preview thumbnails keep vendor demo colors */
const INTEGRATION_ORBIT_COLOR = BRAND.colors.primary;

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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-crm-header flex items-center gap-1.5 px-3 py-2 wl-preview-micro font-semibold text-white">
        <Database size={10} /> Opportunity Created
      </div>
      <div className="wl-preview-body p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="wl-preview-crm-avatar w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white">
            AC
          </div>
          <div>
            <div className="text-xs text-white font-medium">Acme Corporation</div>
            <div className="wl-preview-micro wl-preview-muted">John Smith · (555) 234-5678</div>
          </div>
        </div>

        {/* Animated pipeline stages */}
        <div className="flex items-center gap-0.5">
          {stages.map((s, i) => (
            <div key={s} className="flex items-center gap-0.5 flex-1">
              <div
                className="wl-preview-crm-stage wl-preview-micro px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
                data-lit={i <= stage ? "true" : "false"}
                data-current={i === stage ? "true" : "false"}
              >
                {s}
              </div>
              {i < stages.length - 1 && (
                <div
                  className="wl-preview-crm-connector h-px flex-1"
                  data-lit={i < stage ? "true" : "false"}
                />
              )}
            </div>
          ))}
        </div>

        <div className="wl-preview-micro wl-preview-muted">
          Deal value: <span className="text-white font-medium">$4,800</span> · Stage moved to{" "}
          <span className="wl-preview-crm-accent">Qualified</span>
        </div>
      </div>
    </div>
  );
}

export function XPreviewCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 350);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-x-header flex items-center gap-2 px-3 py-2 wl-preview-micro font-semibold">
        <span>@wireline</span>
        <span className="wl-preview-x-muted">· just now</span>
      </div>
      <div className="wl-preview-x-body p-3 space-y-2">
        <div className="wl-preview-fade-up" data-visible={visible ? "true" : "false"}>
          <div className="text-[var(--wireline-typography-overline-size)] leading-relaxed wl-preview-x-text">
            Thanks for calling in — we&apos;ll follow up with your quote by end of day. 🎯
          </div>
          <div className="flex items-center gap-3 mt-2 wl-preview-micro wl-preview-x-meta">
            <span>♡ 12</span>
            <span>↻ 3</span>
            <span>💬 2</span>
          </div>
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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-slack-header flex items-center gap-2 px-3 py-2 wl-preview-micro font-semibold">
        <span className="wl-preview-slack-hash">#</span> hot-leads
      </div>
      <div className="wl-preview-slack-body p-3 space-y-1.5">
        <div
          className="wl-preview-fade-up flex items-start gap-2"
          data-visible={visible ? "true" : "false"}
        >
          <div className="wl-preview-orbit-accent w-7 h-7 rounded-md shrink-0 flex items-center justify-center wl-preview-micro font-bold text-white mt-0.5">
            W
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[var(--wireline-typography-overline-size)] font-semibold wl-preview-slack-name">
                Wireline Agent
              </span>
              <span className="wl-preview-micro wl-preview-muted-35">just now</span>
            </div>
            <div className="text-[var(--wireline-typography-overline-size)] leading-relaxed wl-preview-slack-message">
              🔥 <strong>Qualified lead:</strong> Jennifer Park, ACME Corp
              <br />
              <span className="wl-preview-slack-quote">
                &quot;Interested in the Business plan&quot;
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              {["👀 1", "⚡ 2"].map((r) => (
                <span
                  key={r}
                  className="wl-preview-slack-reaction wl-preview-micro px-1.5 py-0.5 rounded"
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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-sms-header flex items-center justify-center py-2 wl-preview-micro font-medium">
        Wireline · (630) 581-1834
      </div>
      <div className="wl-preview-sms-body px-3 py-3 space-y-2">
        {/* Typing indicator */}
        {phase === "typing" && (
          <div className="flex justify-end">
            <div className="wl-preview-sms-bubble-out flex gap-1 items-center px-3.5 py-2.5 rounded-md rounded-tr-sm">
              {[0, 1, 2].map((i) => (
                <div key={i} className="wl-preview-typing-dot w-1.5 h-1.5 rounded-full bg-white" />
              ))}
            </div>
          </div>
        )}

        {/* Bot message */}
        {(phase === "sent" || phase === "replied") && (
          <div className="flex justify-end wl-preview-appear-up">
            <div className="wl-preview-sms-bubble-out max-w-[80%] px-3 py-2 rounded-md rounded-tr-sm text-[var(--wireline-typography-overline-size)] text-white leading-relaxed">
              Thanks for calling! Here's your booking confirmation: trywireline.com/b/4x9z
            </div>
          </div>
        )}
        {(phase === "sent" || phase === "replied") && (
          <div className="flex items-center justify-end gap-1 wl-preview-appear-up-delayed">
            <span className="wl-preview-micro wl-preview-sms-delivered">Delivered</span>
          </div>
        )}

        {/* Customer reply */}
        {phase === "replied" && (
          <div className="flex justify-start wl-preview-appear-up">
            <div className="wl-preview-sms-bubble-in max-w-[75%] px-3 py-2 rounded-md rounded-tl-sm text-[var(--wireline-typography-overline-size)] leading-relaxed">
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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-zoom-header flex items-center gap-1.5 px-3 py-2 wl-preview-micro font-semibold text-white">
        <Video size={10} /> Meeting Created
      </div>
      <div className="wl-preview-body p-3 space-y-2">
        <div className="text-xs text-white font-medium">Product Demo — Acme Corp</div>
        <div className="wl-preview-micro wl-preview-muted">Tomorrow, 2:00 PM CST · 45 min</div>
        <div className="wl-preview-zoom-link-box flex items-center gap-2 px-2.5 py-2 rounded-md wl-preview-micro">
          <Video size={12} className="wl-preview-zoom-accent" />
          <span className="wl-preview-zoom-accent">zoom.us/j/928473021</span>
        </div>
        <div className="wl-preview-micro wl-preview-muted-40">
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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-cal-header flex items-center gap-1.5 px-3 py-2 wl-preview-micro font-semibold text-white">
        <CalendarCheck size={10} /> Appointment Booked
      </div>
      <div className="wl-preview-body p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div
            className="wl-preview-cal-date-box w-10 h-10 rounded-md flex flex-col items-center justify-center shrink-0"
            data-confirmed={confirmed ? "true" : "false"}
          >
            <div className="wl-preview-micro font-semibold uppercase wl-preview-cal-month">JUN</div>
            <div className="text-lg font-bold leading-none text-white">17</div>
          </div>
          <div>
            <div className="text-xs text-white font-medium">Site Inspection</div>
            <div className="wl-preview-micro wl-preview-muted">10:00 – 11:00 AM · Google Meet</div>
          </div>
        </div>
        <div
          className="wl-preview-cal-status flex items-center gap-1.5 wl-preview-micro"
          data-confirmed={confirmed ? "true" : "false"}
        >
          <div
            className="wl-preview-cal-check w-4 h-4 rounded-full text-[var(--wireline-typography-overline-size)] font-bold text-white flex items-center justify-center"
            data-confirmed={confirmed ? "true" : "false"}
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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-shopify-header flex items-center justify-between px-3 py-2 wl-preview-micro font-semibold">
        <span className="flex items-center gap-1.5">
          <ShoppingBag size={10} /> Order #4821
        </span>
        <span className="wl-preview-shopify-badge px-1.5 py-0.5 rounded-full wl-preview-micro">
          Fulfilled
        </span>
      </div>
      <div className="wl-preview-body p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="wl-preview-shopify-thumb w-10 h-10 rounded-md shrink-0" />
          <div>
            <div className="text-xs text-white font-medium">Merino Wool Throw — Forest</div>
            <div className="wl-preview-micro wl-preview-muted-45">Qty 2 · $89.00 each</div>
          </div>
        </div>

        {/* Fulfillment progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between wl-preview-micro wl-preview-muted-40">
            <span>Fulfillment</span>
            <span className="wl-preview-shopify-accent">100%</span>
          </div>
          <div className="wl-preview-shopify-track h-1 rounded-full overflow-hidden">
            <div
              className="wl-preview-shopify-bar-fill h-full rounded-full"
              data-complete={progress === 100 ? "true" : "false"}
            />
          </div>
        </div>

        <div className="wl-preview-shopify-footer flex items-center justify-between wl-preview-micro pt-1 border-t">
          <span className="wl-preview-muted-45">
            Tracking: <span className="font-mono wl-preview-muted-70">1Z999AA10</span>
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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-square-header flex items-center gap-1.5 px-3 py-2 wl-preview-micro font-semibold text-white">
        <CreditCard size={10} /> Invoice Sent
      </div>
      <div className="wl-preview-body p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-white font-medium">Invoice #INV-0047</div>
            <div className="wl-preview-micro wl-preview-muted-45">Landscaping · Spring Package</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-white">$650.00</div>
            <div className="wl-preview-micro wl-preview-muted-40">Due May 28</div>
          </div>
        </div>
        <div
          className="wl-preview-square-action flex items-center gap-2 px-2.5 py-2 rounded-md wl-preview-micro font-medium"
          data-sent={sent ? "true" : "false"}
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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-docusign-header flex items-center gap-1.5 px-3 py-2 wl-preview-micro font-semibold">
        <FileText size={10} /> Contract Dispatched
      </div>
      <div className="wl-preview-body p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="wl-preview-docusign-doc-icon-box w-9 h-11 rounded flex items-center justify-center shrink-0">
            <FileText size={16} className="wl-preview-docusign-icon" />
          </div>
          <div>
            <div className="text-xs text-white font-medium">Service Agreement 2025</div>
            <div className="wl-preview-micro wl-preview-muted-45">Sent to john@acmecorp.com</div>
          </div>
        </div>
        <div className="space-y-1">
          {fields.map((field, i) => {
            const isThisSigned = signed && i === 0;
            return (
              <div
                key={field}
                className="wl-preview-docusign-field flex items-center gap-2 px-2 py-1 rounded"
                data-signed={isThisSigned ? "true" : "false"}
              >
                <div
                  className="wl-preview-docusign-dot w-2 h-2 rounded-full shrink-0"
                  data-signed={isThisSigned ? "true" : "false"}
                  data-first={i === 0 ? "true" : "false"}
                />
                <span
                  className="wl-preview-docusign-label wl-preview-micro"
                  data-signed={isThisSigned ? "true" : "false"}
                >
                  {field} field
                </span>
                {isThisSigned ? (
                  <CheckCircle2 size={9} className="wl-preview-orbit-accent-text ml-auto" />
                ) : i === 0 ? (
                  <span className="wl-preview-docusign-awaiting ml-auto wl-preview-micro">
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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-meta-header flex items-center gap-1.5 px-3 py-2 wl-preview-micro font-semibold text-white">
        <Target size={10} /> Lead Submitted to Meta CAPI
      </div>
      <div className="wl-preview-body p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="wl-preview-micro uppercase tracking-[0.25em] wl-preview-meta-label">
            Conversion Event
          </div>
          <div className="wl-preview-meta-badge wl-preview-micro px-2 py-0.5 rounded-full font-medium">
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
              <span className="wl-preview-micro wl-preview-muted-40">{label}</span>
              <span className="wl-preview-micro text-white">{val}</span>
            </div>
          ))}
        </div>
        <div
          className="wl-preview-meta-status wl-preview-micro text-center py-1.5 rounded"
          data-fired={fired ? "true" : "false"}
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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-apollo-header flex items-center gap-1.5 px-3 py-2 wl-preview-micro font-semibold text-white">
        <Search size={10} /> Lead Enriched
      </div>
      <div className="wl-preview-body p-3 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="wl-preview-apollo-avatar w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white">
            JP
          </div>
          <div>
            <div className="text-xs text-white font-medium">Jennifer Park</div>
            <div className="wl-preview-micro wl-preview-muted">VP of Operations · Acme Corp</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {fields.map(([k, v], i) => (
            <div
              key={k}
              className="wl-preview-apollo-field wl-preview-reveal-item px-2 py-1 rounded"
              data-revealed={i < revealed ? "true" : "false"}
            >
              <div className="wl-preview-micro wl-preview-muted-40">{k}</div>
              <div className="wl-preview-micro text-white font-medium truncate">{v}</div>
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
    { src: "acmecorp.com", text: "Starter from $19/mo · Pro from $79/mo…" },
    { src: "g2.com", text: "Acme Corp rated 4.7/5 — 312 reviews…" },
  ];

  return (
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-gemini-header flex items-center gap-1.5 px-3 py-2 wl-preview-micro font-semibold text-white">
        <Sparkles size={10} /> Grounded Web Search
      </div>
      <div className="wl-preview-body p-3 space-y-2">
        <div className="wl-preview-gemini-search-box flex items-center gap-2 px-2.5 py-1.5 rounded-md wl-preview-micro">
          <Search size={10} className="wl-preview-gemini-search-icon" />
          <span className="wl-preview-gemini-search-text">
            &quot;Acme Corp pricing page 2025&quot;
          </span>
        </div>
        <div className="space-y-2">
          {results.map(({ src, text }, i) => (
            <div
              key={src}
              className="wl-preview-gemini-result flex gap-2 px-2 py-1.5 rounded"
              data-visible={showResults ? "true" : "false"}
              data-stagger={String(i)}
            >
              <div className="wl-preview-gemini-result-icon w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center text-[var(--wireline-typography-overline-size)] font-bold text-white">
                G
              </div>
              <div>
                <div className="wl-preview-micro wl-preview-gemini-result-src">{src}</div>
                <div className="wl-preview-micro wl-preview-gemini-result-text">{text}</div>
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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-teams-header flex items-center gap-1.5 px-3 py-2 wl-preview-micro font-semibold text-white">
        <Users2 size={10} /> Teams Alert Sent
      </div>
      <div className="wl-preview-body wl-preview-teams-body p-3 space-y-2">
        <div className="flex items-center gap-1.5 mb-1">
          <div className="wl-preview-teams-channel wl-preview-micro px-1.5 py-0.5 rounded">
            # sales-alerts
          </div>
        </div>
        <div
          className="wl-preview-fade-up flex items-start gap-2"
          data-visible={visible ? "true" : "false"}
        >
          <div className="wl-preview-orbit-accent w-7 h-7 rounded shrink-0 flex items-center justify-center wl-preview-micro font-bold text-white mt-0.5">
            W
          </div>
          <div>
            <div className="wl-preview-micro font-semibold text-white">
              Wireline Bot{" "}
              <span className="wl-preview-micro font-normal wl-preview-muted-35">just now</span>
            </div>
            <div className="wl-preview-teams-card mt-1 px-2.5 py-2 rounded wl-preview-micro leading-relaxed">
              <div className="font-semibold text-white mb-0.5">Compliance flag raised</div>
              <div className="wl-preview-teams-card-body">
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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-excel-header flex items-center gap-1.5 px-3 py-2 wl-preview-micro font-semibold text-white">
        <Table2 size={10} /> Row Appended to Log
      </div>
      <div className="wl-preview-body overflow-x-auto">
        <table className="w-full wl-preview-micro border-collapse">
          <thead>
            <tr className="wl-preview-excel-thead">
              {["Timestamp", "Caller", "Outcome", "Duration"].map((h) => (
                <th
                  key={h}
                  className="wl-preview-excel-th px-2 py-1 text-left font-semibold whitespace-nowrap"
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
                className="wl-preview-excel-row"
                data-new-row={i === 0 ? "true" : "false"}
                data-highlight={i === 0 && highlightNew ? "true" : "false"}
              >
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="wl-preview-excel-cell px-2 py-1.5 whitespace-nowrap"
                    data-primary={i === 0 ? "true" : "false"}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="wl-preview-excel-footer px-3 py-1.5 wl-preview-micro">
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
    <div className="wl-integration-preview-card rounded-md overflow-hidden text-left">
      <div className="wl-preview-sheets-header flex items-center gap-1.5 px-3 py-2 wl-preview-micro font-semibold text-white">
        <Table2 size={10} /> Row Appended to Sheet
      </div>
      <div className="wl-preview-body overflow-x-auto">
        <table className="w-full wl-preview-micro border-collapse">
          <thead>
            <tr className="wl-preview-sheets-thead">
              {["Timestamp", "Caller", "Outcome", "Duration"].map((h) => (
                <th
                  key={h}
                  className="wl-preview-sheets-th px-2 py-1 text-left font-semibold whitespace-nowrap"
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
                className="wl-preview-sheets-row"
                data-new-row={i === 0 ? "true" : "false"}
                data-highlight={i === 0 && highlightNew ? "true" : "false"}
              >
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="wl-preview-sheets-cell px-2 py-1.5 whitespace-nowrap"
                    data-primary={i === 0 ? "true" : "false"}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="wl-preview-sheets-footer px-3 py-1.5 wl-preview-micro">
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
    color: INTEGRATION_ORBIT_COLOR,
    Icon: Database,
    tagline: "Create contacts, log calls, and update pipeline stages in real-time",
    PreviewCard: CRMPreviewCard,
  },
  {
    key: "slack",
    label: "Slack",
    color: INTEGRATION_ORBIT_COLOR,
    Icon: MessageSquare,
    tagline: "Notify your team the instant something important happens on a call",
    PreviewCard: SlackPreviewCard,
  },
  {
    key: "x",
    label: "X",
    color: INTEGRATION_ORBIT_COLOR,
    Icon: Share2,
    tagline: "Post, reply, like, repost, DM, and triage @mentions from connected accounts",
    PreviewCard: XPreviewCard,
  },
  {
    key: "twilio",
    label: "SMS",
    color: INTEGRATION_ORBIT_COLOR,
    Icon: MessageCircle,
    tagline: "Send text follow-ups and validate phone numbers mid-call",
    PreviewCard: SMSPreviewCard,
  },
  {
    key: "zoom",
    label: "Zoom",
    color: INTEGRATION_ORBIT_COLOR,
    Icon: Video,
    tagline: "Generate meeting links and attach them to calendar bookings",
    PreviewCard: ZoomPreviewCard,
  },
  {
    key: "calendar",
    label: "Calendar",
    color: INTEGRATION_ORBIT_COLOR,
    Icon: CalendarCheck,
    tagline: "Check live availability and book appointments in real-time",
    PreviewCard: CalendarPreviewCard,
  },
  {
    key: "shopify",
    label: "Shopify",
    color: INTEGRATION_ORBIT_COLOR,
    Icon: ShoppingBag,
    tagline: "Look up orders, manage returns, apply discounts, and draft orders",
    PreviewCard: ShopifyPreviewCard,
  },
  {
    key: "square",
    label: "Square",
    color: INTEGRATION_ORBIT_COLOR,
    Icon: CreditCard,
    tagline: "Look up orders, create payment links, and send invoices",
    PreviewCard: SquarePreviewCard,
  },
  {
    key: "docusign",
    label: "DocuSign",
    color: INTEGRATION_ORBIT_COLOR,
    Icon: FileText,
    tagline: "Dispatch contracts and collect e-signatures the moment a deal closes",
    PreviewCard: DocuSignPreviewCard,
  },
  {
    key: "meta",
    label: "Meta",
    color: INTEGRATION_ORBIT_COLOR,
    Icon: Target,
    tagline: "Submit qualified leads to Meta CAPI for accurate ad attribution",
    PreviewCard: MetaPreviewCard,
  },
  {
    key: "apollo",
    label: "Apollo",
    color: INTEGRATION_ORBIT_COLOR,
    Icon: Search,
    tagline: "Enrich any caller with LinkedIn profile, title, and company revenue",
    PreviewCard: ApolloPreviewCard,
  },
  {
    key: "microsoft_teams",
    label: "Teams",
    color: INTEGRATION_ORBIT_COLOR,
    Icon: Users2,
    tagline: "Post important updates to your Microsoft Teams channel",
    PreviewCard: TeamsPreviewCard,
  },
  {
    key: "microsoft_excel",
    label: "Excel",
    color: INTEGRATION_ORBIT_COLOR,
    Icon: Table2,
    tagline: "Append call summaries to your Wireline log spreadsheet in OneDrive",
    PreviewCard: ExcelPreviewCard,
  },
  {
    key: "google_sheets",
    label: "Google Sheets",
    color: INTEGRATION_ORBIT_COLOR,
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
    x: [
      { text: "Posted follow-up tweet after qualified call", time: "3 calls ago" },
      { text: "Replied to @mention on product question", time: "Yesterday" },
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
  if (key === "twilio") return true;
  if (key === "calendar") return !!(status.google?.connected || status.microsoft?.connected);
  if (key === "crm") return !!(status.hubspot?.connected || status.salesforce?.connected);
  if (key === "microsoft_teams" || key === "microsoft_excel") return !!status.microsoft?.connected;
  return !!status[key]?.connected;
}
