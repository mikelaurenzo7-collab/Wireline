/**
 * PainterWorkspace — dedicated chat interface for the AI design team.
 * Purpose-built, premium split chat with preset chips, iterations, and attachments.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { motion } from "motion/react";
import {
  Send,
  Loader2,
  Paperclip,
  Palette,
  Sparkles,
  LayoutTemplate,
  Paintbrush,
  Layers,
} from "lucide-react";
import {
  authFetch,
  DIRECTOR_DESIGN_STUDIO_REQUEST_TIMEOUT_MS,
  readApiJson,
  isAuthHttpStatus,
} from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import { ThinkingDisplay } from "./ui/ThinkingDisplay";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { Input } from "./ui/shadcn/Input";
import { Textarea } from "./ui/shadcn/Textarea";
import { SignalOrbFrame } from "./ui/SignalOrbFrame";
import { DirectorMessageBody } from "./director/DirectorMessageBody";
import { DirectorStitchPreviewVariantGrid } from "./director/DirectorStitchPreviewTeaser";
import DirectorStitchLiveSession from "./director/DirectorStitchLiveSession";
import { findLatestStitchPreview, isStitchPreview } from "../lib/design-preview";
import type { DirectorPreviewMeta } from "../lib/director-message-metadata";
import {
  PAINTER_EMPTY_COPY,
  PAINTER_STARTER_PROMPTS,
  WIRELINE_PAINTER_UI,
} from "../lib/wireline-painter-design";
import { WL_APP_CLASSES, WL_DIRECTOR_CLASSES } from "../lib/wireline-director-design";
import { operatorTurnHasDirectorReply } from "../lib/director-reply-utils";

// TypeScript interfaces locally matched to metadata schemas
export interface PainterMessage {
  id: string;
  role: "operator" | "director";
  content: string;
  createdAt: string;
  previews?: DirectorPreviewMeta[];
  reasoning?: string;
  thinkingDurationMs?: number;
  model?: "sonnet" | "opus";
  modelLabel?: string;
  modelProvider?: "wireline" | "openrouter";
  modelId?: string;
}

export interface PainterStudioBridge {
  messageCount: number;
  isClearing: boolean;
  clearThread: () => void;
  queuePrompt: (text: string) => void;
}

export interface PainterWorkspaceProps {
  initialPrompt?: string;
  onActiveStitchPreview?: (preview: DirectorPreviewMeta | null) => void;
  onPainterStudioBridge?: (bridge: PainterStudioBridge | null) => void;
}

const STYLE_PRESETS = [
  {
    label: "Glassmorphism",
    text: "with a glassmorphic aesthetic, subtle backdrop blurs, and translucent panels",
  },
  {
    label: "Neobrutalism",
    text: "styled with high-contrast neobrutalist layout, thick borders, and stark shadows",
  },
  {
    label: "Dark Luxury",
    text: "designed as a premium dark mode dashboard with gold accents and high-end typography",
  },
  {
    label: "Minimalist SaaS",
    text: "in a clean, modern SaaS aesthetic, ample whitespace, and thin neutral dividers",
  },
  {
    label: "Figma-esque Grid",
    text: "with dot-grid canvas, clean sidebars, and crisp developer-oriented tabs",
  },
  {
    label: "Wireframe Mode",
    text: "rendered as a low-fidelity wireframe using placeholder boxes, grayscale, and dashed borders",
  },
];

export default function PainterWorkspace({
  initialPrompt,
  onActiveStitchPreview,
  onPainterStudioBridge,
}: PainterWorkspaceProps) {
  const directorMessagesPath = "/api/director/messages?thread=painter";
  const { user, loading: authLoading } = useAuth();
  const { error: toastError, success: toastSuccess } = useToast();

  const [messages, setMessages] = useState<PainterMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Studio state mapping
  const [designRendering, setDesignRendering] = useState(false);
  const [designPrompt, setDesignPrompt] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialPromptSentRef = useRef(false);

  // Auto-scroll to bottom of thread
  const scrollToBottom = useCallback((force = false) => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const isAtBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 150;
    if (force || isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, designRendering, scrollToBottom]);

  // Load design thread messages
  const loadMessages = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setMessages([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const r = await authFetch(directorMessagesPath);
      if (r.status === 401 || r.status === 403) return;
      if (!r.ok) throw new Error("Failed to load design messages");
      const data = await r.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (err) {
      toastError("Load failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setIsLoading(false);
    }
  }, [authLoading, user, toastError, directorMessagesPath]);

  useEffect(() => {
    loadMessages();
  }, [authLoading, user, loadMessages]);

  // Clear design thread
  const clearThread = useCallback(async () => {
    if (isClearing) return;
    if (
      !confirm(
        "Are you sure you want to clear this design studio thread? This will reset all current progress.",
      )
    ) {
      return;
    }
    setIsClearing(true);
    try {
      const r = await authFetch(directorMessagesPath, { method: "DELETE" });
      if (!r.ok) throw new Error("Clear failed");
      setMessages([]);
      setInput("");
      toastSuccess("Design thread cleared", "Studio reset to fresh state");
    } catch {
      toastError("Couldn't clear studio", "Please try again");
    } finally {
      setIsClearing(false);
    }
  }, [isClearing, toastSuccess, toastError, directorMessagesPath]);

  // Recover designer reply on timeouts
  const recoverPersistedReply = useCallback(
    async (trimmed: string): Promise<boolean> => {
      const waits = [400, 900, 1600, 3000, 5000, 8000, 12_000, 18_000];
      for (const waitMs of waits) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        const r = await authFetch(directorMessagesPath);
        if (!r.ok) continue;
        const data = await r.json();
        const msgs = Array.isArray(data.messages) ? data.messages : [];
        if (!operatorTurnHasDirectorReply(msgs, trimmed, { requireStitch: true })) {
          continue;
        }
        setMessages(msgs);
        return true;
      }
      return false;
    },
    [directorMessagesPath],
  );

  // Send design message (always non-streaming for design cards)
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      const optimistic: PainterMessage = {
        id: `tmp-${Date.now()}`,
        role: "operator",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);
      setInput("");
      setIsSending(true);
      setDesignPrompt(trimmed);
      setDesignRendering(true);

      const payload = {
        content: trimmed,
        threadKey: "painter",
      };

      try {
        const r = await authFetch(directorMessagesPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeoutMs: DIRECTOR_DESIGN_STUDIO_REQUEST_TIMEOUT_MS,
          body: JSON.stringify(payload),
        });

        const parsed = await readApiJson<Record<string, unknown>>(r);
        if (!parsed.ok) {
          if (isAuthHttpStatus(parsed.status)) {
            setInput(trimmed);
            toastError("Session expired", "Sign in again to continue.");
            return;
          }
          throw new Error(parsed.error);
        }

        // Hydrate reply
        const data = parsed.data;
        const loadedMessages = Array.isArray(data.messages) ? data.messages : [];
        if (loadedMessages.length > 0) {
          setMessages(loadedMessages);
        } else {
          // Fallback single message update if thread is not returned
          const reply: PainterMessage = {
            id: `director-${Date.now()}`,
            role: "director",
            content: (data.reply as string) || "(empty design reply)",
            createdAt: new Date().toISOString(),
            previews: Array.isArray(data.previews) ? data.previews : undefined,
            reasoning: typeof data.reasoning === "string" ? data.reasoning : undefined,
            thinkingDurationMs:
              typeof data.thinkingDurationMs === "number" ? data.thinkingDurationMs : undefined,
            model: data.model === "sonnet" || data.model === "opus" ? data.model : undefined,
          };
          setMessages((prev) => [...prev, reply]);
        }
      } catch {
        const recovered = await recoverPersistedReply(trimmed);
        if (!recovered) {
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
          setInput(trimmed);
          toastError(
            "Design didn't finish in time",
            "Spectrum Desk may still be rendering in the background.",
          );
        }
      } finally {
        setIsSending(false);
        setDesignRendering(false);
        setDesignPrompt("");
        inputRef.current?.focus();
      }
    },
    [isSending, recoverPersistedReply, toastError, directorMessagesPath],
  );

  // Sync bridge with parent shell page
  const queuePrompt = useCallback(
    (text: string) => {
      void send(text);
    },
    [send],
  );

  useEffect(() => {
    if (!onPainterStudioBridge) return;
    onPainterStudioBridge({
      messageCount: messages.length,
      isClearing,
      clearThread: () => void clearThread(),
      queuePrompt,
    });
    return () => onPainterStudioBridge(null);
  }, [clearThread, isClearing, messages.length, onPainterStudioBridge, queuePrompt]);

  // Sync active previews to right side panel
  useEffect(() => {
    if (!onActiveStitchPreview) return;
    const preview = findLatestStitchPreview(messages);
    onActiveStitchPreview(preview?.preview ?? null);
  }, [messages, onActiveStitchPreview]);

  // Initial prompt hook
  useEffect(() => {
    if (!initialPrompt?.trim() || initialPromptSentRef.current) return;
    if (authLoading || isLoading || isSending) return;
    initialPromptSentRef.current = true;
    void send(initialPrompt.trim());
  }, [authLoading, initialPrompt, isLoading, isSending, send]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  // Preset chip selection helper
  const handlePresetSelect = (text: string) => {
    setInput((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return `Build a website ${text}`;
      return `${trimmed}, ${text}`;
    });
    inputRef.current?.focus();
  };

  // Stable key for a render across the thread (renderId preferred, conceptId fallback).
  const previewKey = useCallback((p: DirectorPreviewMeta) => p.renderId || p.conceptId, []);

  // Version numbers across the whole thread, assigned chronologically (v1 = first render).
  const versionByKey = useMemo(() => {
    const map = new Map<string, number>();
    let version = 0;
    for (const m of messages) {
      if (m.role !== "director" || !m.previews) continue;
      for (const p of m.previews) {
        if (!isStitchPreview(p)) continue;
        const key = previewKey(p);
        if (!map.has(key)) {
          version += 1;
          map.set(key, version);
        }
      }
    }
    return map;
  }, [messages, previewKey]);

  // Iteration Strip — gather last 3 previews with visual assets
  const iterations = useMemo(() => {
    const list: DirectorPreviewMeta[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.previews) {
        for (const p of m.previews) {
          if (isStitchPreview(p) && (p.htmlDownloadUrl || p.imageDownloadUrl)) {
            if (
              !list.some(
                (existing) =>
                  existing.conceptId === p.conceptId || existing.renderId === p.renderId,
              )
            ) {
              list.push(p);
            }
          }
        }
      }
      if (list.length >= 3) break;
    }
    return list;
  }, [messages]);

  // Track which render is mirrored in the preview pane so the strip can mark it.
  const [selectedPreviewKey, setSelectedPreviewKey] = useState<string | null>(null);
  useEffect(() => {
    const latest = findLatestStitchPreview(messages);
    setSelectedPreviewKey(latest ? previewKey(latest.preview) : null);
  }, [messages, previewKey]);

  const selectIteration = useCallback(
    (p: DirectorPreviewMeta) => {
      setSelectedPreviewKey(previewKey(p));
      onActiveStitchPreview?.(p);
    },
    [onActiveStitchPreview, previewKey],
  );

  // File pick ingestion
  const onFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPDF = file.name.toLowerCase().endsWith(".pdf");
    const isImage = /\.(jpe?g|png|webp|gif)$/i.test(file.name);

    if (!isPDF && !isImage) {
      toastError("Unsupported file", "Please upload a PDF or an Image.");
      e.target.value = "";
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toastError("File too large", "Keep assets under 15MB");
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error("Read failed"));
        reader.readAsDataURL(file);
      });

      const endpoint = "/api/director/files";
      const r = await authFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64, fileName: file.name }),
      });
      const parsed = await readApiJson<{ reply?: string; inserted?: number; error?: string }>(r);
      if (!parsed.ok) throw new Error(parsed.error);

      if (parsed.data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `director-${Date.now()}`,
            role: "director",
            content: parsed.data.reply || "",
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      toastSuccess(
        "Context uploaded",
        `Ingested design details from ${file.name}. Painter has processed the design prompt rules.`,
      );
    } catch (err) {
      toastError("Upload failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div
      data-testid="painter-workspace"
      className={cn("flex flex-col h-full min-h-0 relative", WL_APP_CLASSES.missionCanvas)}
    >
      {/* Scrollable chat body */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {isLoading && messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-brand animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-8">
            <SignalOrbFrame size="md" withBloom className="wl-painter-preview-orb mb-2">
              <span className="flex w-12 h-12 items-center justify-center rounded-md bg-gradient-to-br from-brand/90 to-brand-deep text-on-brand shadow-md shadow-brand/20">
                <Paintbrush className="w-6 h-6" />
              </span>
            </SignalOrbFrame>
            <div className="space-y-1.5 max-w-sm">
              <h2 className="text-[14px] font-semibold text-ink">
                {WIRELINE_PAINTER_UI.emptyTitle}
              </h2>
              <p className="wl-micro-meta--muted-foreground leading-relaxed">
                {WIRELINE_PAINTER_UI.emptyBody}
              </p>
            </div>
            <div className="w-full max-w-md grid grid-cols-1 gap-2 mt-2">
              <p className="text-[10px] font-semibold text-brand/60 uppercase tracking-wider">
                {PAINTER_EMPTY_COPY.starterEyebrow}
              </p>
              {PAINTER_STARTER_PROMPTS.map((prompt) => (
                <ShadButton
                  key={prompt.id}
                  type="button"
                  variant="ghost"
                  disableAnimations
                  onClick={() => void send(prompt.label)}
                  className="group h-auto w-full justify-between text-left touch-press hover:scale-[1.02] text-[12px] font-medium leading-snug px-3 py-2.5 rounded-md border border-brand/8 bg-paper/60 hover:bg-brand/4 dark:bg-velvet/40 dark:hover:bg-brand/8 [&_svg]:!size-3.5"
                >
                  <span className="truncate pr-4">{prompt.label}</span>
                  <Sparkles className="text-brand opacity-0 group-hover:opacity-100 transition-opacity" />
                </ShadButton>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "flex flex-col w-full",
                  m.role === "operator" ? "items-end" : "items-start",
                )}
              >
                {m.role === "director" && (
                  <div className="flex items-center gap-1.5 mb-1 ml-0.5">
                    <span className="shrink-0 flex w-6 h-6 items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/15">
                      <Paintbrush className="w-3 h-3" />
                    </span>
                    <span className="wl-micro-meta--muted uppercase tracking-[0.12em] font-medium">
                      {WIRELINE_PAINTER_UI.personaName}
                    </span>
                  </div>
                )}

                <div
                  className={cn(
                    WL_DIRECTOR_CLASSES.messageBubble,
                    "rounded-md whitespace-pre-wrap break-words relative max-w-[85%] sm:max-w-[75%]",
                    m.role === "operator"
                      ? "bg-brand text-white rounded-br-sm px-3.5 py-2.5 text-[13px]"
                      : "bg-paper border border-brand/8 dark:bg-velvet/40 text-ink rounded-bl-sm px-4 py-3.5 text-[13px]",
                  )}
                >
                  {m.role === "director" && m.reasoning && (
                    <ThinkingDisplay
                      reasoning={m.reasoning}
                      thinkingDurationMs={m.thinkingDurationMs}
                      isDeep={m.model === "opus"}
                      animate={false}
                    />
                  )}

                  {m.role === "director" && m.previews && m.previews.length > 0 && (
                    <div className="mb-3">
                      <DirectorStitchPreviewVariantGrid
                        previews={m.previews.filter((p) => isStitchPreview(p))}
                      />
                    </div>
                  )}

                  <DirectorMessageBody content={m.content} />
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Live Rendering Session Indicator */}
        {isSending && designRendering && (
          <div className="pt-2">
            <DirectorStitchLiveSession operatorPrompt={designPrompt} />
          </div>
        )}
      </div>

      {/* Version strip — click any render to mirror it in the live preview pane */}
      {iterations.length > 0 && (
        <div className="px-4 py-2 border-t border-brand/6 bg-paper/30 flex items-center gap-2 overflow-x-auto shrink-0">
          <Layers className="w-3.5 h-3.5 text-muted shrink-0" />
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider shrink-0 mr-1">
            Versions
          </span>
          <div className="flex gap-2 min-w-0" role="group" aria-label="Design versions">
            {iterations.map((p, idx) => {
              const key = previewKey(p);
              const version = versionByKey.get(key);
              const isActive = selectedPreviewKey === key;
              return (
                <button
                  key={key + idx}
                  type="button"
                  onClick={() => selectIteration(p)}
                  aria-pressed={isActive}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium truncate touch-press hover:scale-[1.05] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1",
                    isActive
                      ? "bg-brand text-white border-brand shadow-sm"
                      : "bg-brand/5 text-brand border-brand/12 hover:bg-brand/10",
                  )}
                  title={p.title}
                >
                  <span className="font-bold tabular-nums shrink-0">
                    {version ? `v${version}` : <LayoutTemplate className="w-3 h-3" aria-hidden />}
                  </span>
                  <span className="truncate max-w-[100px]">{p.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Style quick pick chips */}
      <div className="px-4 py-2 border-t border-brand/6 bg-paper/20 flex gap-2 overflow-x-auto shrink-0 scrollbar-none">
        <Palette className="w-3.5 h-3.5 text-muted shrink-0 self-center" />
        <div className="flex gap-1.5 shrink-0">
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handlePresetSelect(preset.text)}
              className="px-2 py-1 text-[10px] font-medium rounded-full bg-brand/5 hover:bg-brand/10 border border-brand/8 text-ink hover:text-brand transition-colors shrink-0 touch-press hover:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Composer Input Area */}
      <div className="border-t border-brand/8 bg-paper/95 dark:bg-velvet/90 px-4 py-3 shrink-0">
        <div className="rounded-lg border border-brand/12 bg-paper dark:bg-velvet/40 shadow-sm relative focus-within:ring-1 focus-within:ring-brand/40 transition-shadow">
          <Textarea
            ref={inputRef}
            data-testid="painter-composer"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            disabled={isSending}
            placeholder={
              isSending
                ? WIRELINE_PAINTER_UI.workingStatus
                : "Describe your custom design (e.g. brutalist dashboard, neobrutalist signup form...)"
            }
            className="w-full resize-none border-0 bg-transparent shadow-none text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none px-4 py-3 leading-normal disabled:opacity-60 focus-visible:ring-0"
          />

          <div className="flex items-center justify-between border-t border-brand/6 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <ShadButton
                type="button"
                variant="ghost"
                size="sm"
                disableAnimations
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending || isUploading}
                className="h-8 w-8 p-0 text-muted hover:text-brand touch-press hover:scale-[1.05]"
                title="Upload PDF spec or Image"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-brand" />
                ) : (
                  <Paperclip className="w-4 h-4" />
                )}
              </ShadButton>
              <Input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf,image/*"
                onChange={onFilePick}
                className="hidden"
              />
              {isUploading && (
                <span className="text-[10px] text-muted animate-pulse">Uploading...</span>
              )}
            </div>

            <ShadButton
              type="button"
              onClick={() => void send(input)}
              disabled={isSending || !input.trim()}
              disableAnimations
              className="h-8 px-3.5 bg-brand text-white hover:bg-brand-deep rounded-md flex items-center gap-1.5 touch-press hover:scale-[1.05] shadow-sm"
            >
              {isSending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span className="text-[11px] font-bold">Draw</span>
            </ShadButton>
          </div>
        </div>
      </div>
    </div>
  );
}
