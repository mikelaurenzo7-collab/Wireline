import React, { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  Mic,
  Shield,
  Zap,
  GitBranch,
  Database,
  Play,
  Plus,
  Trash2,
  Move,
} from "lucide-react";
import { cn } from "../lib/utils";
import { ShadButton } from "./ui/shadcn/ShadButton";

export type TrainingModuleType =
  | "knowledge"
  | "voice"
  | "policy"
  | "escalation"
  | "memory"
  | "integration";

export interface StudioNode {
  id: string;
  type: TrainingModuleType;
  x: number;
  y: number;
  label: string;
  config: Record<string, unknown>;
}

export interface StudioWire {
  id: string;
  from: string;
  to: string;
}

const MODULE_DEFS: Record<
  TrainingModuleType,
  { icon: React.ElementType; label: string; defaultConfig: Record<string, unknown> }
> = {
  knowledge: {
    icon: BookOpen,
    label: "Knowledge Block",
    defaultConfig: { sources: 3, coverage: "92%" },
  },
  voice: {
    icon: Mic,
    label: "Voice Trait",
    defaultConfig: { tone: "calm-professional", speed: 0.92 },
  },
  policy: {
    icon: Shield,
    label: "Policy Gate",
    defaultConfig: { rules: 7, strictness: "high" },
  },
  escalation: {
    icon: GitBranch,
    label: "Escalation Path",
    defaultConfig: { threshold: "urgent", notify: ["ops-lead"] },
  },
  memory: {
    icon: Database,
    label: "Memory Node",
    defaultConfig: { retention: "90d", context: "customer-history" },
  },
  integration: {
    icon: Zap,
    label: "Integration",
    defaultConfig: { target: "hubspot", events: ["call-ended"] },
  },
};

const PALETTE_ITEMS = Object.keys(MODULE_DEFS) as TrainingModuleType[];

interface AgentStudioCanvasProps {
  agentId: string;
  agentName: string;
  onPublish?: () => void;
}

export default function AgentStudioCanvas({
  agentId,
  agentName,
  onPublish,
}: AgentStudioCanvasProps) {
  const [nodes, setNodes] = useState<StudioNode[]>([
    {
      id: "n1",
      type: "knowledge",
      x: 180,
      y: 140,
      label: "Product FAQ",
      config: { sources: 4, coverage: "97%" },
    },
    {
      id: "n2",
      type: "voice",
      x: 420,
      y: 200,
      label: "Front Desk Tone",
      config: { tone: "warm-reassuring", speed: 0.95 },
    },
  ]);
  const [wires, setWires] = useState<StudioWire[]>([
    { id: "w1", from: "n1", to: "n2" },
  ]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Drag node
  const moveNode = useCallback((id: string, dx: number, dy: number) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n
      )
    );
  }, []);

  // Drop from palette
  const handleDrop = useCallback(
    (e: React.DragEvent, type: TrainingModuleType) => {
      e.preventDefault();
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - offset.x) / scale;
      const y = (e.clientY - rect.top - offset.y) / scale;

      const def = MODULE_DEFS[type];
      const newNode: StudioNode = {
        id: `n${Date.now()}`,
        type,
        x: Math.max(40, Math.min(x - 80, 900)),
        y: Math.max(40, Math.min(y - 40, 520)),
        label: def.label,
        config: { ...def.defaultConfig },
      };

      setNodes((prev) => [...prev, newNode]);
      setSelectedNodeId(newNode.id);
    },
    [offset, scale]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Canvas pan
  const startPan = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    setIsDraggingCanvas(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const pan = (e: React.MouseEvent) => {
    if (!isDraggingCanvas) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const endPan = () => setIsDraggingCanvas(false);

  // Zoom
  const zoom = (delta: number) => {
    const newScale = Math.max(0.5, Math.min(2.2, scale + delta));
    setScale(newScale);
  };

  // Delete node
  const deleteNode = (id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setWires((prev) => prev.filter((w) => w.from !== id && w.to !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  // Simple wire rendering (SVG)
  const renderWires = () => {
    return wires.map((wire) => {
      const fromNode = nodes.find((n) => n.id === wire.from);
      const toNode = nodes.find((n) => n.id === wire.to);
      if (!fromNode || !toNode) return null;

      const x1 = fromNode.x + 160;
      const y1 = fromNode.y + 48;
      const x2 = toNode.x;
      const y2 = toNode.y + 48;
      const mx = (x1 + x2) / 2;

      return (
        <g key={wire.id}>
          <path
            d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke="url(#wireGradient)"
            strokeWidth="2"
            strokeOpacity="0.6"
          />
          <circle cx={x2} cy={y2} r="4" fill="#6E8CFF" />
        </g>
      );
    });
  };

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col overflow-hidden rounded-3xl border border-border bg-canvas text-foreground">
      {/* Top Bar — Sovereign Workspace Chrome */}
      <div className="flex h-16 items-center justify-between border-b border-border bg-panel px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-iris/10 flex items-center justify-center">
              <Move className="h-4 w-4 text-iris" />
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-3">
                AGENT STUDIO
              </div>
              <div className="font-display text-xl tracking-[-0.02em]">{agentName}</div>
            </div>
          </div>
          <div className="ml-2 rounded-full bg-raised px-3 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-text-2">
            v3.4 • LIVE
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-2xl bg-panel-2 p-1 text-xs">
            <button onClick={() => zoom(-0.15)} className="px-3 py-1 hover:text-iris">- </button>
            <div className="font-mono tabular-nums px-2 text-text-2">{(scale * 100).toFixed(0)}%</div>
            <button onClick={() => zoom(0.15)} className="px-3 py-1 hover:text-iris"> +</button>
          </div>

          <ShadButton
            onClick={onPublish}
            className="bg-iris text-canvas hover:bg-iris-bright"
          >
            <Play className="mr-2 h-4 w-4" /> Publish to Live
          </ShadButton>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Palette — Training Primitives */}
        <div className="w-72 border-r border-border bg-panel p-5 overflow-y-auto">
          <div className="mb-4 px-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-3 mb-1">
              TRAINING PRIMITIVES
            </div>
            <div className="text-sm text-text-2">Drag anything onto the canvas</div>
          </div>

          <div className="space-y-2">
            {PALETTE_ITEMS.map((type) => {
              const def = MODULE_DEFS[type];
              const Icon = def.icon;
              return (
                <div
                  key={type}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", type)}
                  className="group flex cursor-grab items-center gap-3 rounded-2xl border border-border bg-raised px-4 py-3.5 active:cursor-grabbing hover:border-iris/40 hover:bg-panel-2 transition-all"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-canvas text-iris group-hover:bg-iris group-hover:text-canvas transition-colors">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium tracking-[-0.01em]">{def.label}</div>
                    <div className="text-[11px] text-text-3 font-mono">Drag to canvas</div>
                  </div>
                  <Plus className="h-4 w-4 text-text-3 opacity-40 group-hover:opacity-100" />
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-panel-2 p-4 text-[11px] text-text-3">
            <div className="font-mono uppercase tracking-[0.18em] mb-1">PRO TIP</div>
            Connect nodes by dragging a wire from a port. The agent will follow the flow in real time.
          </div>
        </div>

        {/* Infinite Canvas */}
        <div
          ref={canvasRef}
          className="relative flex-1 overflow-hidden bg-[#050507] select-none"
          onDrop={(e) => {
            const type = e.dataTransfer.getData("text/plain") as TrainingModuleType;
            if (type && MODULE_DEFS[type]) handleDrop(e, type);
          }}
          onDragOver={handleDragOver}
          onMouseDown={startPan}
          onMouseMove={pan}
          onMouseUp={endPan}
          onMouseLeave={endPan}
          style={{ cursor: isDraggingCanvas ? "grabbing" : "grab" }}
        >
          {/* Subtle Grid */}
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
              backgroundSize: `${48 * scale}px ${48 * scale}px`,
              backgroundPosition: `${offset.x}px ${offset.y}px`,
            }}
          />

          {/* SVG Wires Layer */}
          <svg
            className="absolute inset-0 pointer-events-none z-10"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          >
            <defs>
              <linearGradient id="wireGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6E8CFF" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#F4EDE3" stopOpacity="0.7" />
              </linearGradient>
            </defs>
            {renderWires()}
          </svg>

          {/* Nodes Layer */}
          <div
            className="absolute inset-0"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          >
            <AnimatePresence>
              {nodes.map((node) => {
                const def = MODULE_DEFS[node.type];
                const Icon = def.icon;
                const isSelected = node.id === selectedNodeId;

                return (
                  <motion.div
                    key={node.id}
                    data-node
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: "spring", bounce: 0.18, duration: 0.28 }}
                    className={cn(
                      "absolute w-[260px] rounded-3xl border p-5 shadow-xl cursor-move select-none",
                      isSelected
                        ? "border-iris bg-raised shadow-2xl ring-1 ring-iris/30"
                        : "border-border bg-panel hover:border-iris/30"
                    )}
                    style={{ left: node.x, top: node.y }}
                    onClick={() => setSelectedNodeId(node.id)}
                    onMouseDown={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      const startX = e.clientX;
                      const startY = e.clientY;
                      const startNodeX = node.x;
                      const startNodeY = node.y;

                      const onMove = (ev: MouseEvent) => {
                        const dx = (ev.clientX - startX) / scale;
                        const dy = (ev.clientY - startY) / scale;
                        moveNode(node.id, dx, dy);
                      };
                      const onUp = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-canvas text-iris">
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <div className="font-medium tracking-[-0.01em] text-[15px]">{node.label}</div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-3">
                            {node.type.toUpperCase()}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNode(node.id);
                        }}
                        className="text-text-3 hover:text-rose transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Mini config preview */}
                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                      {Object.entries(node.config).slice(0, 4).map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-canvas/70 px-3 py-1.5 font-mono tabular-nums">
                          <span className="text-text-3">{k}:</span> <span className="text-cream">{String(v)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Connection ports hint */}
                    <div className="mt-3 flex justify-between text-[10px] font-mono text-text-3">
                      <div>IN</div>
                      <div>OUT</div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Empty State on Canvas */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-center">
              <div>
                <div className="mx-auto mb-4 h-16 w-16 rounded-3xl border border-border flex items-center justify-center">
                  <Move className="h-7 w-7 text-text-3" />
                </div>
                <div className="font-display text-2xl tracking-[-0.02em]">Your canvas is ready</div>
                <p className="mt-2 max-w-[260px] text-sm text-text-2">
                  Drag training primitives from the left palette. Connect them to define how your agent thinks.
                </p>
              </div>
            </div>
          )}

          {/* Floating Zoom Controls */}
          <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-1 rounded-2xl border border-border bg-panel/90 p-1 backdrop-blur">
            <button onClick={() => zoom(0.2)} className="px-3 py-1 text-xl leading-none hover:text-iris">+</button>
            <button onClick={() => zoom(-0.2)} className="px-3 py-1 text-xl leading-none hover:text-iris">−</button>
          </div>
        </div>

        {/* Inspector */}
        <div className="w-80 border-l border-border bg-panel overflow-y-auto p-6 text-sm">
          <div className="font-mono uppercase tracking-[0.2em] text-xs text-text-3 mb-3">INSPECTOR</div>

          {selectedNode ? (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="h-10 w-10 rounded-2xl bg-raised flex items-center justify-center text-iris">
                  {React.createElement(MODULE_DEFS[selectedNode.type].icon, { className: "h-5 w-5" })}
                </div>
                <div>
                  <div className="font-medium text-lg tracking-[-0.01em]">{selectedNode.label}</div>
                  <div className="text-xs text-text-3">{selectedNode.type}</div>
                </div>
              </div>

              <div className="space-y-4">
                {Object.keys(selectedNode.config).map((key) => (
                  <div key={key}>
                    <label className="block text-xs font-mono uppercase tracking-[0.16em] text-text-3 mb-1.5">
                      {key.replace(/-/g, " ")}
                    </label>
                    <input
                      className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm focus:border-iris focus:outline-none"
                      defaultValue={String(selectedNode.config[key])}
                      onBlur={(e) => {
                        const val = e.target.value;
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, config: { ...n.config, [key]: val } }
                              : n
                          )
                        );
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-border">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-3 mb-2">LIVE PREVIEW</div>
                <div className="rounded-2xl bg-canvas p-4 text-xs text-text-2 font-mono leading-relaxed">
                  “Hi, this is Jordan from Acme. How can I help you today?”
                  <div className="mt-2 text-iris">→ Matches policy gate “support-first”</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-text-3 text-sm pt-8">
              Select a node on the canvas to inspect and tune its behavior.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
