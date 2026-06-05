/**
 * Director composer — Wireline tiers vs OpenRouter model catalog.
 */
import { useEffect, useMemo, useState } from "react";
import { Cpu, ChevronDown, Loader2 } from "lucide-react";
import { authFetch } from "../../lib/api";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/Popover";
import {
  WL_DIRECTOR_CLASSES,
  DIRECTOR_MODEL_PICKER_COPY,
} from "../../lib/wireline-director-design";
import type { DirectorChatModelSelection } from "../../lib/director-model-selection";
import type { OpenRouterModelOption } from "../../lib/openrouter-models";

type WirelineTier = "auto" | "sonnet" | "opus";

interface ChatModelsResponse {
  preference: DirectorChatModelSelection;
  openRouterEnabled: boolean;
  wirelineTiers: { id: WirelineTier; label: string; description: string }[];
  curated: OpenRouterModelOption[];
}

function selectionLabel(
  selection: DirectorChatModelSelection,
  curated: OpenRouterModelOption[],
): string {
  if (selection.provider === "wireline") {
    if (selection.tier === "auto") return DIRECTOR_MODEL_PICKER_COPY.autoLabel;
    if (selection.tier === "opus") return DIRECTOR_MODEL_PICKER_COPY.opusLabel;
    return DIRECTOR_MODEL_PICKER_COPY.sonnetLabel;
  }
  return curated.find((m) => m.id === selection.modelId)?.label ?? selection.modelId;
}

export interface DirectorModelPickerProps {
  selection: DirectorChatModelSelection;
  onChange: (next: DirectorChatModelSelection) => void;
  disabled?: boolean;
}

export function DirectorModelPicker({ selection, onChange, disabled }: DirectorModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<ChatModelsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const r = await authFetch("/api/director/chat-models");
        if (r.ok && !cancelled) {
          setCatalog((await r.json()) as ChatModelsResponse);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const curated = useMemo(() => catalog?.curated ?? [], [catalog]);
  const label = useMemo(() => selectionLabel(selection, curated), [selection, curated]);

  const persist = async (next: DirectorChatModelSelection) => {
    const previous = selection;
    onChange(next);
    setSaving(true);
    try {
      const r = await authFetch("/api/director/chat-model", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: next }),
      });
      if (!r.ok) {
        onChange(previous);
        return;
      }
      setOpen(false);
    } catch {
      onChange(previous);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ShadButton
          type="button"
          variant="ghost"
          size="sm"
          disableAnimations
          disabled={disabled || loading}
          title={DIRECTOR_MODEL_PICKER_COPY.hint}
          aria-label={DIRECTOR_MODEL_PICKER_COPY.hint}
          className={cn(
            WL_DIRECTOR_CLASSES.composerToolChip,
            selection.provider === "openrouter" && WL_DIRECTOR_CLASSES.composerToolChipEngaged,
            "h-auto touch-press rounded-full shadow-none max-w-[140px]",
          )}
        >
          {saving || loading ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
          ) : (
            <Cpu className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="truncate hidden sm:inline">{label}</span>
          <span className="sm:hidden">{DIRECTOR_MODEL_PICKER_COPY.shortLabel}</span>
          <ChevronDown className="w-3 h-3 opacity-60 shrink-0" aria-hidden />
        </ShadButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-[min(100vw-2rem,22rem)] p-0 border-border/60 bg-card/95 backdrop-blur-md"
      >
        <div className="p-3 border-b border-border/50">
          <p className="text-[11px] font-medium text-foreground">
            {DIRECTOR_MODEL_PICKER_COPY.label}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
            {DIRECTOR_MODEL_PICKER_COPY.hint}
          </p>
        </div>
        <div className="max-h-[min(50vh,320px)] overflow-y-auto p-2 space-y-3">
          <section>
            <p className={cn(WL_DIRECTOR_CLASSES.microLabel, "px-2 mb-1.5 text-muted-foreground")}>
              {DIRECTOR_MODEL_PICKER_COPY.wirelineSection}
            </p>
            <div className="space-y-0.5">
              {(
                catalog?.wirelineTiers ?? [
                  {
                    id: "auto" as const,
                    label: DIRECTOR_MODEL_PICKER_COPY.autoLabel,
                    description: "",
                  },
                  {
                    id: "sonnet" as const,
                    label: DIRECTOR_MODEL_PICKER_COPY.sonnetLabel,
                    description: "",
                  },
                  {
                    id: "opus" as const,
                    label: DIRECTOR_MODEL_PICKER_COPY.opusLabel,
                    description: "",
                  },
                ]
              ).map((tier) => {
                const active = selection.provider === "wireline" && selection.tier === tier.id;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    className={cn(
                      "w-full text-left rounded-lg px-2.5 py-2 text-[12px] transition-colors",
                      active ? "bg-brand/12 text-brand-deep" : "hover:bg-muted/60",
                    )}
                    onClick={() => void persist({ provider: "wireline", tier: tier.id })}
                  >
                    <span className="font-medium">{tier.label}</span>
                    {tier.description ? (
                      <span className="block text-[10px] text-muted-foreground mt-0.5">
                        {tier.description}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className={cn(WL_DIRECTOR_CLASSES.microLabel, "px-2 mb-1.5 text-muted-foreground")}>
              {DIRECTOR_MODEL_PICKER_COPY.openRouterSection}
            </p>
            {!catalog?.openRouterEnabled ? (
              <p className="text-[10px] text-muted-foreground px-2 py-2 leading-snug">
                {DIRECTOR_MODEL_PICKER_COPY.notConfigured}
              </p>
            ) : (
              <div className="space-y-0.5">
                {curated.map((model) => {
                  const active =
                    selection.provider === "openrouter" && selection.modelId === model.id;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      className={cn(
                        "w-full text-left rounded-lg px-2.5 py-2 text-[12px] transition-colors",
                        active ? "bg-brand/12 text-brand-deep" : "hover:bg-muted/60",
                      )}
                      onClick={() => void persist({ provider: "openrouter", modelId: model.id })}
                    >
                      <span className="font-medium">{model.label}</span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                        {model.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
}
