import type { VoiceOption } from "./voice-catalog";

/** Use-case labels for voice gallery grouping (not alphabetical). */
export const VOICE_USE_CASE_GROUPS: Array<{
  id: string;
  label: string;
  description: string;
  match: (voice: VoiceOption) => boolean;
}> = [
  {
    id: "front-desk",
    label: "Warm front desk",
    description: "Reception, scheduling, and calm intake",
    match: (v) => /sarah|emily|grace|warm|friendly|reception|front|ara|sal/i.test(v.name),
  },
  {
    id: "sales",
    label: "Sharp sales concierge",
    description: "Qualification, follow-up, and confident tone",
    match: (v) => /james|marcus|alex|sales|concierge|direct|rex|leo/i.test(v.name),
  },
  {
    id: "assistant",
    label: "Discreet personal assistant",
    description: "Private errands, appointments, and low-key calls",
    match: (v) => /assistant|personal|quiet|soft|maya|luna|eve/i.test(v.name),
  },
];

export function groupVoicesByUseCase(voices: VoiceOption[]): Array<{
  group: (typeof VOICE_USE_CASE_GROUPS)[number];
  voices: VoiceOption[];
}> {
  const assigned = new Set<string>();
  const groups = VOICE_USE_CASE_GROUPS.map((group) => {
    const matched = voices.filter((voice) => {
      const key = `${voice.id}:${voice.provider}`;
      if (assigned.has(key)) return false;
      if (group.match(voice)) {
        assigned.add(key);
        return true;
      }
      return false;
    });
    return { group, voices: matched };
  });
  const other = voices.filter((voice) => !assigned.has(`${voice.id}:${voice.provider}`));
  if (other.length) {
    groups.push({
      group: {
        id: "other",
        label: "More voices",
        description: "Additional catalog options",
        match: () => false,
      },
      voices: other,
    });
  }
  return groups.filter((g) => g.voices.length > 0);
}

export const TONE_PRESETS = [
  { id: "warm", label: "Warm", content: "Speak in a warm, patient, and reassuring tone." },
  { id: "direct", label: "Direct", content: "Speak in a direct, concise, and efficient tone." },
  {
    id: "balanced",
    label: "Balanced",
    content: "Speak in a calm, professional, and helpful tone.",
  },
] as const;
