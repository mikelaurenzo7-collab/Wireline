import type { CSSProperties, KeyboardEvent } from "react";

import BotMark from "./BotMark";
import {
  BOT_MARK_CHOICES,
  BOT_MARK_MOTIFS,
  BOT_MARK_PALETTES,
  parseBotMarkKey,
  type BotMarkKey,
  type BotMarkMotif,
  type BotMarkPaletteKey,
} from "../lib/bot-mark";

function choiceFor(motif: BotMarkMotif, paletteKey: BotMarkPaletteKey): BotMarkKey {
  return `${motif}-${paletteKey}`;
}

export function nextAvailableRadioIndex(
  key: string,
  currentIndex: number,
  choiceCount: number,
  isAvailable: (index: number) => boolean,
): number | null {
  if (choiceCount <= 0) return null;
  const navigation = {
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
  } as const;
  const direction = navigation[key as keyof typeof navigation];
  const isHome = key === "Home";
  const isEnd = key === "End";
  if (!direction && !isHome && !isEnd) return null;

  const step = isEnd ? -1 : direction || 1;
  let candidateIndex = isHome
    ? 0
    : isEnd
      ? choiceCount - 1
      : (currentIndex + step + choiceCount) % choiceCount;
  for (let attempt = 0; attempt < choiceCount; attempt += 1) {
    if (isAvailable(candidateIndex)) return candidateIndex;
    candidateIndex = (candidateIndex + step + choiceCount) % choiceCount;
  }
  return null;
}

export default function BotMarkPicker({
  value,
  onChange,
  seed,
  name,
  compact = false,
  disabled = false,
  unavailableKeys = new Set<BotMarkKey>(),
}: {
  value: BotMarkKey;
  onChange: (value: BotMarkKey) => void;
  seed: string;
  name?: string;
  compact?: boolean;
  disabled?: boolean;
  unavailableKeys?: ReadonlySet<BotMarkKey>;
}) {
  const selected = parseBotMarkKey(value);

  function availableForMotif(motif: BotMarkMotif): BotMarkKey | null {
    const preferred = choiceFor(motif, selected.paletteKey);
    if (!unavailableKeys.has(preferred)) return preferred;
    return (
      BOT_MARK_CHOICES.find((choice) => choice.motif === motif && !unavailableKeys.has(choice.key))
        ?.key ?? null
    );
  }

  function availableForPalette(paletteKey: BotMarkPaletteKey): BotMarkKey | null {
    const preferred = choiceFor(selected.motif, paletteKey);
    return unavailableKeys.has(preferred) ? null : preferred;
  }

  function moveRadioSelection(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
    choiceCount: number,
    keyAt: (index: number) => BotMarkKey | null,
  ) {
    const group = event.currentTarget.parentElement;
    const candidateIndex = nextAvailableRadioIndex(event.key, currentIndex, choiceCount, (index) =>
      Boolean(keyAt(index)),
    );
    if (candidateIndex === null) return;
    const nextKey = keyAt(candidateIndex);
    if (!nextKey) return;

    event.preventDefault();
    onChange(nextKey);
    requestAnimationFrame(() => {
      group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[candidateIndex]?.focus();
    });
  }

  return (
    <div className="space-y-3.5" data-bot-mark-picker>
      <fieldset>
        <legend className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Symbol
        </legend>
        <div
          className="grid grid-cols-[repeat(auto-fit,minmax(3.75rem,1fr))] gap-2"
          role="radiogroup"
          aria-label="Bot identity symbol"
        >
          {BOT_MARK_MOTIFS.map((motif, index) => {
            const nextKey = availableForMotif(motif.key);
            const selectedMotif = selected.motif === motif.key;
            const unavailable = !nextKey;
            return (
              <button
                key={motif.key}
                type="button"
                role="radio"
                aria-checked={selectedMotif}
                tabIndex={selectedMotif ? 0 : -1}
                aria-label={`${motif.label} symbol${unavailable ? ", unavailable" : ""}`}
                title={unavailable ? `${motif.label} is in use in every color` : motif.label}
                disabled={disabled || unavailable}
                onClick={() => nextKey && onChange(nextKey)}
                onKeyDown={(event) =>
                  moveRadioSelection(event, index, BOT_MARK_MOTIFS.length, (nextIndex) =>
                    availableForMotif(BOT_MARK_MOTIFS[nextIndex].key),
                  )
                }
                className={`flex min-h-[62px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2 transition-colors wl-focus-ring-halo disabled:cursor-not-allowed disabled:opacity-35 ${
                  selectedMotif
                    ? "border-primary bg-[var(--wireline-color-action-primary-containerStrong)] text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/35 hover:bg-muted/35 hover:text-foreground"
                }`}
              >
                <BotMark
                  seed={seed}
                  name={name}
                  markKey={nextKey || choiceFor(motif.key, selected.paletteKey)}
                  size={compact ? 32 : 36}
                  title={`${motif.label} mark preview`}
                />
                <span className="max-w-full truncate font-mono text-[9px] font-semibold uppercase tracking-[0.07em]">
                  {motif.label}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Color
        </legend>
        <div
          className="grid grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] gap-2"
          role="radiogroup"
          aria-label="Bot identity color"
        >
          {BOT_MARK_PALETTES.map((palette, index) => {
            const nextKey = availableForPalette(palette.key);
            const selectedPalette = selected.paletteKey === palette.key;
            const unavailable = !nextKey;
            const swatchStyle = {
              "--bot-mark-swatch-from": palette.colors.surfaceFrom,
              "--bot-mark-swatch-to": palette.colors.surfaceTo,
            } as CSSProperties;
            return (
              <button
                key={palette.key}
                type="button"
                role="radio"
                aria-checked={selectedPalette}
                tabIndex={selectedPalette ? 0 : -1}
                aria-label={`${palette.label} color${unavailable ? ", unavailable" : ""}`}
                title={
                  unavailable
                    ? `${selected.motif} · ${palette.label} is already in use`
                    : palette.label
                }
                disabled={disabled || unavailable}
                onClick={() => nextKey && onChange(nextKey)}
                onKeyDown={(event) =>
                  moveRadioSelection(event, index, BOT_MARK_PALETTES.length, (nextIndex) =>
                    availableForPalette(BOT_MARK_PALETTES[nextIndex].key),
                  )
                }
                className={`grid aspect-square min-h-11 place-items-center rounded-xl border bg-card transition-colors wl-focus-ring-halo disabled:cursor-not-allowed disabled:opacity-30 ${
                  selectedPalette
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <span
                  className="size-4 rounded-full border border-white/35 bg-[linear-gradient(145deg,var(--bot-mark-swatch-from),var(--bot-mark-swatch-to))] shadow-sm"
                  style={swatchStyle}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </fieldset>

      <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
        {BOT_MARK_CHOICES.find((choice) => choice.key === value)?.label}
      </p>
    </div>
  );
}
