import { defaultBotMarkKey, type BotMarkKey } from "./bot-mark";

export type StudioSetupValues = {
  tone: string;
  markKey: BotMarkKey;
  greeting: string;
  knowledge: string;
  loadedPersonality: string | null;
};
type EditableValues = Omit<StudioSetupValues, "loadedPersonality">;
type SetupSnapshot = { values: StudioSetupValues; dirty: boolean; saving: boolean };
type Entry = {
  saved: StudioSetupValues;
  edits: Partial<EditableValues>;
  confirmed: Partial<Record<keyof StudioSetupValues, { revision: number; value: unknown }>>;
  snapshot: SetupSnapshot;
};

/** Private, account-scoped memory owned by the mounted Studio workspace. */
export function createStudioSetupDrafts(ownerId: string | null) {
  const entries = new Map<string, Entry>();
  const listeners = new Map<string, Set<() => void>>();
  let revision = 0;

  const entryFor = (agentId: string): Entry => {
    let entry = entries.get(agentId);
    if (!entry) {
      const saved: StudioSetupValues = {
        tone: "Clear",
        markKey: defaultBotMarkKey(agentId),
        greeting: "",
        knowledge: "",
        loadedPersonality: null,
      };
      entry = {
        saved,
        edits: {},
        confirmed: {},
        snapshot: { values: saved, dirty: false, saving: false },
      };
      entries.set(agentId, entry);
    }
    return entry;
  };
  const publish = (agentId: string, entry: Entry) => {
    entry.snapshot = {
      values: { ...entry.saved, ...entry.edits },
      dirty: Object.keys(entry.edits).length > 0,
      saving: entry.snapshot.saving,
    };
    listeners.get(agentId)?.forEach((listener) => listener());
  };

  return {
    ownerId,
    revision: () => revision,
    read: (agentId: string) => entryFor(agentId).snapshot,
    subscribe(agentId: string, listener: () => void) {
      const group = listeners.get(agentId) ?? new Set<() => void>();
      listeners.set(agentId, group);
      group.add(listener);
      return () => {
        group.delete(listener);
      };
    },
    edit<K extends keyof EditableValues>(agentId: string, field: K, value: EditableValues[K]) {
      const entry = entryFor(agentId);
      if (value === entry.saved[field]) delete entry.edits[field];
      else entry.edits[field] = value;
      publish(agentId, entry);
    },
    seedKnowledge(agentId: string, knowledge: string) {
      const entry = entryFor(agentId);
      if (knowledge && entry.edits.knowledge === undefined && !entry.snapshot.saving) {
        entry.edits.knowledge = knowledge;
        publish(agentId, entry);
      }
    },
    load(agentId: string, values: StudioSetupValues, startedRevision: number) {
      const entry = entryFor(agentId);
      // A response started before a successful save cannot undo that save.
      const newer = Object.fromEntries(
        Object.entries(entry.confirmed)
          .filter(([, receipt]) => receipt.revision > startedRevision)
          .map(([field, receipt]) => [field, receipt.value]),
      );
      entry.saved = { ...values, ...newer };
      publish(agentId, entry);
    },
    confirm(agentId: string, expected: Partial<EditableValues>, saved: Partial<StudioSetupValues>) {
      const entry = entryFor(agentId);
      const currentRevision = ++revision;
      for (const [field, value] of Object.entries(saved)) {
        entry.confirmed[field as keyof StudioSetupValues] = { revision: currentRevision, value };
      }
      entry.saved = { ...entry.saved, ...saved };
      for (const field of Object.keys(expected) as Array<keyof EditableValues>) {
        // A late save must never clear a newer edit made after it started.
        if (entry.edits[field] === expected[field]) delete entry.edits[field];
      }
      publish(agentId, entry);
    },
    beginSave(agentId: string) {
      const entry = entryFor(agentId);
      if (entry.snapshot.saving) return false;
      entry.snapshot.saving = true;
      publish(agentId, entry);
      return true;
    },
    endSave(agentId: string) {
      const entry = entryFor(agentId);
      entry.snapshot.saving = false;
      publish(agentId, entry);
    },
  };
}

export type StudioSetupDrafts = ReturnType<typeof createStudioSetupDrafts>;
