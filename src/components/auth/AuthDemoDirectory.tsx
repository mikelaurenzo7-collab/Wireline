import React, { useState } from "react";
import { ChevronDown, Phone } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ContactAgent } from "../../data/contact-agents";

function AgentContactCard({ agent, isDemo }: { agent: ContactAgent; isDemo?: boolean }) {
  return (
    <div className="relative rounded-xl p-3 overflow-hidden border border-white/10 glass">
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-white/10"
          style={{ background: isDemo ? "rgba(255,255,255,0.03)" : `${agent.tint}1a` }}
        >
          <Phone
            className="w-3.5 h-3.5"
            style={{ color: isDemo ? "#a1a1aa" : agent.tint }}
            strokeWidth={2.4}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={cn(
                "shrink-0 whitespace-nowrap text-[8px] uppercase tracking-[0.16em] font-semibold px-1.5 py-0.5 rounded leading-none",
                isDemo
                  ? "bg-white/8 text-muted/80 border border-white/10"
                  : "bg-[#4F1E7B]/15 text-[#4F1E7B] border border-[#4F1E7B]/30",
              )}
            >
              {isDemo ? "Demo" : "Wireline Team"}
            </span>
            <span className="text-[9px] uppercase tracking-[0.18em] text-muted/70 truncate">
              {agent.name}
            </span>
          </div>
          <p className="font-display italic text-sm leading-snug text-ink/90 line-clamp-2 text-balance">
            {agent.role}
          </p>
          <p className="mt-1 font-mono text-[13px] tabular-nums text-ink select-all">
            {agent.display}
          </p>
        </div>
      </div>
    </div>
  );
}

export interface AuthDemoDirectoryProps {
  wirelineAgents: ContactAgent[];
  demoAgents: ContactAgent[];
  /** Show full directory expanded on first paint (desktop brand panel). */
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * Collapsible live-line directory for the auth portal — keeps sign-in above the fold
 * while still surfacing all demo numbers on demand.
 */
export function AuthDemoDirectory({
  wirelineAgents,
  demoAgents,
  defaultExpanded = false,
  className,
}: AuthDemoDirectoryProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const featured = wirelineAgents[0];
  const totalCount = wirelineAgents.length + demoAgents.length;

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 rounded-xl border border-[#4F1E7B]/20 bg-[#4F1E7B]/5 px-3.5 py-3 min-h-[48px] text-left transition-colors hover:bg-[#4F1E7B]/10 active:bg-[#4F1E7B]/14"
        aria-expanded={expanded}
      >
        <div>
          <p className="text-[9px] uppercase tracking-[0.38em] text-[#4F1E7B] font-semibold">
            Try live agents
          </p>
          <p className="text-[11px] text-muted/75 mt-0.5">
            {expanded
              ? `${totalCount} lines — dial from your phone`
              : featured
                ? `Featured: ${featured.name} · ${featured.display}`
                : `${totalCount} lines available`}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 text-[#4F1E7B] transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {!expanded && featured && <AgentContactCard agent={featured} isDemo={false} />}

      {expanded && (
        <div className="space-y-3 max-h-[min(42vh,380px)] overflow-y-auto scrollbar-hide pr-0.5">
          <div>
            <p className="mb-2 text-[9px] uppercase tracking-[0.32em] text-[#4F1E7B]/80 font-semibold">
              Wireline agents
            </p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
              {wirelineAgents.map((agent) => (
                <AgentContactCard key={agent.tel} agent={agent} isDemo={false} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[9px] uppercase tracking-[0.32em] text-amber-600/90 font-semibold">
              Demo agents
            </p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
              {demoAgents.map((agent) => (
                <AgentContactCard key={agent.tel} agent={agent} isDemo />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
