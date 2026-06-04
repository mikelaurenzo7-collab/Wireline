import React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../ui/shadcn/Select";

export type VoiceOption = { id: string; provider?: string; name: string };

export function resolveVoiceSelectValue(
  voiceId: string | null | undefined,
  catalog: VoiceOption[],
) {
  if (!voiceId) return "inherit";
  return catalog.some((v) => v.id === voiceId) ? voiceId : "custom";
}

export function VoiceFieldSelect({
  label,
  value,
  catalog,
  onSelect,
  allowInherit,
  showCustomOption,
  onCustomMode,
}: {
  label: string;
  value: string | null | undefined;
  catalog: VoiceOption[];
  onSelect: (voiceId: string | null, provider?: string) => void;
  allowInherit?: boolean;
  showCustomOption?: boolean;
  onCustomMode?: () => void;
}) {
  const selectValue = allowInherit && !value ? "inherit" : resolveVoiceSelectValue(value, catalog);
  return (
    <div className="space-y-1.5">
      <label className="text-[9px] uppercase tracking-[0.3em] text-ink/40">{label}</label>
      <Select
        value={selectValue}
        onValueChange={(val) => {
          if (val === "inherit") {
            onSelect(null);
            return;
          }
          if (val === "custom") {
            onCustomMode?.();
            return;
          }
          const voiceData = catalog.find((v) => v.id === val);
          onSelect(val, voiceData?.provider || "11labs");
        }}
      >
        <SelectTrigger
          aria-label={label}
          className="w-full text-xs bg-black/5 border border-black/10 rounded-md pl-2.5 py-1.5 text-ink h-auto"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowInherit && <SelectItem value="inherit">Same as primary</SelectItem>}
          <SelectGroup>
            <SelectLabel>Premium</SelectLabel>
            {catalog.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectGroup>
          {!allowInherit && showCustomOption && (
            <SelectItem value="custom">Custom voice ID</SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
