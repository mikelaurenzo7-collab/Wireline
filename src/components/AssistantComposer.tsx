import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Cpu, FileText, ImagePlus, Paperclip, X } from "lucide-react";
import { WL_COMPOSER_CLASSES } from "../lib/wireline-design-system";

export type ComposerModel = { id: string; label: string; hint?: string };

export const DEFAULT_COMPOSER_MODELS: ComposerModel[] = [
  { id: "auto", label: "Auto route", hint: "Best model per task" },
  { id: "grok", label: "Grok 4.3", hint: "Fast everyday default" },
  { id: "gemini-flash", label: "Gemini Flash", hint: "Quick, lightweight" },
  { id: "claude-sonnet", label: "Claude Sonnet", hint: "Careful, polished" },
  { id: "gpt-thinking", label: "GPT-5.5 Thinking", hint: "Deep reasoning" },
];

type Attachment = { id: string; name: string; kind: "image" | "file"; url?: string };

type Tone = "light" | "dark";

/**
 * Lightweight, keyword-driven reply generator so the agent transcript feels
 * alive in the product demo without wiring a live model. Deterministic per input.
 */
export function simulateAssistantReply(input: string, attachmentCount = 0): string {
  const t = input.toLowerCase();
  if (attachmentCount > 0 && t.trim().length === 0) {
    return `Got it - I've got ${attachmentCount} attachment${attachmentCount > 1 ? "s" : ""}. Want me to summarize ${attachmentCount > 1 ? "them" : "it"} or pull out the key details?`;
  }
  if (/(hold|wait)/.test(t))
    return "On it. I'll wait on hold and bring you back the moment a real person picks up - you won't have to listen to the music.";
  if (/(screen|spam|block|unknown)/.test(t))
    return "I'll screen incoming callers, filter the spam, and only put through the ones that look real. I'll log the rest.";
  if (/(summar|recap|notes?)/.test(t))
    return "Here's the recap: 1 appointment confirmed, 3 unknown callers blocked, and 1 callback waiting. Want the full transcript?";
  if (/(call|dial|phone|reschedul|book|appointment)/.test(t))
    return "Ready. I'll keep it brief, confirm the details before committing, and report back with what they said.";
  if (/(refund|billing|charge|invoice)/.test(t))
    return "I'll handle the billing call carefully - I'll state the policy, stay calm if they push, and escalate to you before agreeing to anything.";
  if (/(train|improve|fix|better)/.test(t))
    return "Good call. I'll line up a few practice scenarios and flag exactly where the responses need tightening.";
  return "Got it. I'll take care of that and let you know the moment it's done.";
}

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

export function AssistantComposer({
  tone = "light",
  placeholder = "Ask your agent...",
  sendLabel = "Send",
  models = DEFAULT_COMPOSER_MODELS,
  onSend,
}: {
  tone?: Tone;
  placeholder?: string;
  sendLabel?: string;
  models?: ComposerModel[];
  onSend?: (payload: { text: string; model: ComposerModel; attachments: Attachment[] }) => void;
}) {
  const dark = tone === "dark";
  const [text, setText] = useState("");
  const [model, setModel] = useState<ComposerModel>(models[0]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      attachments.forEach((a) => a.url && URL.revokeObjectURL(a.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (list: FileList | null, kind?: "image" | "file") => {
    if (!list) return;
    const next: Attachment[] = Array.from(list).map((f) => {
      const resolved: "image" | "file" = kind ?? (f.type.startsWith("image/") ? "image" : "file");
      return {
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`,
        name: f.name,
        kind: resolved,
        url: resolved === "image" ? URL.createObjectURL(f) : undefined,
      };
    });
    setAttachments((prev) => [...prev, ...next]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((a) => a.id !== id);
    });
  };

  const canSend = text.trim().length > 0 || attachments.length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend?.({ text: text.trim(), model, attachments });
    setText("");
    attachments.forEach((a) => a.url && URL.revokeObjectURL(a.url));
    setAttachments([]);
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const shell = dark
    ? "border-white/10 bg-charcoal/60 focus-within:border-brand/50 focus-within:ring-1 focus-within:ring-brand/50 shadow-inner rounded-[18px] border"
    : `${WL_COMPOSER_CLASSES.composerDock} flex flex-col gap-2 px-2.5 py-2`;
  const iconBtn = dark
    ? "text-white/55 hover:text-white hover:bg-white/10"
    : "text-muted-foreground hover:text-foreground hover:bg-accent";
  const chipBg = dark
    ? "border-white/10 bg-white/5 text-white/80"
    : "border-border bg-card text-foreground";
  const menuBg = dark
    ? "border-white/10 bg-charcoal text-white shadow-[0_18px_40px_rgba(0,0,0,.5)]"
    : "border-border bg-card text-foreground shadow-lg";
  const pickerBtn = dark
    ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
    : "border-border bg-background text-foreground hover:bg-card-deep";

  return (
    <div className="space-y-2">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span
              key={a.id}
              className={cx(
                "inline-flex items-center gap-2 rounded-full border py-1 pl-1.5 pr-1 text-xs font-medium",
                chipBg,
              )}
            >
              {a.kind === "image" && a.url ? (
                <img
                  src={a.url || "/placeholder.svg"}
                  alt={a.name}
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                <FileText size={13} className="ml-1" />
              )}
              <span className="max-w-[140px] truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label={`Remove ${a.name}`}
                className={cx(
                  "grid h-5 w-5 place-items-center rounded-full transition-colors",
                  dark ? "hover:bg-white/15" : "hover:bg-ink/10",
                )}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cx(
          "relative flex flex-col transition-colors",
          shell,
          dragOver && (dark ? "border-brand ring-2 ring-brand/40" : "ring-2 ring-ring/35"),
        )}
      >
        {dragOver && (
          <div
            className={cx(
              "pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[18px] text-xs font-semibold",
              dark ? "bg-charcoal/85 text-white" : "bg-background/85 text-brand",
            )}
          >
            Drop files to attach
          </div>
        )}
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={cx(
            "min-h-9 max-h-40 w-full resize-none bg-transparent px-1 py-1.5 text-sm outline-none",
            dark ? "placeholder:text-white/45 text-white" : "placeholder:text-muted-foreground/50",
          )}
        />

        <div className="flex items-center gap-1.5">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              className={cx(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                pickerBtn,
              )}
            >
              <Cpu size={14} />
              <span className="max-w-[110px] truncate sm:max-w-[140px]">{model.label}</span>
              <ChevronDown
                size={13}
                className={cx("transition-transform", menuOpen && "rotate-180")}
              />
            </button>
            {menuOpen && (
              <div
                role="listbox"
                className={cx(
                  "absolute bottom-11 left-0 z-20 w-[min(15rem,calc(100vw-3rem))] overflow-hidden rounded-[16px] border p-1.5",
                  menuBg,
                )}
              >
                {models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={m.id === model.id}
                    onClick={() => {
                      setModel(m);
                      setMenuOpen(false);
                    }}
                    className={cx(
                      "flex w-full items-start gap-2 rounded-[12px] px-3 py-2 text-left transition-colors",
                      m.id === model.id
                        ? "bg-brand/10"
                        : dark
                          ? "hover:bg-white/5"
                          : "hover:bg-card-deep",
                    )}
                  >
                    <Cpu size={14} className="mt-0.5 shrink-0 text-brand" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{m.label}</span>
                      {m.hint && (
                        <span
                          className={cx(
                            "block text-[var(--wireline-typography-overline-size)]",
                            dark ? "text-white/50" : "text-muted-foreground",
                          )}
                        >
                          {m.hint}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach a file"
            className={cx(
              "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              iconBtn,
            )}
          >
            <Paperclip size={17} />
          </button>
          <button
            type="button"
            onClick={() => imageRef.current?.click()}
            aria-label="Attach an image"
            className={cx(
              "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              iconBtn,
            )}
          >
            <ImagePlus size={17} />
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className={cx(
              "ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              canSend
                ? dark
                  ? "bg-brand text-paper hover:brightness-110 active:scale-95 shadow-sm"
                  : "bg-primary text-primary-foreground hover:brightness-95 active:scale-95 shadow-sm"
                : dark
                  ? "bg-white/10 text-white/40 cursor-not-allowed"
                  : "bg-ink/10 text-muted-foreground cursor-not-allowed",
            )}
          >
            <span>{sendLabel}</span>
            <ArrowUp size={15} />
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files, "file");
            e.target.value = "";
          }}
        />
        <input
          ref={imageRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files, "image");
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
