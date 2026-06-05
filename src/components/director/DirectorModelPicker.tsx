/**
 * Director composer — Wireline tiers vs OpenRouter model catalog.
 * 
 * Cycle 5 improvements: Stronger focus visibility, better active state contrast,
 * and improved accessibility for daily operator use.
 */
import { useEffect, useMemo, useState } from "react";
import { Cpu, ChevronDown, Loader2, Search } from "lucide-react";
import { authFetch } from "../../lib/api";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/Popover";
import { Input } from "../ui/shadcn/Input";
import {
  WL_APP_CLASSES,
  WL_DIRECTOR_CLASSES,
  DIRECTOR_MODEL_PICKER_COPY,
} from "../../lib/wireline-director-design";
import type { DirectorChatModelSelection } from "../../lib/director-model-selection";
import type { OpenRouterModelOption } from "../../lib/openrouter-models";

type WirelineTier = "auto" | "sonnet" | "opus";

interface ChatModelsResponse {
  preference: DirectorChatModelSelection;
  openRouterEnabled: boolean;
  openRouterRequiresUpgrade?: boolean;
  wirelineTiers: { id: WirelineTier; label: string; description: string }[];
  curated: OpenRouterModelOption[];
  catalog?: OpenRouterModelOption[];
}

function selectionLabel(
  selection: DirectorChatModelSelection,
  models: OpenRouterModelOption[],
): string {
  if (selection.provider === "wireline") {
    if (selection.tier === "auto") return DIRECTOR_MODEL_PICKER_COPY.autoLabel;
    if (selection.tier === "opus") return DIRECTOR_MODEL_PICKER_COPY.opusLabel;
    return DIRECTOR_MODEL_PICKER_COPY.sonnetLabel;
  }
  return models.find((m) => m.id === selection.modelId)?.label ?? selection.modelId;
}

function matchesSearch(model: OpenRouterModelOption, query: string): boolean {
  if (!query) return true;
  const hay = `${model.label} ${model.id} ${model.description}`.toLowerCase();
  return hay.includes(query);
}

function OpenRouterModelRow({
  model,
  active,
  compact,
  onPick,
}: {
  model: OpenRouterModelOption;
  active: boolean;
  compact?: boolean;
  onPick: () => void;
}) {
  return (
    <ShadButton
      type="button"
      variant="ghost"
      disableAnimations
      className={cn(
        "w-full h-auto justify-start text-left rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-brand/60",
        compact ? "px-2.5 py-1.5 text-[11px]" : "px-2.5 py-2 text-[12px]",
        active
          ? "bg-brand/20 text-foreground ring-1 ring-brand/40 font-medium"
          : "hover:bg-muted/70 text-foreground",
      )}
      onClick={onPick}
    >
      <span className="font-medium block truncate">{model.label}</span>
      {!compact && model.description ? (
        <span
          className={cn(
            WL_APP_CLASSES.bodyCaption,
            "block text-muted-foreground mt-0.5 line-clamp-2",
          )}
        >
          {model.description}
        </span>
      ) : compact ? (
        <span
          className={cn(
            WL_DIRECTOR_CLASSES.metaCaption,
            "block text-muted-foreground/80 truncate font-mono mt-0.5",
          )}
        >
          {model.id}
        </span>
      ) : null}
    </ShadButton>
  );
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
  const [search, setSearch] = useState("");
  const [browseAllOpen, setBrowseAllOpen] = useState(false);

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

  useEffect(() => {
    if (!open) {
      setSearch("");
      setBrowseAllOpen(false);
    }
  }, [open]);

  const allModels = useMemo(
    () => catalog?.catalog ?? catalog?.curated ?? [],
    [catalog?.catalog, catalog?.curated],
  );
  const curatedIds = useMemo(
    () => new Set((catalog?.curated ?? []).map((m) => m.id)),
    [catalog?.curated],
  );
  const curated = useMemo(() => catalog?.curated ?? [], [catalog?.curated]);
  const catalogOnly = useMemo(
    () => allModels.filter((m) => !curatedIds.has(m.id)),
    [allModels, curatedIds],
  );

  const searchNorm = search.trim().toLowerCase();
  const filteredCurated = useMemo(
    () => curated.filter((m) => matchesSearch(m, searchNorm)),
    [curated, searchNorm],
  );
  const filteredCatalog = useMemo(
    () => catalogOnly.filter((m) => matchesSearch(m, searchNorm)),
    [catalogOnly, searchNorm],
  );

  useEffect(() => {
    if (searchNorm) setBrowseAllOpen(true);
  }, [searchNorm]);

  const label = useMemo(() => selectionLabel(selection, allModels), [selection, allModels]);

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

  const openRouterReady =
    catalog?.openRouterEnabled && !catalog?.openRouterRequiresUpgrade && curated.length > 0;

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
            "focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
        className="w-[min(100vw-2rem,24rem)] p-0 border-border/60 bg-card/95 backdrop-blur-md"
        role="listbox"
        aria-label="Model selection"
      >
        <div className="p-3 border-b border-border/50">
          <p className="text-[11px] font-medium text-foreground">
            {DIRECTOR_MODEL_PICKER_COPY.label}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
            {DIRECTOR_MODEL_PICKER_COPY.hint}
          </p>
        </div>
        <div className="max-h-[min(58vh,420px)] overflow-y-auto p-2 space-y-3">
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
                  <ShadButton
                    key={tier.id}
                    type="button"
                    variant="ghost"
                    disableAnimations
                    className={cn(
                      "w-full h-auto justify-start text-left rounded-md px-2.5 py-2 text-[12px] transition-colors focus-visible:ring-2 focus-visible:ring-brand/60",
                      active
                        ? "bg-brand/20 text-foreground ring-1 ring-brand/40 font-medium"
                        : "hover:bg-muted/70 text-foreground",
                    )}
                    onClick={() => void persist({ provider: "wireline", tier: tier.id })}
                  >
                    <span className="font-medium">{tier.label}</span>
                    {tier.description ? (
                      <span
                        className={cn(
                          WL_APP_CLASSES.bodyCaption,
                          "block text-muted-foreground mt-0.5",
                        )}
                      >
                        {tier.description}
                      </span>
                    ) : null}
                  </ShadButton>
                );
              })}
            </div>
          </section>

          <section>
            <p className={cn(WL_DIRECTOR_CLASSES.microLabel, "px-2 mb-1.5 text-muted-foreground")}>
              {DIRECTOR_MODEL_PICKER_COPY.openRouterSection}
            </p>
            {catalog?.openRouterRequiresUpgrade ? (
              <p className="text-[10px] text-muted-foreground px-2 py-2 leading-snug">
                {DIRECTOR_MODEL_PICKER_COPY.requiresUpgrade}
            ) : !catalog?.openRouterEnabled ? (
              <p className="text-[10px] text-muted-foreground px-2 py-2 leading-snug">
                {DIRECTOR_MODEL_PICKER_COPY.notConfigured}
            ) : (
              <div className="space-y-2">
                <div className="wl-director-model-popover-sticky -mx-2 px-2 -mt-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={DIRECTOR_MODEL_PICKER_COPY.searchPlaceholder}
                      className="h-8 pl-8 text-[11px] bg-muted/30 border-border/50 focus-visible:ring-2 focus-visible:ring-brand/60"
                      aria-label={DIRECTOR_MODEL_PICKER_COPY.searchPlaceholder}
                    />
                  </div>
                </div>

                {filteredCurated.length > 0 && (
                  <div>
                    <p
                      className={cn(
                        WL_DIRECTOR_CLASSES.microLabel,
                        "px-2 mb-1 text-muted-foreground/90",
                      )}
                    >
                      {DIRECTOR_MODEL_PICKER_COPY.recommendedSection}
                    </p>
                    <div className="space-y-0.5">
                      {filteredCurated.map((model) => (
                        <OpenRouterModelRow
                          key={model.id}
                          model={model}
                          active={
                            selection.provider === "openrouter" && selection.modelId === model.id
                          }
                          onPick={() => void persist({ provider: "openrouter", modelId: model.id })}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {catalogOnly.length > 0 && (
                  <div>
                    <ShadButton
                      type="button"
                      variant="ghost"
                      disableAnimations
                      className={cn(
                        WL_DIRECTOR_CLASSES.microLabel,
                        "w-full h-auto justify-between px-2 py-1.5 rounded-md hover:bg-muted/60 text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand/60",
                      )}
                      onClick={() => setBrowseAllOpen((v) => !v)}
                      aria-expanded={browseAllOpen}
                    >
                      {DIRECTOR_MODEL_PICKER_COPY.browseAll(catalogOnly.length)}
                      <ChevronDown
                        className={cn(
                          "w-3 h-3 shrink-0 transition-transform",
                          browseAllOpen && "rotate-180",
                        )}
                        aria-hidden
                      />
                    </ShadButton>
                    {browseAllOpen && (
                      <div className="space-y-0.5 mt-1 max-h-[min(28vh,200px)] overflow-y-auto pr-0.5">
                        {filteredCatalog.map((model) => (
                          <OpenRouterModelRow
                            key={model.id}
                            model={model}
                            compact
                            active={
                              selection.provider === "openrouter" && selection.modelId === model.id
                            }
                            onPick={() =>
                              void persist({ provider: "openrouter", modelId: model.id })}
                            />
                        ))}
                        {filteredCatalog.length === 0 && searchNorm ? (
                          <p className="text-[10px] text-muted-foreground px-2 py-2">
                            {DIRECTOR_MODEL_PICKER_COPY.noSearchResults}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                {openRouterReady &&
                  searchNorm &&
                  filteredCurated.length === 0 &&
                  filteredCatalog.length === 0 && (
                    <p className="text-[10px] text-muted-foreground px-2 py-2">
                      {DIRECTOR_MODEL_PICKER_COPY.noSearchResults}
                    </p>
                  )}
              </div>
            )}
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
}
