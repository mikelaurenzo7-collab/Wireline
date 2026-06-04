/**
 * Grounded web research citations on Director replies.
 */
import { ExternalLink, Globe } from "lucide-react";
import { LIVE_FEED_LABELS } from "../../lib/wireline-director-design";

export interface ResearchSource {
  title?: string;
  uri?: string;
}

export function DirectorResearchSources({ sources }: { sources: ResearchSource[] }) {
  if (!sources.length) return null;

  return (
    <div className="mt-2 w-full rounded-md border border-brand/12 bg-brand/[0.03] px-2.5 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <Globe className="w-3.5 h-3.5 text-brand shrink-0" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-brand/80 font-semibold">
          {LIVE_FEED_LABELS.researchEyebrow}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground/70 tabular-nums">
          {sources.length} source{sources.length !== 1 ? "s" : ""}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {sources.map((s, i) => (
          <li key={`${s.uri || s.title}-${i}`}>
            {s.uri ? (
              <a
                href={s.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-2 text-[11px] text-brand hover:text-brand/80 transition-colors"
              >
                <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-60 group-hover:opacity-100" />
                <span className="underline-offset-2 group-hover:underline line-clamp-2">
                  {s.title || s.uri}
                </span>
              </a>
            ) : (
              <span className="text-[11px] text-muted-foreground line-clamp-2">
                {s.title || "Source"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
