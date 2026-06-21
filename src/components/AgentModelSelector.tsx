/* eslint-disable @typescript-eslint/no-explicit-any -- agent row is an untyped snake_case API shape, shared client types not wired yet. */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cpu, RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";
import { authFetch, readApiJson } from "../lib/api";
import type { VoiceModelOption, VoiceModelSpeed } from "../lib/ai-models";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { Slider } from "./ui/shadcn/Slider";
import { ShadButton } from "./ui/shadcn/ShadButton";

const INHERIT = "__inherit__";
const OPENROUTER_CUSTOM = "__openrouter_custom__";

const SPEED_LABEL: Record<VoiceModelSpeed, string> = {
  fastest: "Fastest",
  fast: "Fast",
  balanced: "Balanced",
  heavy: "Heavy",
};

const SPEED_TONE: Record<VoiceModelSpeed, string> = {
  fastest: "text-foreground bg-ink/[0.06]",
  fast: "text-foreground bg-ink/[0.06]",
  balanced: "text-foreground/65 bg-ink/[0.04]",
  heavy: "text-amber-700 bg-amber-500/10",
};

function optKey(provider: string, model: string): string {
  return `${provider}::${model}`;
}

function toNumOrNull(value: unknown): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isOpenRouterModelId(value: string): boolean {
  const id = value.trim();
  if (!id || id.length > 160 || id.includes("..") || /\s/.test(id)) return false;
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(id);
}

interface AgentModelSelectorProps {
  agent: any;
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
  const [openRouterModelId, setOpenRouterModelId] = useState("");
  const [openRouterError, setOpenRouterError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authFetch("/api/agents/voice-models");
        const result = await readApiJson<CatalogResponse>(response);
        if (cancelled) return;
        if (result.ok) setCatalog(result.data);
        else setLoadFailed(true);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (agent?.llm_provider === "openrouter" && typeof agent?.llm_model === "string") {
      setOpenRouterModelId(agent.llm_model);
    }
  }, [agent?.llm_provider, agent?.llm_model]);

  const options = catalog?.options ?? [];
  const isOpenRouterSelection = agent?.llm_provider === "openrouter";
  const currentValue = useMemo(() => {
    if (!agent?.llm_provider || !agent?.llm_model) return INHERIT;
    if (agent.llm_provider === "openrouter") return OPENROUTER_CUSTOM;
    return optKey(agent.llm_provider, agent.llm_model);
  }, [agent?.llm_provider, agent?.llm_model]);

  const selectedOption = isOpenRouterSelection
    ? options.find((option) => option.provider === "openrouter")
    : options.find((option) => optKey(option.provider, option.model) === currentValue);
  const temperature = toNumOrNull(agent?.llm_temperature);
  const usingDefaultTemperature = temperature == null;

  function commitOpenRouterModel() {
    const model = openRouterModelId.trim();
    if (!isOpenRouterModelId(model)) {
      setOpenRouterError("Use a valid OpenRouter provider/model ID, for example x-ai/grok-4.3 or google/gemini-3.5-flash.");
      return;
    }
    setOpenRouterError(null);
    onCommit({ llm_provider: "openrouter", llm_model: model });
  }

  function handleSelect(value: string) {
    if (value === INHERIT) {
      setOpenRouterError(null);
      onCommit({ llm_provider: null, llm_model: null });
      return;
    }

    if (value === OPENROUTER_CUSTOM) {
      const openRouterOption = options.find((option) => option.provider === "openrouter");
      const initialModel =
        agent?.llm_provider === "openrouter" && typeof agent?.llm_model === "string"
          ? agent.llm_model
          : openRouterOption?.model || "openai/gpt-4o";
      setOpenRouterModelId(initialModel);
      setOpenRouterError(null);
      onCommit({ llm_provider: "openrouter", llm_model: initialModel });
      return;
    }

    const option = options.find((candidate) => optKey(candidate.provider, candidate.model) === value);
    if (!option) return;
    setOpenRouterError(null);
    onCommit({ llm_provider: option.provider, llm_model: option.model });
  }

  if (loadFailed) return null;

  const tenantDefaultLabel = catalog
    ? `Managed default (${catalog.tenantDefaultModel} → Gemini fallback)`
    : "Managed default";

  return (
    <div className="space-y-3 rounded-md border border-ink/[0.08] bg-ink/[0.015] px-3 py-3">
      <div className="flex items-center gap-1.5 text-foreground/55 wl-label">
        <Cpu className="h-2.5 w-2.5 text-brand" />
        Call model
      </div>
      <p className="leading-relaxed wl-micro-meta">
        Managed calls use OpenAI first and retry through Gemini only if OpenAI is unavailable. Choose OpenRouter when this agent needs a specific model.
      </p>

      <Select value={currentValue} onValueChange={handleSelect}>
        <SelectTrigger aria-label="Call model" className="w-full text-sm">
          <SelectValue placeholder={tenantDefaultLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={INHERIT}>{tenantDefaultLabel}</SelectItem>
          {options.map((option) => {
            const value = option.acceptsCustomModelId
              ? OPENROUTER_CUSTOM
              : optKey(option.provider, option.model);
            return (
              <SelectItem key={option.provider} value={value}>
                <span className="flex items-center gap-2">
                  <span>{option.label}</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 font-medium wl-micro-badge", SPEED_TONE[option.speed])}>
                    {SPEED_LABEL[option.speed]}
                  </span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {isOpenRouterSelection && (
        <div className="space-y-1.5 rounded-md border border-ink/[0.08] bg-background/55 p-3">
          <label className="text-foreground/65 wl-label" htmlFor="openrouter-model-id">OpenRouter model ID</label>
          <input
            id="openrouter-model-id"
            value={openRouterModelId}
            onChange={(event) => {
              setOpenRouterModelId(event.target.value);
              setOpenRouterError(null);
            }}
            onBlur={commitOpenRouterModel}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitOpenRouterModel();
              }
            }}
            placeholder="x-ai/grok-4.3"
            className="h-10 w-full rounded-md border border-ink/12 bg-card px-3 font-mono text-xs text-foreground outline-none transition placeholder:text-foreground/45 focus:border-brand focus:ring-4 focus:ring-brand/12"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="leading-relaxed text-foreground/55 wl-micro-meta">
            Use any valid model ID published by OpenRouter. Wireline sends this exact selection and does not silently replace it with the managed OpenAI/Gemini chain.
          </p>
          {openRouterError && <p className="text-xs text-rose-600">{openRouterError}</p>}
        </div>
      )}

      {selectedOption?.note && <p className="leading-relaxed text-foreground/60 wl-micro-meta">{selectedOption.note}</p>}
      {selectedOption?.latencyWarning && (
        <p className="flex items-start gap-1.5 leading-relaxed text-amber-700 wl-micro-meta">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Can add noticeable delay before the agent speaks. Use only when the model trade-off is worth it.
        </p>
      )}

      <div className="space-y-1.5 border-t border-ink/[0.08] pt-1">
        <div className="flex items-center justify-between">
          <label className="text-foreground/55 wl-label">Temperature</label>
          <span className={cn("font-medium wl-micro-badge", usingDefaultTemperature ? "text-foreground/55" : "text-foreground")}>
            {usingDefaultTemperature ? "Default" : (temperature as number).toFixed(2)}
          </span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={usingDefaultTemperature ? 0.5 : (temperature as number)}
          onChange={(event) => onCommit({ llm_temperature: Number(event.target.value).toFixed(2) })}
          className="w-full cursor-pointer accent-brand"
          aria-label="Temperature"
        />
        <div className="flex items-center justify-between">
          <span className="leading-relaxed wl-micro-meta">Lower = focused and consistent. Higher = more varied and expressive.</span>
          <ShadButton
            type="button"
            variant="ghost"
            size="sm"
            disableAnimations
            onClick={() => onCommit({ llm_temperature: null })}
            disabled={usingDefaultTemperature}
            className="h-auto px-0 opacity-80 hover:text-brand disabled:text-foreground/55 wl-label-muted"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Use default
          </ShadButton>
        </div>
      </div>
    </div>
  );
}