import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Cpu, Loader2 } from "lucide-react";
import { authFetch, readApiJson } from "../lib/api";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/shadcn/Popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/shadcn/Command";

export type OpenRouterModelEntry = {
  id: string;
  label: string;
  description?: string;
  category?: string;
};

type CatalogResponse = {
  enabled?: boolean;
  models: OpenRouterModelEntry[];
};

const MANAGED = "__managed__";

function labelFor(value: "managed" | string, models: OpenRouterModelEntry[]) {
  if (value === "managed") return "Managed default";
  return models.find((model) => model.id === value)?.label ?? value.split("/").pop() ?? value;
}

export default function OpenRouterModelPicker({
  value,
  onChange,
  disabled = false,
  compact = false,
  className,
}: {
  value: "managed" | string;
  onChange: (value: "managed" | string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<OpenRouterModelEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authFetch("/api/agents/openrouter-models");
        const result = await readApiJson<CatalogResponse>(response);
        if (!cancelled && result.ok) setModels(result.data.models ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const curated = useMemo(
    () => models.filter((model) => model.category === "wireline_recommended"),
    [models],
  );
  const catalog = useMemo(
    () => models.filter((model) => model.category !== "wireline_recommended"),
    [models],
  );

  const selectedLabel = labelFor(value, models);
  const triggerClass = compact
    ? "inline-flex h-8 max-w-[min(14rem,calc(100vw-8rem))] items-center gap-1.5 rounded-lg border border-border bg-card px-2 text-[10px] font-semibold text-muted-foreground outline-none transition-colors hover:border-foreground/20 focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/8 disabled:opacity-50"
    : "inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground outline-none transition-colors hover:border-foreground/20 focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/8 disabled:opacity-50";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled || loading}>
        <button type="button" aria-label="Choose model" className={cn(triggerClass, className)}>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{loading ? "Loading models…" : selectedLabel}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Search OpenRouter models…" />
          <CommandList className="max-h-[min(360px,50vh)]">
            <CommandEmpty>No models found.</CommandEmpty>
            <CommandGroup heading="Wireline default">
              <CommandItem
                value="managed default openai gemini"
                onSelect={() => {
                  onChange("managed");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn("h-4 w-4", value === "managed" ? "opacity-100" : "opacity-0")}
                />
                <span className="min-w-0">
                  <span className="block font-medium">Managed default</span>
                  <span className="block text-xs text-muted-foreground">
                    OpenAI first · Gemini fallback
                  </span>
                </span>
              </CommandItem>
            </CommandGroup>
            {curated.length ? (
              <CommandGroup heading="Recommended">
                {curated.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={`${model.label} ${model.id}`}
                    onSelect={() => {
                      onChange(model.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("h-4 w-4", value === model.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{model.label}</span>
                      {model.description ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {model.description}
                        </span>
                      ) : (
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">
                          {model.id}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {catalog.length ? (
              <CommandGroup heading={`All models (${catalog.length})`}>
                {catalog.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={`${model.label} ${model.id}`}
                    onSelect={() => {
                      onChange(model.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("h-4 w-4", value === model.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{model.label}</span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {model.id}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { MANAGED };
