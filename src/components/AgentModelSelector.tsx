/* eslint-disable @typescript-eslint/no-explicit-any -- agent row is an untyped snake_case API shape, shared client types not wired yet. */
/**
 * AgentModelSelector — per-agent reasoning model + temperature picker for the
 * Agent Studio. Reads the curated, env-gated VOICE_MODEL_CATALOG from
 * `/api/agents/voice-models` (only providers whose key is configured appear),
 * and writes the per-agent override columns:
 *
 *   llm_provider     (null → inherit tenant default)
 *   llm_model        (null → inherit tenant default)
 *   llm_temperature  (null → archetype default; clamped to [0,1] server-side)
 *
 * Heavy / proxy models (Opus, OpenRouter) carry a latency note so operators
 * see the trade-off before they slow their own live calls. Commit semantics
 * match VoiceFineTuningPanel: optimistic local patch on change, server commit
 * on the same patch (the picker is low-frequency, so we commit on select).
 */
import { useEffect, useMemo, useState } from "react";
import { Cpu, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";
import { authFetch, readApiJson } from "../lib/api";
import type { VoiceModelOption, VoiceModelSpeed } from "../lib/claude-models";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { Slider } from "./ui/shadcn/Slider";
import { ShadButton } from "./ui/shadcn/ShadButton";

const INHERIT = "__inherit__";

const SPEED_LABEL: Record<VoiceModelSpeed, string> = {
  fastest: "Fastest",
  fast: "Fast",
  balanced: "Balanced",
  heavy: "Heavy",
};

const SPEED_TONE: Record<VoiceModelSpeed, string> = {
  fastest: "text-emerald-600 bg-emerald-500/10",
  fast: "text-emerald-600 bg-emerald-500/10",
  balanced: "text-foreground/55 bg-ink/[0.05]",
  heavy: "text-amber-600 bg-amber-500/10",
};

/** Stable key for a catalog option (provider + model). */
function optKey(provider: string, model: string): string {
  return `${provider}::${model}`;
}

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface AgentModelSelectorProps {
  agent: any;
  /** Commit to the server (PUT /api/agents/:id). */
  onCommit: (patch: Record<string, unknown>) => void;
}

interface CatalogResponse {
  options: VoiceModelOption[];
  tenantDefaultProvider: string;
  tenantDefaultModel: string;
}

export default function AgentModelSelector({ agent, onCommit }: AgentModelSelectorProps) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await authFetch("/api/agents/voice-models");
        const out = await readApiJson<CatalogResponse>(r);
        if (cancelled) return;
        if (out.ok) setCatalog(out.data);
        else setLoadFailed(true);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = catalog?.options ?? [];

  // Current selection: match the saved override against the catalog. An
  // override the catalog no longer offers (key pulled) still shows its raw id.
  const currentValue = useMemo(() => {
    if (!agent?.llm_provider || !agent?.llm_model) return INHERIT;
    return optKey(agent.llm_provider, agent.llm_model);
  }, [agent?.llm_provider, agent?.llm_model]);

  const selectedOption = options.find((o) => optKey(o.provider, o.model) === currentValue);

  const temp = toNumOrNull(agent?.llm_temperature);
  const usingDefaultTemp = temp == null;

  const handleSelect = (value: string) => {
    if (value === INHERIT) {
      onCommit({ llm_provider: null, llm_model: null });
      return;
    }
    const opt = options.find((o) => optKey(o.provider, o.model) === value);
    if (!opt) return;
    onCommit({ llm_provider: opt.provider, llm_model: opt.model });
  };

  if (loadFailed) return null;

  const tenantDefaultLabel = catalog
    ? `Tenant default (${catalog.tenantDefaultModel})`
    : "Tenant default";

  return (
    <div className="rounded-md border border-ink/[0.08] bg-ink/[0.015] px-3 py-3 space-y-3">
      <div className="flex items-center gap-1.5 wl-label text-foreground/55">
        <Cpu className="w-2.5 h-2.5 text-brand" />
        Reasoning model
      </div>
      <p className="wl-micro-meta leading-relaxed">
        The brain behind this agent's live calls. Leave on the tenant default unless you want a
        specific model — heavier picks are flagged for call latency.
      </p>

      <Select value={currentValue} onValueChange={handleSelect}>
        <SelectTrigger aria-label="Reasoning model" className="w-full text-sm">
          <SelectValue placeholder={tenantDefaultLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={INHERIT}>{tenantDefaultLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={optKey(o.provider, o.model)} value={optKey(o.provider, o.model)}>
              <span className="flex items-center gap-2">
                <span>{o.label}</span>
                <span
                  className={cn(
                    "wl-micro-badge px-1.5 py-0.5 rounded-full font-medium",
                    SPEED_TONE[o.speed],
                  )}
                >
                  {SPEED_LABEL[o.speed]}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedOption?.note && (
        <p className="wl-micro-meta leading-relaxed text-foreground/60">{selectedOption.note}</p>
      )}
      {selectedOption?.latencyWarning && (
        <p className="wl-micro-meta leading-relaxed text-amber-600 flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          Can add noticeable delay before the agent speaks — best off the live wire.
        </p>
      )}

      {/* Temperature — null inherits the archetype's tuned default. */}
      <div className="space-y-1.5 pt-1 border-t border-ink/[0.08]">
        <div className="flex items-center justify-between">
          <label className="wl-label text-foreground/55">Temperature</label>
          <span
            className={cn(
              "wl-micro-badge font-medium",
              usingDefaultTemp ? "text-foreground/55" : "text-foreground",
            )}
          >
            {usingDefaultTemp ? "Default" : (temp as number).toFixed(2)}
          </span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={usingDefaultTemp ? 0.5 : (temp as number)}
          onChange={(e) => onCommit({ llm_temperature: Number(e.target.value).toFixed(2) })}
          className="w-full accent-brand cursor-pointer"
          aria-label="Temperature"
        />
        <div className="flex items-center justify-between">
          <span className="wl-micro-meta leading-relaxed">
            Lower = focused and consistent. Higher = more varied and expressive.
          </span>
          <ShadButton
            type="button"
            variant="ghost"
            size="sm"
            disableAnimations
            onClick={() => onCommit({ llm_temperature: null })}
            disabled={usingDefaultTemp}
            className="h-auto px-0 wl-label-muted opacity-80 hover:text-brand disabled:text-foreground/55"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            Use default
          </ShadButton>
        </div>
      </div>
    </div>
  );
}
