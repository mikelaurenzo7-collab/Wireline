import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
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
  X,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils";
import WirelineMark from "./WirelineMark";
import {
  AGENT_TOOL_CATALOG,
  type AgentToolName,
  type ToolIntegration,
} from "../lib/agent-capabilities";

// ── Preview Cards ─────────────────────────────────────────────────────────────

function CRMPreviewCard() {
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
        <div className="flex items-center gap-0.5">
          {["New", "Qualified", "Proposal", "Won"].map((s, i) => (
            <div key={s} className="flex items-center gap-0.5 flex-1">
              <div
                className="text-[8px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
                style={{
                  background: i < 2 ? "#FF7A59" : "rgba(255,255,255,0.08)",
                  color: i < 2 ? "#fff" : "rgba(255,255,255,0.3)",
                }}
              >
                {s}
              </div>
              {i < 3 && (
                <div
                  className="h-px flex-1"
                  style={{ background: i < 1 ? "#FF7A59" : "rgba(255,255,255,0.1)" }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
          Deal value:{" "}
          <span className="text-white font-medium">$4,800</span> · Stage moved to{" "}
          <span style={{ color: "#FF7A59" }}>Qualified</span>
        </div>
      </div>
    </div>
  );
}

function SlackPreviewCard() {
  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-2 px-3 py-2 text-[10px] font-semibold"
        style={{ background: "#1A1D21", color: "#E8E8E8" }}
      >
        <span style={{ color: "#36C5F0" }}>#</span> hot-leads
      </div>
      <div className="p-3 space-y-1.5" style={{ background: "#222529" }}>
        <div className="flex items-start gap-2">
          <div
            className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[9px] font-bold text-white mt-0.5"
            style={{ background: "#4F1E7B" }}
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

function SMSPreviewCard() {
  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center justify-center py-2 text-[10px] font-medium"
        style={{ background: "#1C1C1E", color: "rgba(255,255,255,0.5)" }}
      >
        Wireline · (630) 581-1834
      </div>
      <div className="px-3 py-3 space-y-2" style={{ background: "#F2F2F7" }}>
        <div className="flex justify-end">
          <div
            className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm text-[11px] text-white leading-relaxed"
            style={{ background: "#007AFF" }}
          >
            Thanks for calling! Here's your booking confirmation: wireline.app/b/4x9z
          </div>
        </div>
        <div className="flex items-center justify-end gap-1">
          <span className="text-[9px]" style={{ color: "rgba(0,0,0,0.4)" }}>
            Delivered
          </span>
        </div>
        <div className="flex justify-start">
          <div
            className="max-w-[75%] px-3 py-2 rounded-2xl rounded-tl-sm text-[11px] leading-relaxed"
            style={{ background: "#E5E5EA", color: "#1C1C1E" }}
          >
            Got it, thanks! 👍
          </div>
        </div>
      </div>
    </div>
  );
}

function ZoomPreviewCard() {
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

function CalendarPreviewCard() {
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
            className="w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0"
            style={{ background: "rgba(52,168,83,0.15)", border: "1px solid rgba(52,168,83,0.3)" }}
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
          className="flex items-center gap-1.5 text-[10px]"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          <div
            className="w-4 h-4 rounded-full text-[7px] font-bold text-white flex items-center justify-center"
            style={{ background: "#34A853" }}
          >
            ✓
          </div>
          Confirmed · invite sent to client
        </div>
      </div>
    </div>
  );
}

function ShopifyPreviewCard() {
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
        <div
          className="flex items-center justify-between text-[10px] pt-1 border-t"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <span style={{ color: "rgba(255,255,255,0.45)" }}>
            Tracking: <span className="font-mono text-white/70">1Z999AA10</span>
          </span>
          <span className="font-medium text-white">$178.00</span>
        </div>
      </div>
    </div>
  );
}

function SquarePreviewCard() {
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
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[10px] font-medium"
          style={{ background: "#00A2E8", color: "#fff" }}
        >
          <CreditCard size={11} />
          Sent to mike@example.com via Square
        </div>
      </div>
    </div>
  );
}

function DocuSignPreviewCard() {
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
            style={{ background: "rgba(255,199,32,0.12)", border: "1px solid rgba(255,199,32,0.25)" }}
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
          {["Signature", "Date", "Initials"].map((field, i) => (
            <div
              key={field}
              className="flex items-center gap-2 px-2 py-1 rounded"
              style={{ background: "rgba(255,199,32,0.06)", border: "1px solid rgba(255,199,32,0.15)" }}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: i === 0 ? "#FFC720" : "rgba(255,199,32,0.3)" }}
              />
              <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                {field} field
              </span>
              {i === 0 && (
                <span className="ml-auto text-[8px]" style={{ color: "#FFC720" }}>
                  Awaiting
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetaPreviewCard() {
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
          <div className="text-[9px] uppercase tracking-[0.25em]" style={{ color: "rgba(255,255,255,0.45)" }}>
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
          className="text-[9px] text-center py-1 rounded"
          style={{ background: "rgba(24,119,242,0.1)", color: "#1877F2" }}
        >
          Server-side event fired · deduplication enabled
        </div>
      </div>
    </div>
  );
}

function ApolloPreviewCard() {
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
          {[
            ["Company", "Acme Corp"],
            ["Employees", "250–500"],
            ["Revenue", "$40M–$100M"],
            ["LinkedIn", "linkedin.com/in/…"],
          ].map(([k, v]) => (
            <div
              key={k}
              className="px-2 py-1 rounded"
              style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)" }}
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

function GeminiPreviewCard() {
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
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Search size={10} style={{ color: "rgba(255,255,255,0.35)" }} />
          <span style={{ color: "rgba(255,255,255,0.6)" }}>
            "Acme Corp pricing page 2025"
          </span>
        </div>
        <div className="space-y-2">
          {[
            { src: "acmecorp.com", text: "Starter from $49/mo · Pro from $199/mo…" },
            { src: "g2.com", text: "Acme Corp rated 4.7/5 — 312 reviews…" },
          ].map(({ src, text }) => (
            <div
              key={src}
              className="flex gap-2 px-2 py-1.5 rounded"
              style={{ background: "rgba(66,133,244,0.06)" }}
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

function TeamsPreviewCard() {
  return (
    <div className="rounded-xl overflow-hidden border border-white/8 text-left">
      <div
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-white"
        style={{ background: "#6264A7" }}
      >
        <Users2 size={10} /> Teams Alert Sent
      </div>
      <div className="p-3 space-y-2" style={{ background: "#1C0F33" }}>
        <div className="flex items-center gap-1.5 mb-1">
          <div
            className="text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(98,100,167,0.25)", color: "#9396D0" }}
          >
            # sales-alerts
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div
            className="w-7 h-7 rounded shrink-0 flex items-center justify-center text-[9px] font-bold text-white mt-0.5"
            style={{ background: "#4F1E7B" }}
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
              style={{ background: "rgba(98,100,167,0.15)", border: "1px solid rgba(98,100,167,0.25)" }}
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

function ExcelPreviewCard() {
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
                  style={{ color: "#34D399", borderBottom: "1px solid rgba(33,115,70,0.3)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["10:42 AM", "(555) 234-5678", "Qualified", "4m 12s"],
              ["11:05 AM", "(555) 876-4321", "Booked", "6m 38s"],
            ].map((row, i) => (
              <tr
                key={i}
                style={{
                  background: i === 0 ? "rgba(33,115,70,0.1)" : "transparent",
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

// ── Integration registry ──────────────────────────────────────────────────────

interface IntegrationMeta {
  key: ToolIntegration;
  label: string;
  color: string;
  Icon: LucideIcon;
  tagline: string;
  PreviewCard: React.FC;
}

const INTEGRATION_META: readonly IntegrationMeta[] = [
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
] as const;

// ── Helper ────────────────────────────────────────────────────────────────────

function resolveConnected(
  key: ToolIntegration,
  status: Record<string, { connected: boolean }> | null,
): boolean {
  if (!status) return false;
  if (key === "twilio" || key === "gemini") return true;
  if (key === "calendar")
    return !!(status.google?.connected || status.microsoft?.connected);
  if (key === "crm")
    return !!(status.hubspot?.connected || status.salesforce?.connected);
  if (key === "microsoft_teams" || key === "microsoft_excel")
    return !!status.microsoft?.connected;
  return !!status[key]?.connected;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  agentName: string;
  agentRole: string;
  selectedToolNames: readonly AgentToolName[];
  roleDefaultTools: readonly AgentToolName[];
  usingRoleDefaults: boolean;
  integrationStatus: Record<string, { connected: boolean }> | null;
  onToggleIntegrationGroup: (integration: string, enable: boolean) => void;
  onToggleTool: (tool: AgentToolName) => void;
  onResetToDefaults: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentIntegrationCanvas({
  agentName,
  selectedToolNames,
  roleDefaultTools,
  usingRoleDefaults,
  integrationStatus,
  onToggleIntegrationGroup,
  onToggleTool,
  onResetToDefaults,
}: Props) {
  const [activeKey, setActiveKey] = useState<ToolIntegration | null>(null);

  // Pre-compute node positions in a circle (13 nodes)
  const nodes = INTEGRATION_META.map((meta, i) => {
    const angleDeg = -90 + i * (360 / INTEGRATION_META.length);
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      ...meta,
      cx: 50 + 39 * Math.cos(angleRad),
      cy: 50 + 39 * Math.sin(angleRad),
    };
  });

  const activeIntegration = INTEGRATION_META.find((m) => m.key === activeKey) ?? null;
  const activeTools = AGENT_TOOL_CATALOG.filter((t) => t.integration === activeKey);

  const getEnabledCount = (key: ToolIntegration) =>
    AGENT_TOOL_CATALOG.filter(
      (t) => t.integration === key && selectedToolNames.includes(t.name),
    ).length;

  const getTotalCount = (key: ToolIntegration) =>
    AGENT_TOOL_CATALOG.filter((t) => t.integration === key).length;

  return (
    <div className="rounded-xl glass border border-white/8 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-white/8">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <div>
            <h3 className="font-display italic lowercase text-base text-ink">
              agent capabilities
            </h3>
            <p className="text-[10px] text-muted/70 leading-relaxed">
              Tap any integration to preview what {agentName || "this agent"} can do with it
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onResetToDefaults}
          disabled={usingRoleDefaults}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/80 hover:border-brand/40 hover:text-brand transition-colors disabled:opacity-40"
        >
          <RefreshCw className="w-2.5 h-2.5" />
          Role defaults
        </button>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        <span
          className={cn(
            "px-2 py-1 rounded-full border uppercase tracking-[0.22em]",
            usingRoleDefaults
              ? "bg-brand/10 border-brand/30 text-brand"
              : "bg-white/5 border-white/10 text-muted/80",
          )}
        >
          {usingRoleDefaults ? "Role defaults" : "Custom override"}
        </span>
        <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-muted/80 uppercase tracking-[0.22em]">
          {selectedToolNames.length} tools enabled
        </span>
      </div>

      {/* ── Neural web constellation (sm+) ── */}
      <div className="hidden sm:block select-none">
        <div
          className="relative mx-auto"
          style={{ width: "100%", maxWidth: 400, aspectRatio: "1" }}
        >
          {/* SVG layer — lines */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              {nodes.map((n) => (
                <linearGradient
                  key={n.key}
                  id={`canvas-lg-${n.key}`}
                  x1={50}
                  y1={50}
                  x2={n.cx}
                  y2={n.cy}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="rgba(79,30,123,0.2)" />
                  <stop offset="100%" stopColor={n.color} stopOpacity={0.35} />
                </linearGradient>
              ))}
            </defs>
            {nodes.map((n) => {
              const enabled = getEnabledCount(n.key) > 0;
              const isActive = activeKey === n.key;
              return (
                <line
                  key={n.key}
                  x1={50}
                  y1={50}
                  x2={n.cx}
                  y2={n.cy}
                  stroke={isActive ? n.color : `url(#canvas-lg-${n.key})`}
                  strokeWidth={isActive ? 0.9 : enabled ? 0.5 : 0.25}
                  strokeOpacity={isActive ? 1 : enabled ? 0.7 : 0.3}
                  strokeDasharray={isActive ? "3 2" : undefined}
                  style={
                    isActive
                      ? { animation: "integration-flow 1.4s linear infinite" }
                      : undefined
                  }
                />
              );
            })}
          </svg>

          {/* Center agent node */}
          <div
            className="absolute z-10"
            style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
          >
            <div className="relative flex items-center justify-center">
              {/* Outer pulse ring */}
              <div
                className="absolute w-14 h-14 rounded-full"
                style={{
                  background: "rgba(79,30,123,0.25)",
                  animation: "agent-pulse 3s ease-in-out infinite",
                }}
                aria-hidden="true"
              />
              {/* Inner shell */}
              <div
                className="relative w-10 h-10 rounded-full flex items-center justify-center z-10"
                style={{
                  background:
                    "radial-gradient(circle at 35% 35%, rgba(79,30,123,0.9), rgba(30,0,48,0.95))",
                  border: "1.5px solid rgba(239,233,220,0.25)",
                  boxShadow: "0 0 16px rgba(79,30,123,0.5)",
                }}
              >
                <WirelineMark className="w-5 h-5 text-paper" strokeWidth={90} />
              </div>
            </div>
          </div>

          {/* Integration nodes */}
          {nodes.map((n) => {
            const enabledCount = getEnabledCount(n.key);
            const connected = resolveConnected(n.key, integrationStatus);
            const isActive = activeKey === n.key;
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => setActiveKey(isActive ? null : n.key)}
                aria-pressed={isActive}
                aria-label={`${n.label} integration — ${enabledCount} tools enabled`}
                className="absolute flex flex-col items-center gap-1 transition-transform duration-150"
                style={{
                  left: `${n.cx}%`,
                  top: `${n.cy}%`,
                  transform: `translate(-50%, -50%) scale(${isActive ? 1.12 : 1})`,
                  zIndex: isActive ? 20 : 10,
                }}
              >
                <div
                  className="w-9 h-9 rounded-2xl flex items-center justify-center transition-all duration-150"
                  style={{
                    background: isActive
                      ? `${n.color}22`
                      : enabledCount > 0
                        ? `${n.color}12`
                        : "rgba(0,0,0,0.35)",
                    border: `1.5px solid ${
                      isActive
                        ? n.color
                        : enabledCount > 0
                          ? `${n.color}55`
                          : "rgba(255,255,255,0.1)"
                    }`,
                    boxShadow: isActive ? `0 0 12px ${n.color}40` : undefined,
                  }}
                >
                  <n.Icon
                    style={{
                      width: 16,
                      height: 16,
                      color: isActive
                        ? n.color
                        : enabledCount > 0
                          ? n.color
                          : "rgba(255,255,255,0.28)",
                    }}
                  />
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className="text-[8px] font-medium leading-none"
                    style={{
                      color: isActive
                        ? n.color
                        : enabledCount > 0
                          ? "rgba(239,233,220,0.85)"
                          : "rgba(239,233,220,0.32)",
                    }}
                  >
                    {n.label}
                  </span>
                  <div
                    className="w-1 h-1 rounded-full"
                    style={{ background: connected ? "#10B981" : "#F59E0B" }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Mobile chip strip ── */}
      <div className="sm:hidden overflow-x-auto pb-1 -mx-3 px-3">
        <div className="flex gap-2 w-max">
          {INTEGRATION_META.map((meta) => {
            const enabledCount = getEnabledCount(meta.key);
            const connected = resolveConnected(meta.key, integrationStatus);
            const isActive = activeKey === meta.key;
            return (
              <button
                key={meta.key}
                type="button"
                onClick={() => setActiveKey(isActive ? null : meta.key)}
                aria-pressed={isActive}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all shrink-0"
                style={{
                  borderColor: isActive
                    ? meta.color
                    : enabledCount > 0
                      ? `${meta.color}50`
                      : "rgba(255,255,255,0.1)",
                  background: isActive
                    ? `${meta.color}18`
                    : enabledCount > 0
                      ? `${meta.color}08`
                      : "transparent",
                }}
              >
                <meta.Icon
                  style={{
                    width: 12,
                    height: 12,
                    color: isActive ? meta.color : "rgba(255,255,255,0.5)",
                  }}
                />
                <span
                  className="text-[10px] font-medium"
                  style={{ color: isActive ? meta.color : "rgba(255,255,255,0.7)" }}
                >
                  {meta.label}
                </span>
                <div
                  className="w-1 h-1 rounded-full"
                  style={{ background: connected ? "#10B981" : "#F59E0B" }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Detail panel ── */}
      <AnimatePresence mode="wait">
        {activeKey && activeIntegration && (
          <motion.div
            key={activeKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div
              className="rounded-xl border p-3 space-y-3"
              style={{
                borderColor: `${activeIntegration.color}30`,
                background: `${activeIntegration.color}06`,
              }}
            >
              {/* Panel header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${activeIntegration.color}20` }}
                  >
                    <activeIntegration.Icon
                      style={{ width: 16, height: 16, color: activeIntegration.color }}
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-ink">
                      {activeIntegration.label}
                    </div>
                    <div className="text-[10px] text-muted/70 leading-relaxed">
                      {activeIntegration.tagline}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveKey(null)}
                  aria-label="Close integration panel"
                  className="p-1 rounded-lg hover:bg-white/8 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5 text-muted/60" />
                </button>
              </div>

              {/* Status + connect link */}
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: resolveConnected(activeKey, integrationStatus)
                        ? "#10B981"
                        : "#F59E0B",
                    }}
                  />
                  <span className="text-muted/70">
                    {resolveConnected(activeKey, integrationStatus)
                      ? "Connected"
                      : "Not connected"}
                  </span>
                </div>
                {!resolveConnected(activeKey, integrationStatus) && (
                  <a
                    href="/integrations"
                    className="text-amber-600 underline underline-offset-2 hover:text-amber-500"
                  >
                    Connect in Integrations →
                  </a>
                )}
                <span className="text-muted/50">
                  {getEnabledCount(activeKey)}/{getTotalCount(activeKey)} tools on
                </span>
              </div>

              {/* Preview card */}
              <activeIntegration.PreviewCard />

              {/* Tool toggles */}
              <div className="space-y-1.5">
                <div className="text-[9px] uppercase tracking-[0.3em] text-muted/60 pb-1">
                  Tools
                </div>
                {activeTools.map((tool) => {
                  const enabled = selectedToolNames.includes(tool.name);
                  const isDefault = roleDefaultTools.includes(tool.name);
                  return (
                    <button
                      key={tool.name}
                      type="button"
                      onClick={() => onToggleTool(tool.name)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border transition-all text-left"
                      style={{
                        borderColor: enabled
                          ? `${activeIntegration.color}35`
                          : "rgba(255,255,255,0.07)",
                        background: enabled
                          ? `${activeIntegration.color}0c`
                          : "rgba(0,0,0,0.12)",
                      }}
                    >
                      {/* Mini toggle */}
                      <div
                        className="w-8 h-4 rounded-full border flex items-center px-0.5 shrink-0 transition-colors"
                        style={{
                          borderColor: enabled
                            ? `${activeIntegration.color}55`
                            : "rgba(255,255,255,0.13)",
                          background: enabled
                            ? `${activeIntegration.color}22`
                            : "rgba(0,0,0,0.2)",
                        }}
                      >
                        <motion.div
                          animate={{ x: enabled ? 14 : 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className="w-3 h-3 rounded-full"
                          style={{
                            background: enabled
                              ? activeIntegration.color
                              : "rgba(255,255,255,0.35)",
                          }}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-ink font-medium">{tool.label}</span>
                          {isDefault && (
                            <span className="text-[7px] uppercase tracking-[0.22em] px-1.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-muted/70">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted/65 leading-relaxed mt-0.5">
                          {tool.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Enable / disable all */}
              <button
                type="button"
                onClick={() => {
                  const allOn = activeTools.every((t) => selectedToolNames.includes(t.name));
                  onToggleIntegrationGroup(activeKey, !allOn);
                }}
                className="w-full py-2 rounded-lg text-[10px] font-medium border transition-all"
                style={{
                  borderColor: `${activeIntegration.color}28`,
                  color: activeIntegration.color,
                  background: `${activeIntegration.color}08`,
                }}
              >
                {activeTools.every((t) => selectedToolNames.includes(t.name))
                  ? `Disable all ${activeIntegration.label} tools`
                  : `Enable all ${activeIntegration.label} tools`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
