import React, { useState } from "react";
import { ChevronDown, Phone } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
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
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={cn(
            "rounded-md flex items-center justify-center shrink-0",
            landing ? "w-9 h-9" : "w-6 h-6",
            isDemo ? "bg-[var(--wireline-color-surface-container)]" : "wl-accent-surface",
          )}
          data-accent={isDemo ? undefined : agent.tint}
        >
          <Phone
            className={cn(
              landing ? "w-4 h-4" : "w-3 h-3",
              isDemo ? "text-[var(--wireline-color-text-secondary)]" : "wl-accent-text",
            )}
            strokeWidth={2.4}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span
              className={cn(
                "font-semibold text-foreground truncate",
                landing ? "text-sm" : "text-[var(--wireline-typography-overline-size)]",
              )}
            >
              {agent.name}
            </span>
            <span
              className={cn(
                "shrink-0 uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded",
                "wl-micro-badge",
                isDemo ? "text-amber-800/80 bg-amber-500/10" : "text-brand bg-brand/10",
              )}
            >
              {isDemo ? "Demo" : "Team"}
            </span>
          </div>
          <p
            className={cn(
              "leading-snug text-muted truncate",
              landing ? "text-xs mt-0.5" : "wl-micro-meta leading-tight",
            )}
          >
            {agent.role}
          </p>
          {landing ? (
            <p className="font-mono tabular-nums text-brand mt-1 text-sm font-medium">
              {agent.display}
            </p>
          ) : (
            <a
              href={`tel:${agent.tel}`}
              className="font-mono text-[var(--wireline-typography-overline-size)] tabular-nums text-foreground/90 hover:text-brand hover:underline underline-offset-2"
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
          className="block rounded-md border border-white/8 bg-card/70 px-3 py-3 min-h-[56px] hover:border-brand/30 hover:bg-card active:scale-[0.99] transition-all"
          aria-label={`Call ${agent.name} at ${agent.display}`}
        >
          {card}
        </a>
      );
    }

    return (
      <div className="rounded-md border border-white/8 bg-white/65 px-2 py-1.5 hover:border-brand/20 transition-colors">
        {card}
      </div>
    );
  }

  return (
    <div className="relative rounded-md p-3 overflow-hidden border border-white/8 bg-white/60">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-8 h-8 rounded-md flex items-center justify-center shrink-0 border border-white/10",
            isDemo ? "bg-white/[0.03]" : "wl-accent-surface",
          )}
          data-accent={isDemo ? undefined : agent.tint}
        >
          <Phone
            className={cn("w-3.5 h-3.5", isDemo ? "text-zinc-400" : "wl-accent-text")}
            strokeWidth={2.4}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={cn(
                "shrink-0 whitespace-nowrap wl-label font-semibold px-1.5 py-0.5 rounded leading-none",
                isDemo
                  ? "bg-white/8 text-muted/80 border border-white/10"
                  : "bg-brand/15 text-brand border border-brand/30",
              )}
            >
              {isDemo ? "Demo" : "Wireline Team"}
            </span>
            <span className="text-caption font-medium truncate">{agent.name}</span>
          </div>
          <p className="font-display italic text-sm leading-snug text-foreground line-clamp-2 text-balance">
            {agent.role}
          </p>
          <a
            href={`tel:${agent.tel}`}
            className="mt-1 inline-flex min-h-[44px] items-center font-mono text-[var(--wireline-typography-caption-size)] tabular-nums text-foreground underline-offset-2 hover:text-brand hover:underline"
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
      <ShadButton
        type="button"
        disableAnimations
        variant="outline"
        onClick={() => setExpanded((v) => !v)}
        className="w-full h-auto min-h-[48px] justify-between gap-3 rounded-md border-brand/20 bg-brand/5 px-3.5 py-3 text-left hover:bg-brand/10 active:bg-brand/14"
        aria-expanded={expanded}
      >
        <div>
          <p className="text-eyebrow !text-brand">Try live agents</p>
          <p className="text-caption mt-0.5">
            {expanded
              ? `${totalCount} lines — dial from your phone`
              : featured
                ? `Featured: ${featured.name} · ${featured.display}`
                : `${totalCount} lines available`}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 text-brand transition-transform",
            expanded && "rotate-180",
          )}
        />
      </ShadButton>

      {!expanded && featured && <AgentContactCard agent={featured} isDemo={false} />}

      {expanded && (
        <div className="space-y-3 max-h-[min(42vh,380px)] overflow-y-auto scrollbar-hide pr-0.5">
          <div>
            <p className="mb-2 text-eyebrow !text-brand">Wireline agents</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
              {wirelineAgents.map((agent) => (
                <AgentContactCard key={agent.tel} agent={agent} isDemo={false} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-eyebrow !text-amber-800/90">Demo agents</p>
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
