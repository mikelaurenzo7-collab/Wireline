/**
 * Grounded web research citations on Director replies.
 */
import { WL_DIRECTOR_CLASSES } from "../../lib/wireline-design-system";
import { LIVE_FEED_LABELS } from "../../lib/director-copy";
import { ExternalLink, Globe } from "lucide-react";

import { cn } from "../../lib/utils";
import { safeExternalHref } from "../../lib/safe-external-url";

export interface ResearchSource {
  title?: string;
  uri?: string;
}

export function DirectorResearchSources({ sources }: { sources: ResearchSource[] }) {
  if (!sources.length) return null;

  return (
    <div
      className={cn(
        "mt-2 w-full rounded-md border px-2.5 py-2 space-y-1.5",
        WL_DIRECTOR_CLASSES.researchSources,
      )}
    >
      <div className="flex items-center gap-2">
        <Globe className="w-3.5 h-3.5 text-brand shrink-0" />
        <span className={cn("wl-label text-brand/80")}>{LIVE_FEED_LABELS.researchEyebrow}</span>
        <span className="wl-micro-badge font-mono text-muted-foreground tabular-nums">
          {sources.length} source{sources.length !== 1 ? "s" : ""}
        </span>
      </div>
      <ResearchSourceList sources={sources} />
    </div>
  );
}

/** Bare citation list — reused inside the Turn Ledger sources stratum. */
export function ResearchSourceList({ sources }: { sources: ResearchSource[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {sources.map((s, i) => {
        const href = safeExternalHref(s.uri);
        return (
          <li key={`${s.uri || s.title}-${i}`}>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-2 wl-micro-meta text-brand hover:text-brand/80 transition-colors"
              >
                <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-60 group-hover:opacity-100" />
                <span className="underline-offset-2 group-hover:underline line-clamp-2">
                  {s.title || href}
                </span>
              </a>
            ) : (
              <span className="wl-micro-meta--muted line-clamp-2">
                {s.title || s.uri || "Source"}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
