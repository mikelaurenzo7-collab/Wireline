/**
 * WorkflowView — visual SVG node-graph of an agent's decision flow.
 *
 * Renders a role-specific flow diagram showing how the agent handles a typical
 * call: Start → Greeting → Discovery → [Branch] → Close / Escalate / Nurture.
 * Nodes are role-aware — a sales agent shows a qualification funnel; a support
 * agent shows an issue triage tree.
 *
 * This is display-only. Operators edit the underlying flow in the Training tab;
 * clicking a node deep-links there.
 */
import React, { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  GitBranch,
  CheckCircle2,
  XCircle,
  PhoneCall,
  User,
  Lightbulb,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeKind = "start" | "action" | "branch" | "success" | "escalate" | "end";

interface FlowNode {
  id: string;
  kind: NodeKind;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  branch?: "yes" | "no";
}

interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ── Role-specific flows ───────────────────────────────────────────────────────

function buildFlowForRole(role: string): FlowGraph {
  switch (role) {
    case "sales":
      return {
        nodes: [
          { id: "start", kind: "start", label: "Inbound call", x: 180, y: 24 },
          {
            id: "greet",
            kind: "action",
            label: "Warm greeting",
            sublabel: "Confirm name + intent",
            x: 180,
            y: 96,
          },
          {
            id: "discover",
            kind: "action",
            label: "Discovery",
            sublabel: "Budget · Timeline · Pain",
            x: 180,
            y: 178,
          },
          { id: "qualify", kind: "branch", label: "Qualified?", x: 180, y: 262 },
          {
            id: "pitch",
            kind: "action",
            label: "Pitch + trial close",
            sublabel: "Handle objections",
            x: 60,
            y: 352,
          },
          {
            id: "nurture",
            kind: "end",
            label: "Nurture sequence",
            sublabel: "SMS + email cadence",
            x: 300,
            y: 352,
          },
          {
            id: "close",
            kind: "success",
            label: "Close / Book demo",
            sublabel: "CRM updated",
            x: 60,
            y: 440,
          },
          {
            id: "escalate",
            kind: "escalate",
            label: "Escalate to rep",
            sublabel: "High-value signal",
            x: 180,
            y: 440,
          },
        ],
        edges: [
          { from: "start", to: "greet" },
          { from: "greet", to: "discover" },
          { from: "discover", to: "qualify" },
          { from: "qualify", to: "pitch", branch: "yes", label: "Yes" },
          { from: "qualify", to: "nurture", branch: "no", label: "Not yet" },
          { from: "pitch", to: "close" },
          { from: "pitch", to: "escalate", label: "Complex" },
        ],
      };

    case "customer_service":
    case "technical_support":
      return {
        nodes: [
          { id: "start", kind: "start", label: "Contact opens", x: 180, y: 24 },
          {
            id: "greet",
            kind: "action",
            label: "Verify identity",
            sublabel: "Account lookup",
            x: 180,
            y: 96,
          },
          {
            id: "issue",
            kind: "action",
            label: "Issue triage",
            sublabel: "Category + severity",
            x: 180,
            y: 178,
          },
          { id: "branch", kind: "branch", label: "Self-serve?", x: 180, y: 262 },
          {
            id: "resolve",
            kind: "success",
            label: "Resolve in-call",
            sublabel: "Ticket logged",
            x: 60,
            y: 352,
          },
          {
            id: "escalate",
            kind: "escalate",
            label: "Escalate to tier 2",
            sublabel: "Warm transfer",
            x: 300,
            y: 352,
          },
          {
            id: "ticket",
            kind: "end",
            label: "Create ticket",
            sublabel: "SLA assigned",
            x: 180,
            y: 440,
          },
        ],
        edges: [
          { from: "start", to: "greet" },
          { from: "greet", to: "issue" },
          { from: "issue", to: "branch" },
          { from: "branch", to: "resolve", branch: "yes", label: "Solvable" },
          { from: "branch", to: "escalate", branch: "no", label: "Complex" },
          { from: "resolve", to: "ticket" },
          { from: "escalate", to: "ticket" },
        ],
      };

    case "scheduler":
      return {
        nodes: [
          { id: "start", kind: "start", label: "Booking request", x: 180, y: 24 },
          {
            id: "intent",
            kind: "action",
            label: "Confirm service",
            sublabel: "Type + duration",
            x: 180,
            y: 96,
          },
          {
            id: "check",
            kind: "action",
            label: "Check availability",
            sublabel: "Calendar integration",
            x: 180,
            y: 178,
          },
          { id: "avail", kind: "branch", label: "Slot open?", x: 180, y: 262 },
          {
            id: "book",
            kind: "success",
            label: "Book + confirm",
            sublabel: "Invite sent",
            x: 80,
            y: 352,
          },
          {
            id: "alt",
            kind: "action",
            label: "Offer alternatives",
            sublabel: "Next 3 openings",
            x: 300,
            y: 352,
          },
          {
            id: "followup",
            kind: "end",
            label: "Follow-up SMS",
            sublabel: "Reminder scheduled",
            x: 180,
            y: 440,
          },
        ],
        edges: [
          { from: "start", to: "intent" },
          { from: "intent", to: "check" },
          { from: "check", to: "avail" },
          { from: "avail", to: "book", branch: "yes", label: "Available" },
          { from: "avail", to: "alt", branch: "no", label: "Full" },
          { from: "book", to: "followup" },
          { from: "alt", to: "followup" },
        ],
      };

    case "collections":
      return {
        nodes: [
          { id: "start", kind: "start", label: "Outbound call", x: 180, y: 24 },
          {
            id: "verify",
            kind: "action",
            label: "Verify party",
            sublabel: "FDCPA compliance",
            x: 180,
            y: 96,
          },
          {
            id: "disclose",
            kind: "action",
            label: "Debt disclosure",
            sublabel: "Mini-Miranda",
            x: 180,
            y: 178,
          },
          { id: "intent", kind: "branch", label: "Willing to pay?", x: 180, y: 262 },
          {
            id: "promise",
            kind: "success",
            label: "Log promise-to-pay",
            sublabel: "Amount + date",
            x: 60,
            y: 352,
          },
          {
            id: "dispute",
            kind: "action",
            label: "Dispute process",
            sublabel: "Validation letter",
            x: 300,
            y: 352,
          },
          {
            id: "followup",
            kind: "end",
            label: "Schedule callback",
            sublabel: "Auto-queued",
            x: 180,
            y: 440,
          },
        ],
        edges: [
          { from: "start", to: "verify" },
          { from: "verify", to: "disclose" },
          { from: "disclose", to: "intent" },
          { from: "intent", to: "promise", branch: "yes", label: "Agreed" },
          { from: "intent", to: "dispute", branch: "no", label: "Disputes" },
          { from: "promise", to: "followup" },
          { from: "dispute", to: "followup" },
        ],
      };

    default:
      return {
        nodes: [
          { id: "start", kind: "start", label: "Call begins", x: 180, y: 24 },
          {
            id: "greet",
            kind: "action",
            label: "Greet & identify",
            sublabel: "Confirm intent",
            x: 180,
            y: 96,
          },
          {
            id: "assist",
            kind: "action",
            label: "Assist contact",
            sublabel: "Tools + memory",
            x: 180,
            y: 178,
          },
          { id: "resolved", kind: "branch", label: "Resolved?", x: 180, y: 262 },
          {
            id: "wrap",
            kind: "success",
            label: "Wrap & summarize",
            sublabel: "Thread updated",
            x: 80,
            y: 352,
          },
          {
            id: "escalate",
            kind: "escalate",
            label: "Escalate",
            sublabel: "Human handoff",
            x: 300,
            y: 352,
          },
        ],
        edges: [
          { from: "start", to: "greet" },
          { from: "greet", to: "assist" },
          { from: "assist", to: "resolved" },
          { from: "resolved", to: "wrap", branch: "yes", label: "Yes" },
          { from: "resolved", to: "escalate", branch: "no", label: "Needs human" },
        ],
      };
  }
}

// ── Styling per node kind ─────────────────────────────────────────────────────

const NODE_STYLES: Record<
  NodeKind,
  { bg: string; border: string; text: string; icon: React.ReactNode }
> = {
  start: {
    bg: "rgba(139,63,214,0.08)",
    border: "rgba(139,63,214,0.35)",
    text: "#6D24B0",
    icon: <PhoneCall className="w-3.5 h-3.5" />,
  },
  action: {
    bg: "rgba(0,0,0,0.03)",
    border: "rgba(0,0,0,0.12)",
    text: "rgba(26,22,20,0.80)",
    icon: <User className="w-3.5 h-3.5" />,
  },
  branch: {
    bg: "rgba(245,158,11,0.07)",
    border: "rgba(245,158,11,0.38)",
    text: "#B45309",
    icon: <GitBranch className="w-3.5 h-3.5" />,
  },
  success: {
    bg: "rgba(16,185,129,0.07)",
    border: "rgba(16,185,129,0.35)",
    text: "#047857",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  escalate: {
    bg: "rgba(232,70,106,0.06)",
    border: "rgba(232,70,106,0.30)",
    text: "#BE1D43",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  end: {
    bg: "rgba(59,130,246,0.07)",
    border: "rgba(59,130,246,0.30)",
    text: "#1D4ED8",
    icon: <Lightbulb className="w-3.5 h-3.5" />,
  },
};

// ── SVG rendering helpers ─────────────────────────────────────────────────────

function nodeRect(node: FlowNode) {
  return { x: node.x - 80, y: node.y, w: 160, h: node.sublabel ? 54 : 38 };
}

function branchDiamond(node: FlowNode) {
  const cx = node.x;
  const cy = node.y + 22;
  const hw = 68;
  const hh = 26;
  return `${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`;
}

function edgePath(from: FlowNode, to: FlowNode, _allNodes: FlowNode[]): string {
  const fr = nodeRect(from);
  const tr = nodeRect(to);
  const fx = from.x;
  const fy = from.kind === "branch" ? from.y + 52 : fr.y + fr.h;
  const tx = to.x;
  const ty = tr.y;
  const _mx = (fx + tx) / 2;
  const _my = (fy + ty) / 2;

  // Straight-ish bezier
  if (Math.abs(fx - tx) < 20) {
    return `M ${fx} ${fy} L ${tx} ${ty}`;
  }

  // Elbow for diagonal edges
  const midY = fy + (ty - fy) * 0.5;
  return `M ${fx} ${fy} C ${fx} ${midY} ${tx} ${midY} ${tx} ${ty}`;
}

// ── Main Component ────────────────────────────────────────────────────────────

interface WorkflowViewProps {
  agentId: string;
  agentName: string;
  role?: string;
  onOpenTraining?: () => void;
}

export default function WorkflowView({
  agentName,
  role = "customer_service",
  onOpenTraining,
}: WorkflowViewProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const flow = buildFlowForRole(role);

  // Compute SVG viewport bounds
  const allX = flow.nodes.map((n) => n.x);
  const allY = flow.nodes.map((n) => n.y);
  const minX = Math.min(...allX) - 100;
  const maxX = Math.max(...allX) + 100;
  const maxY = Math.max(...allY) + 80;
  const svgW = maxX - minX;
  const svgH = maxY;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-ink">{agentName} · Call Flow</h3>
            <p className="text-[11px] text-muted mt-0.5">
              Visual map of how this agent handles each interaction
            </p>
          </div>
          {onOpenTraining && (
            <button
              onClick={onOpenTraining}
              className="inline-flex items-center gap-1 text-[11px] text-brand hover:text-brand/80 transition-colors"
            >
              Edit flow
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="shrink-0 px-4 pb-3 flex items-center gap-3 flex-wrap">
        {(["start", "action", "branch", "success", "escalate", "end"] as NodeKind[]).map((kind) => {
          const s = NODE_STYLES[kind];
          const labels: Record<NodeKind, string> = {
            start: "Trigger",
            action: "Step",
            branch: "Decision",
            success: "Win",
            escalate: "Escalate",
            end: "Outcome",
          };
          return (
            <span key={kind} className="inline-flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: s.bg, border: `1px solid ${s.border}` }}
              />
              <span className="text-[10px] text-muted">{labels[kind]}</span>
            </span>
          );
        })}
      </div>

      {/* SVG flow */}
      <div className="flex-1 min-h-0 overflow-auto px-4 pb-4">
        <motion.svg
          viewBox={`${minX} 0 ${svgW} ${svgH}`}
          className="w-full"
          style={{ minHeight: svgH, maxHeight: "none" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="rgba(0,0,0,0.22)" />
            </marker>
            <marker id="arrow-yes" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="rgba(16,185,129,0.6)" />
            </marker>
            <marker id="arrow-no" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="rgba(232,70,106,0.5)" />
            </marker>
          </defs>

          {/* Edges */}
          {flow.edges.map((edge, i) => {
            const from = flow.nodes.find((n) => n.id === edge.from)!;
            const to = flow.nodes.find((n) => n.id === edge.to)!;
            const d = edgePath(from, to, flow.nodes);
            const isYes = edge.branch === "yes";
            const isNo = edge.branch === "no";
            const edgeColor = isYes
              ? "rgba(16,185,129,0.5)"
              : isNo
                ? "rgba(232,70,106,0.4)"
                : "rgba(0,0,0,0.18)";
            const markerId = isYes ? "arrow-yes" : isNo ? "arrow-no" : "arrow";

            return (
              <g key={i}>
                <path
                  d={d}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth="1.5"
                  strokeDasharray={edge.branch ? "none" : "none"}
                  markerEnd={`url(#${markerId})`}
                />
                {edge.label && (
                  <text
                    x={
                      (flow.nodes.find((n) => n.id === edge.from)!.x +
                        flow.nodes.find((n) => n.id === edge.to)!.x) /
                      2
                    }
                    y={
                      (flow.nodes.find((n) => n.id === edge.from)!.y +
                        flow.nodes.find((n) => n.id === edge.to)!.y) /
                        2 +
                      4
                    }
                    textAnchor="middle"
                    fontSize="8"
                    fill={isYes ? "#059669" : isNo ? "#BE1D43" : "rgba(0,0,0,0.4)"}
                    fontFamily="var(--font-mono, monospace)"
                    fontWeight="600"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {flow.nodes.map((node, i) => {
            const style = NODE_STYLES[node.kind];
            const isHovered = hoveredNode === node.id;
            const r = nodeRect(node);

            return (
              <motion.g
                key={node.id}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: onOpenTraining ? "pointer" : "default" }}
                onClick={() => onOpenTraining?.()}
              >
                {node.kind === "branch" ? (
                  /* Diamond shape for branch nodes */
                  <>
                    <polygon
                      points={branchDiamond(node)}
                      fill={isHovered ? "rgba(245,158,11,0.14)" : style.bg}
                      stroke={style.border}
                      strokeWidth={isHovered ? 2 : 1.5}
                      style={{ transition: "all 0.15s" }}
                    />
                    <text
                      x={node.x}
                      y={node.y + 18}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      fill={style.text}
                      fontFamily="system-ui, sans-serif"
                    >
                      {node.label}
                    </text>
                  </>
                ) : (
                  /* Rounded rect for all other nodes */
                  <>
                    <rect
                      x={r.x}
                      y={r.y}
                      width={r.w}
                      height={r.h}
                      rx="8"
                      fill={isHovered ? style.bg.replace(/[\d.]+\)$/, "0.13)") : style.bg}
                      stroke={style.border}
                      strokeWidth={isHovered ? 2 : 1.5}
                      style={{ transition: "all 0.15s" }}
                    />
                    <text
                      x={node.x}
                      y={r.y + 15}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      fill={style.text}
                      fontFamily="system-ui, sans-serif"
                    >
                      {node.label}
                    </text>
                    {node.sublabel && (
                      <text
                        x={node.x}
                        y={r.y + 30}
                        textAnchor="middle"
                        fontSize="8"
                        fill="rgba(26,22,20,0.42)"
                        fontFamily="var(--font-mono, monospace)"
                      >
                        {node.sublabel}
                      </text>
                    )}
                  </>
                )}
              </motion.g>
            );
          })}
        </motion.svg>
      </div>

      {/* Footer note */}
      <div className="shrink-0 px-4 py-2 border-t border-black/5">
        <p className="text-[10px] text-muted/60">
          Flow adapts based on this agent's role, tools, and configured instructions.{" "}
          {onOpenTraining && (
            <button onClick={onOpenTraining} className="text-brand hover:underline">
              Customize in Training →
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
