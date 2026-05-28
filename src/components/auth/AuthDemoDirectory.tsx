import React, { useState } from "react";
import { ChevronDown, Phone } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ContactAgent } from "../../data/contact-agents";

function AgentContactCard({
  agent,
  isDemo,
  dense = false,
  landing = false,
}: {
  agent: ContactAgent;
  isDemo?: boolean;
  dense?: boolean;
  landing?: boolean;
}) {
  if (dense) {
    const card = (
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "rounded-xl flex items-center justify-center shrink-0 shadow-sm",
            landing ? "w-11 h-11" : "w-6 h-6",
          )}
          style={{ background: isDemo ? "rgba(0,0,0,0.04)" : `${agent.tint}18` }}
        >
          <Phone
            className={landing ? "w-5 h-5" : "w-3 h-3"}
            style={{ color: isDemo ? "#6B635A" : agent.tint }}
            strokeWidth={2.4}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span
              className={cn("font-semibold text-ink truncate", landing ? "text-sm sm:text-base tracking-tight" : "text-[11px]")}
            >
              {agent.name}
            </span>
            <span
              className={cn(
                "shrink-0 uppercase tracking-wider font-bold px-1.5 py-0.5 rounded",
                landing ? "text-[9px] sm:text-[10px]" : "text-[9px]",
                isDemo ? "text-amber-800/80 bg-amber-500/10" : "text-brand bg-brand/10",
              )}
            >
              {isDemo ? "Demo" : "Team"}
            </span>
          </div>
          <p
            className={cn(
              "leading-snug text-muted truncate",
              landing ? "text-xs mt-0.5" : "text-[10px] leading-tight",
            )}
          >
            {agent.role}
          </p>
          {landing ? (
            <p className="font-mono tabular-nums text-brand mt-1 sm:mt-1.5 text-xs sm:text-sm font-medium tracking-tight">
              {agent.display}
            </p>
          ) : (
            <a
              href={`tel:${agent.tel}`}
              className="font-mono text-[11px] tabular-nums text-ink/90 hover:text-brand hover:underline underline-offset-2"
              aria-label={`Call ${agent.name} at ${agent.display}`}
            >
              {agent.display}
            </a>
          )}
        </div>
      </div>
    );

    if (landing) {
      return (
        <a
          href={`tel:${agent.tel}`}
          className="block rounded-2xl border border-black/8 bg-white/80 backdrop-blur-sm p-4 min-h-[5rem] hover:border-brand/30 hover:shadow-[0_8px_30px_-10px_rgba(79,30,123,0.15)] active:scale-[0.98] transition-all"
          aria-label={`Call ${agent.name} at ${agent.display}`}
          data-testid={`call-agent-${agent.name.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {card}
        </a>
      );
    }

    return (
      <div className="rounded-lg border border-black/8 bg-white/65 px-2 py-1.5 hover:border-brand/20 transition-colors">
        {card}
      </div>
    );
  }

  return (
    <div className="relative rounded-sm p-3 overflow-hidden border border-black/10 bg-white/80 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-black/5 shadow-sm"
          style={{ background: isDemo ? "rgba(0,0,0,0.03)" : `${agent.tint}1a` }}
        >
          <Phone
            className="w-4 h-4"
            style={{ color: isDemo ? "#a1a1aa" : agent.tint }}
            strokeWidth={2.4}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span
              className={cn(
                "shrink-0 whitespace-nowrap text-[9px] uppercase tracking-[0.2em] font-bold px-1.5 py-0.5 rounded-sm leading-none",
                isDemo
                  ? "bg-black/5 text-black/60 border border-black/10"
                  : "bg-black text-white border border-black",
              )}
            >
              {isDemo ? "Demo" : "Wireline Team"}
            </span>
            <span className="text-sm font-bold truncate text-ink tracking-tight">{agent.name}</span>
          </div>
          <p className="font-display italic text-sm leading-snug text-ink/80 line-clamp-2 text-balance">
            {agent.role}
          </p>
          <a
            href={`tel:${agent.tel}`}
            className="mt-2 inline-flex min-h-[44px] items-center font-mono text-sm tabular-nums font-bold text-ink underline-offset-2 hover:text-black/60 transition-colors"
            aria-label={`Call ${agent.name} at ${agent.display}`}
          >
            <span className="select-all">{agent.display}</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export interface AuthDemoDirectoryProps {
  wirelineAgents: ContactAgent[];
  demoAgents: ContactAgent[];
  /** Collapsible directory (auth). Landing uses `landing` for a full grid. */
  variant?: "collapsible" | "landing";
  /** Show full directory expanded on first paint (desktop brand panel). */
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * Live-line directory — collapsible on auth, full grid on the marketing home.
 */
export function AuthDemoDirectory({
  wirelineAgents,
  demoAgents,
  variant = "collapsible",
  defaultExpanded = false,
  className,
}: AuthDemoDirectoryProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const featured = wirelineAgents[0];
  const totalCount = wirelineAgents.length + demoAgents.length;

  if (variant === "landing") {
    return (
      <div
        className={cn(
          "grid gap-2 auto-rows-min content-start",
          "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 lg:gap-1.5",
          className,
        )}
      >
        {wirelineAgents.map((agent) => (
          <AgentContactCard key={agent.tel} agent={agent} dense landing />
        ))}
        {demoAgents.map((agent) => (
          <AgentContactCard key={agent.tel} agent={agent} isDemo dense landing />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 rounded-sm border border-black/10 bg-black/5 px-4 py-3 min-h-[48px] text-left transition-colors hover:bg-black/10 active:bg-black/15 shadow-sm"
        aria-expanded={expanded}
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-ink">Try live agents</p>
          <p className="text-xs text-black/60 font-medium mt-0.5">
            {expanded
              ? `${totalCount} lines — dial from your phone`
              : featured
                ? `Featured: ${featured.name} · ${featured.display}`
                : `${totalCount} lines available`}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 text-ink transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {!expanded && featured && <AgentContactCard agent={featured} isDemo={false} />}

      {expanded && (
        <div className="space-y-3 max-h-[min(42vh,380px)] overflow-y-auto scrollbar-hide pr-0.5 mt-4">
          <div>
            <p className="mb-3 text-[10px] uppercase tracking-[0.2em] font-bold text-ink">Wireline agents</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {wirelineAgents.map((agent) => (
                <AgentContactCard key={agent.tel} agent={agent} isDemo={false} />
              ))}
            </div>
          </div>
          <div className="pt-2">
            <p className="mb-3 text-[10px] uppercase tracking-[0.2em] font-bold text-black/60">Demo agents</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
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
