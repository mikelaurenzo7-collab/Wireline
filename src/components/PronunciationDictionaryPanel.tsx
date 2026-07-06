/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
/**
 * Pronunciation Dictionary — Account Holder-side jargon management surface.
 *
 * Lives under Admin → Pronunciation. Lets account holders in regulated
 * verticals (medical, legal, real estate) drive how the AI receptionist
 * voices industry terms: "HVAC" → "H-V-A-C", "ACL" → "A-C-L"
 * (not "ackle"), "deposition" → "dep-uh-zish-un".
 *
 * Two kinds of rules:
 *   - alias    — re-spell the word ("HVAC" → "H-V-A-C")
 *   - phoneme  — feed an IPA string for surgical control
 *                (used for medical/legal terms)
 *
 * Each save POSTs to /api/pronunciation-dicts, which syncs to
 * ElevenLabs and stamps the dictionary's EL ID + version on the
 * row. The Vapi assistant factory reads active dictionaries when
 * building per-call configs so playback applies them automatically.
 */
import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, Plus, Trash2, BookOpen, AlertTriangle, Save } from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { InlineEmpty } from "./ui/InlineEmpty";
import { OPS_TRAINING_PANEL } from "../lib/wireline-ops-design";
import { Input } from "./ui/shadcn/Input";
import { Checkbox } from "./ui/shadcn/Checkbox";
import { EmptyState } from "./ui/EmptyState";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import { ShadButton } from "./ui/shadcn/ShadButton";

interface DictEntry {
  from: string;
  to: string;
  kind: "alias" | "phoneme";
}

interface PronunciationDict {
  id: string;
  name: string;
  entries: DictEntry[];
  active: boolean;
  elevenlabsDictionaryId: string | null;
  elevenlabsVersionId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

function blankEntry(): DictEntry {
  return { from: "", to: "", kind: "alias" };
}

export default function PronunciationDictionaryPanel() {
  const { error: toastError, success: toastSuccess } = useToast();
  const [dicts, setDicts] = useState<PronunciationDict[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean>(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Inline create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEntries, setNewEntries] = useState<DictEntry[]>([blankEntry()]);
  const [creating, setCreating] = useState(false);

  // Local drafts: keyed by dict id, lets the Account Holder edit a row
  // without an immediate save round-trip.
  const [drafts, setDrafts] = useState<Record<string, DictEntry[]>>({});

  async function loadDicts() {
    setLoading(true);
    try {
      const r = await authFetch("/api/pronunciation-dicts");
      if (!r.ok) throw new Error("Failed to load");
      const data = await r.json();
      const list: PronunciationDict[] = (data.dictionaries || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        entries: Array.isArray(d.entries) ? d.entries : [],
        active: !!d.active,
        elevenlabsDictionaryId: d.elevenlabsDictionaryId ?? null,
        elevenlabsVersionId: d.elevenlabsVersionId ?? null,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));
      setDicts(list);
      // Seed drafts from server entries so editing has a starting point.
      const draftMap: Record<string, DictEntry[]> = {};
      for (const d of list) draftMap[d.id] = d.entries.length ? d.entries : [blankEntry()];
      setDrafts(draftMap);
      setConfigured(data.configured !== false);
    } catch {
      toastError("Couldn't load pronunciation dictionaries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDicts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time fetch on mount
  }, []);

  function addDraftRow(dictId: string) {
    setDrafts((prev) => ({
      ...prev,
      [dictId]: [...(prev[dictId] || []), blankEntry()],
    }));
  }

  function removeDraftRow(dictId: string, idx: number) {
    setDrafts((prev) => ({
      ...prev,
      [dictId]: (prev[dictId] || []).filter((_, i) => i !== idx),
    }));
  }

  async function saveDict(dict: PronunciationDict) {
    const entries = (drafts[dict.id] || []).filter((e) => e.from.trim() && e.to.trim());
    setSavingId(dict.id);
    try {
      const r = await authFetch(`/api/pronunciation-dicts/${encodeURIComponent(dict.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      toastSuccess("Saved", `${entries.length} ${entries.length === 1 ? "rule" : "rules"} synced`);
      await loadDicts();
    } catch (e: any) {
      toastError("Save failed", e?.message || "Try again");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(dict: PronunciationDict) {
    try {
      const r = await authFetch(`/api/pronunciation-dicts/${encodeURIComponent(dict.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !dict.active }),
      });
      if (!r.ok) throw new Error();
      await loadDicts();
    } catch {
      toastError("Couldn't update");
    }
  }

  async function deleteDict(dict: PronunciationDict) {
    if (!confirm(`Delete "${dict.name}"? Agents using it will stop applying these rules.`)) {
      return;
    }
    try {
      const r = await authFetch(`/api/pronunciation-dicts/${encodeURIComponent(dict.id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error();
      toastSuccess("Dictionary deleted");
      await loadDicts();
    } catch {
      toastError("Delete failed");
    }
  }

  async function createDict(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      toastError("Name required");
      return;
    }
    const entries = newEntries.filter((r) => r.from.trim() && r.to.trim());
    setCreating(true);
    try {
      const r = await authFetch("/api/pronunciation-dicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), entries }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Create failed");
      toastSuccess("Dictionary created", `${entries.length} starter rules synced`);
      setShowCreate(false);
      setNewName("");
      setNewEntries([blankEntry()]);
      await loadDicts();
    } catch (err: any) {
      toastError("Create failed", err?.message || "Try again");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto">
      <div>
        <h2 className="font-display italic text-2xl text-foreground mb-1">Pronunciation</h2>
        <p className="text-[var(--wireline-typography-caption-size)] text-muted leading-relaxed">
          Teach your agents to say industry jargon the way humans say it. "HVAC" reads as "H-V-A-C",
          "ACL" gets spelled out, and you can use IPA phonemes for surgical control of medical or
          legal terms. Active dictionaries apply to every call your agents take.
        </p>
      </div>

      {!configured && (
        <div className="rounded-md border border-brand/30 bg-brand/5 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
          <p className="text-[var(--wireline-typography-caption-size)] text-brand/80 leading-relaxed">
            Voice playback isn't connected yet. Pronunciation dictionaries will sync to your agents'
            voices once it's set up.
          </p>
        </div>
      )}

      {/* Create CTA / form */}
      {!showCreate ? (
        <ShadButton
          type="button"
          variant="outline"
          disableAnimations
          onClick={() => setShowCreate(true)}
          className="w-full h-auto rounded-md border-2 border-dashed border-brand/30 bg-brand/5 hover:bg-brand/8 hover:border-brand/50 py-6 flex-col gap-2"
        >
          <BookOpen className="w-5 h-5 text-brand" />
          <span className="text-[var(--wireline-typography-caption-size)] text-brand font-medium">
            New pronunciation dictionary
          </span>
        </ShadButton>
      ) : (
        <form
          onSubmit={createDict}
          className="rounded-md border border-border bg-card p-5 space-y-4"
        >
          <div>
            <h3 className="font-display italic text-lg text-foreground">New dictionary</h3>
            <p className="text-[var(--wireline-typography-overline-size)] text-muted leading-relaxed mt-1">
              Group rules by vertical, agent persona, or campaign. You can edit rules anytime.
            </p>
          </div>

          <div>
            <label htmlFor="dict-name" className="block wl-label text-muted mb-1.5">
              Dictionary name
            </label>
            <Input
              id="dict-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              minLength={1}
              maxLength={80}
              placeholder="e.g. HVAC service terms"
              className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-[var(--wireline-typography-caption-size)] text-foreground outline-none focus:border-brand/40"
            />
          </div>

          <EntryEditor
            entries={newEntries}
            onChange={setNewEntries}
            onAddRow={() => setNewEntries((prev) => [...prev, blankEntry()])}
            onRemoveRow={(idx) => setNewEntries((prev) => prev.filter((_, i) => i !== idx))}
          />

          <div className="flex items-center gap-2">
            <ShadButton
              type="submit"
              variant="editorial"
              disableAnimations
              disabled={creating || newName.trim().length < 1}
              className="flex-1 rounded-full text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.28em] py-2.5"
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {creating ? "Creating…" : "Create dictionary"}
            </ShadButton>
            <ShadButton
              type="button"
              variant="ghost"
              disableAnimations
              onClick={() => {
                setShowCreate(false);
                setNewName("");
                setNewEntries([blankEntry()]);
              }}
              disabled={creating}
              className="rounded-full text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.28em] text-muted"
            >
              Cancel
            </ShadButton>
          </div>
        </form>
      )}

      {/* Dictionary list */}
      <div className="space-y-2">
        <p className="wl-label-muted">Your dictionaries · {dicts.length}</p>
        {loading ? (
          <ClientRouteLoading
            icon={<BookOpen className="w-6 h-6" />}
            label="Loading dictionaries"
            className="py-10"
          />
        ) : dicts.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No dictionaries"
          />
        ) : (
          dicts.map((dict) => (
            <motion.div
              key={dict.id}
              layout
              className="rounded-md border border-border bg-card p-4 space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--wireline-typography-caption-size)] font-medium text-foreground truncate">
                    {dict.name}
                  </p>
                  <p className="wl-label-muted/70">
                    {dict.entries.length} {dict.entries.length === 1 ? "rule" : "rules"}
                    {dict.elevenlabsDictionaryId ? " · synced" : " · draft"}
                  </p>
                </div>
                <label className="flex items-center gap-2 wl-label-muted cursor-pointer">
                  <Checkbox
                    checked={dict.active}
                    onChange={() => toggleActive(dict)}
                    className="w-3.5 h-3.5 accent-brand"
                  />
                  Active
                </label>
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  disableAnimations
                  onClick={() => deleteDict(dict)}
                  className="shrink-0 w-8 h-8 rounded-md text-muted hover:text-rose-600 hover:bg-rose-500/8"
                  aria-label={`Delete ${dict.name}`}
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </ShadButton>
              </div>

              <EntryEditor
                entries={drafts[dict.id] || []}
                onChange={(next) => setDrafts((prev) => ({ ...prev, [dict.id]: next }))}
                onAddRow={() => addDraftRow(dict.id)}
                onRemoveRow={(idx) => removeDraftRow(dict.id, idx)}
              />

              <div className="flex items-center gap-2">
                <ShadButton
                  type="button"
                  variant="editorial"
                  size="sm"
                  disableAnimations
                  onClick={() => saveDict(dict)}
                  disabled={savingId === dict.id}
                  className="rounded-full wl-label py-2"
                >
                  {savingId === dict.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                  {savingId === dict.id ? "Saving…" : "Save rules"}
                </ShadButton>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <p className="wl-micro-meta--muted text-center mt-4 leading-relaxed">
        Dictionaries sync across your workspace and apply to every Wireline Voice your agents use.
        Toggle Active off to pause a dictionary without deleting it.
      </p>
    </div>
  );
}

/**
 * Inline rules table — used by both the create form and the
 * per-dictionary edit panel. Keeps the visual treatment identical
 * across both surfaces so account holders don't have to relearn the UI.
 */
interface EntryEditorProps {
  entries: DictEntry[];
  onChange: (next: DictEntry[]) => void;
  onAddRow: () => void;
  onRemoveRow: (idx: number) => void;
}

function EntryEditor({ entries, onChange, onAddRow, onRemoveRow }: EntryEditorProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_84px_28px] gap-2 wl-label-muted/70 px-1">
        <span>Replace</span>
        <span>With</span>
        <span>Kind</span>
        <span />
      </div>
      {entries.length === 0 ? (
        <InlineEmpty
          label={OPS_TRAINING_PANEL.pronunciation}
          className="rounded-md border border-dashed border-border py-3"
        />
      ) : (
        entries.map((entry, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_84px_28px] gap-2 items-center">
            <Input
              type="text"
              value={entry.from}
              onChange={(e) => {
                const next = entries.map((e2, i) =>
                  i === idx ? { ...e2, from: e.target.value } : e2,
                );
                onChange(next);
              }}
              placeholder={entry.kind === "phoneme" ? "ACL" : "HVAC"}
              className="rounded-md border border-border bg-card px-2.5 py-2 text-[var(--wireline-typography-caption-size)] text-foreground outline-none focus:border-brand/40"
            />
            <Input
              type="text"
              value={entry.to}
              onChange={(e) => {
                const next = entries.map((e2, i) =>
                  i === idx ? { ...e2, to: e.target.value } : e2,
                );
                onChange(next);
              }}
              placeholder={entry.kind === "phoneme" ? "ˈeɪ siː ɛl" : "H-V-A-C"}
              className="rounded-md border border-border bg-card px-2.5 py-2 text-[var(--wireline-typography-caption-size)] text-foreground outline-none focus:border-brand/40"
            />
            <Select
              value={entry.kind}
              onValueChange={(v) => {
                const next = entries.map((e2, i) =>
                  i === idx
                    ? {
                        ...e2,
                        kind: (v === "phoneme" ? "phoneme" : "alias") as "alias" | "phoneme",
                      }
                    : e2,
                );
                onChange(next);
              }}
            >
              <SelectTrigger
                aria-label="Entry kind"
                className="rounded-md border border-border bg-card px-2 py-2 text-[var(--wireline-typography-overline-size)] text-foreground h-auto"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alias">Alias</SelectItem>
                <SelectItem value="phoneme">IPA</SelectItem>
              </SelectContent>
            </Select>
            <ShadButton
              type="button"
              variant="ghost"
              size="icon"
              disableAnimations
              onClick={() => onRemoveRow(idx)}
              className="w-7 h-7 rounded-md text-muted hover:text-rose-600 hover:bg-rose-500/8"
              aria-label="Remove rule"
            >
              <Trash2 className="w-3 h-3" />
            </ShadButton>
          </div>
        ))
      )}
      <ShadButton
        type="button"
        variant="ghost"
        size="sm"
        disableAnimations
        onClick={onAddRow}
        className="h-auto px-0 wl-label text-brand hover:text-brand"
      >
        <Plus className="w-3 h-3" />
        Add row
      </ShadButton>
    </div>
  );
}
