import { RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";
import OpenRouterModelPicker from "./OpenRouterModelPicker";
import { Slider } from "./ui/shadcn/Slider";
import { ShadButton } from "./ui/shadcn/ShadButton";

const INHERIT = "__inherit__";

function toNumOrNull(value: unknown): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function runtimeFromAgent(
  agent: { llm_provider?: string | null; llm_model?: string | null } | null | undefined,
): "managed" | string {
  if (!agent?.llm_provider || !agent?.llm_model) return "managed";
  if (agent.llm_provider === "openrouter") return agent.llm_model;
  if (agent.llm_provider === "openai") return `openai/${agent.llm_model}`;
  if (agent.llm_provider === "google") return `google/${agent.llm_model}`;
  return "managed";
}

interface AgentModelSelectorProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- agent row is an untyped snake_case API shape
  agent: any;
  onCommit: (patch: Record<string, unknown>) => void;
}

export default function AgentModelSelector({ agent, onCommit }: AgentModelSelectorProps) {
  const runtimeValue = runtimeFromAgent(agent);
  const temperature = toNumOrNull(agent?.llm_temperature);
  const usingDefaultTemperature = temperature == null;

  function handleModelChange(value: "managed" | string) {
    if (value === "managed") {
      onCommit({ llm_provider: null, llm_model: null });
      return;
    }
    onCommit({ llm_provider: "openrouter", llm_model: value });
  }

  return (
    <div className="space-y-3 rounded-md border border-ink/[0.08] bg-ink/[0.015] px-3 py-3">
      <p className="leading-relaxed wl-micro-meta">
        Managed calls use OpenAI first and retry through Gemini only if OpenAI is unavailable.
        Choose any OpenRouter model (including Grok variants) when this agent needs distinctive
        capabilities and unique reasoning.
      </p>

      <OpenRouterModelPicker value={runtimeValue} onChange={handleModelChange} />

      <div className="space-y-1.5 border-t border-ink/[0.08] pt-1">
        <div className="flex items-center justify-between">
          <label className="text-foreground/55 wl-label">Temperature</label>
          <span
            className={cn(
              "font-medium wl-micro-badge",
              usingDefaultTemperature ? "text-foreground/55" : "text-foreground",
            )}
          >
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
          <span className="leading-relaxed wl-micro-meta">
            Lower = focused and consistent. Higher = more varied and expressive.
          </span>
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

export { INHERIT };
