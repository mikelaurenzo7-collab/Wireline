/**
 * useStreamingChat — A hook for consuming SSE streaming responses from
 * Claude-backed chat endpoints (/api/director/messages/stream,
 * /api/agents/:id/workspace/messages/stream).
 *
 * Emits granular state updates so the UI can show:
 *   1. Live thinking chunks as Claude reasons
 *   2. Final reply when complete
 *   3. Multi-step pipeline progress (via LiveTaskPipeline)
 *
 * Built on native EventSource-style fetch (POST body support requires
 * manual SSE parsing since EventSource only supports GET).
 */
import { useCallback, useRef, useState } from "react";
import {
  AUTH_SESSION_EXPIRED_MESSAGE,
  isAuthHttpStatus,
  parseApiErrorFromText,
  refreshSessionIfNeeded,
} from "../lib/api";
import {
  isRecoverableDirectorPayload,
  isTerminalDirectorStreamPayload,
} from "../lib/director-reply-utils";

export type StreamPhase =
  | "idle"
  | "connecting"
  | "preparing"
  | "thinking"
  | "replying"
  | "done"
  | "error";

/** One live mission-log entry mirrored from server `action_start` / `action_end` events. */
export interface StreamTurnAction {
  id: string;
  kind: string;
  label: string;
  detail?: string;
  durationMs?: number;
  status: "running" | "done" | "failed";
}

export interface StreamingState {
  /** Current phase of the streaming lifecycle. */
  phase: StreamPhase;
  /** Accumulated thinking text so far. */
  thinkingText: string;
  /** Whether the model is using deep (Opus) analysis. */
  isDeep: boolean;
  /** True once the server has started the SSE stream (meta or later). */
  streamEstablished: boolean;
  /** Live mission log — what the Director is doing right now. */
  actions: StreamTurnAction[];
  /** Grounded research citations as they resolve (before `done`). */
  sources: { title?: string; uri?: string }[];
  /** Duration of thinking in ms (set when thinking_end fires). */
  thinkingDurationMs?: number;
  /** The final reply payload (set when reply or done fires). */
  reply?: Record<string, unknown>;
  /** Error message if something went wrong. */
  error?: string;
  /** Model name from meta event. */
  model?: string;
  /** Human label from meta (Wireline tier or OpenRouter model). */
  modelDisplayLabel?: string;
}

const INITIAL_STATE: StreamingState = {
  phase: "idle",
  thinkingText: "",
  isDeep: false,
  streamEstablished: false,
  actions: [],
  sources: [],
};

interface UseStreamingChatOptions {
  /** Called when the full response is complete. */
  onComplete?: (data: Record<string, unknown>) => void;
  /** Called on error. */
  onError?: (
    message: string,
    context: { streamEstablished: boolean; partialReply?: Record<string, unknown> },
  ) => void;
}

export interface SseParserState {
  currentEvent?: string;
  dataLines: string[];
}

interface ParseSseEventsOptions {
  /** Dispatch the event currently buffered even if no blank line has arrived yet. */
  flush?: boolean;
}

const getSseFieldValue = (line: string, field: string): string | undefined => {
  const prefix = `${field}:`;
  if (!line.startsWith(prefix)) return undefined;
  const value = line.slice(prefix.length);
  return value.startsWith(" ") ? value.slice(1) : value;
};

const resetSseParserState = (state: SseParserState): void => {
  state.currentEvent = undefined;
  state.dataLines = [];
};

const dispatchSseEvent = (
  state: SseParserState,
  handleEvent: (event: string, data: Record<string, unknown>) => void,
): void => {
  if (!state.currentEvent || state.dataLines.length === 0) {
    resetSseParserState(state);
    return;
  }

  try {
    const data = JSON.parse(state.dataLines.join("\n")) as Record<string, unknown>;
    handleEvent(state.currentEvent, data);
  } catch {
    // Non-JSON data payload, skip
  } finally {
    resetSseParserState(state);
  }
};

/** True for the early SSE meta frame before model routing completes. */
export function isDirectorBootstrapMeta(data: Record<string, unknown>): boolean {
  return data.status === "connecting" && typeof data.model !== "string";
}

/** Parse SSE line batches incrementally. Exported for tests. */
export function parseSseEvents(
  lines: string[],
  handleEvent: (event: string, data: Record<string, unknown>) => void,
  state: SseParserState = { dataLines: [] },
  options: ParseSseEventsOptions = {},
): void {
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");

    if (line === "") {
      dispatchSseEvent(state, handleEvent);
      continue;
    }

    const event = getSseFieldValue(line, "event");
    if (event !== undefined) {
      state.currentEvent = event.trim();
      continue;
    }

    const data = getSseFieldValue(line, "data");
    if (data !== undefined) {
      state.dataLines.push(data);
    }
  }

  if (options.flush) {
    dispatchSseEvent(state, handleEvent);
  }
}

/**
 * Returns a `send` function that POSTs to a streaming endpoint and
 * a reactive `state` object that updates through the streaming lifecycle.
 */
/** Reset on every SSE chunk — Stitch / Opus turns can run 5+ minutes. */
const STREAM_IDLE_MS = 540_000;
/** Time to receive the HTTP response + first SSE bytes. */
const STREAM_HANDSHAKE_MS = 60_000;
/** After bootstrap meta, time allowed for server prep before routing meta / thinking. */
const STREAM_PREPARE_MS = 90_000;

export function useStreamingChat(endpoint: string, options?: UseStreamingChatOptions) {
  const [state, setState] = useState<StreamingState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const completionRef = useRef(false);
  const latestReplyRef = useRef<Record<string, unknown> | undefined>(undefined);
  const streamEstablishedRef = useRef(false);
  const terminalReplyRef = useRef(false);

  const reset = useCallback(() => {
    completionRef.current = false;
    latestReplyRef.current = undefined;
    streamEstablishedRef.current = false;
    terminalReplyRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => (s.phase === "idle" || s.phase === "done" ? s : { ...s, phase: "idle" }));
  }, []);

  const finalizeComplete = useCallback((data: Record<string, unknown>) => {
    if (completionRef.current) return;
    completionRef.current = true;
    optionsRef.current?.onComplete?.(data);
  }, []);

  const finalizeError = useCallback((message: string) => {
    if (completionRef.current) return;
    completionRef.current = true;
    optionsRef.current?.onError?.(message, {
      streamEstablished: streamEstablishedRef.current,
      partialReply: latestReplyRef.current,
    });
  }, []);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      let timedOut = false;
      let handshakeTimedOut = false;
      let prepareTimedOut = false;
      let timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, STREAM_IDLE_MS);
      let handshakeTimeoutId = window.setTimeout(() => {
        if (!streamEstablishedRef.current) {
          handshakeTimedOut = true;
          controller.abort();
        }
      }, STREAM_HANDSHAKE_MS);
      let prepareTimeoutId: number | undefined;
      const clearPrepareTimeout = () => {
        if (prepareTimeoutId !== undefined) {
          window.clearTimeout(prepareTimeoutId);
          prepareTimeoutId = undefined;
        }
      };
      const armPrepareTimeout = () => {
        clearPrepareTimeout();
        prepareTimeoutId = window.setTimeout(() => {
          prepareTimedOut = true;
          controller.abort();
        }, STREAM_PREPARE_MS);
      };
      const bumpIdleTimeout = () => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, STREAM_IDLE_MS);
      };

      completionRef.current = false;
      latestReplyRef.current = undefined;
      streamEstablishedRef.current = false;
      terminalReplyRef.current = false;
      setState({
        phase: "connecting",
        thinkingText: "",
        isDeep: false,
        streamEstablished: false,
        actions: [],
        sources: [],
      });

      const sessionFresh = await refreshSessionIfNeeded();
      if (!sessionFresh) {
        const msg = AUTH_SESSION_EXPIRED_MESSAGE;
        setState({ ...INITIAL_STATE, phase: "error", error: msg });
        finalizeError(msg);
        return;
      }

      const finishWithPartialReply = (): boolean => {
        if (completionRef.current || !latestReplyRef.current) return false;
        const payload = latestReplyRef.current;
        if (!terminalReplyRef.current && !isTerminalDirectorStreamPayload(payload)) return false;
        if (!isRecoverableDirectorPayload(payload)) return false;
        setState((s) => ({ ...s, phase: "done", reply: payload }));
        finalizeComplete(payload);
        return true;
      };

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "Stream failed");
          const parsed = parseApiErrorFromText(errText, res.status);
          const msg = isAuthHttpStatus(res.status)
            ? AUTH_SESSION_EXPIRED_MESSAGE
            : `Stream error: ${res.status} ${parsed.error}`;
          setState({ ...INITIAL_STATE, phase: "error", error: msg });
          finalizeError(msg);
          return;
        }

        if (!res.body) {
          const msg = "No response body";
          setState({ ...INITIAL_STATE, phase: "error", error: msg });
          finalizeError(msg);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const parserState: SseParserState = { dataLines: [] };

        const handleEvent = (event: string, data: Record<string, unknown>) => {
          bumpIdleTimeout();
          switch (event) {
            case "meta": {
              streamEstablishedRef.current = true;
              window.clearTimeout(handshakeTimeoutId);
              const bootstrapOnly = isDirectorBootstrapMeta(data);
              if (bootstrapOnly) {
                armPrepareTimeout();
              } else {
                clearPrepareTimeout();
              }
              setState((s) => ({
                ...s,
                phase: bootstrapOnly ? "preparing" : "thinking",
                isDeep: data.deep === true && data.model !== "custom",
                model: (data.model as string) || undefined,
                modelDisplayLabel:
                  typeof data.modelLabel === "string" ? data.modelLabel : undefined,
                streamEstablished: true,
              }));
              break;
            }

            case "thinking_start":
              streamEstablishedRef.current = true;
              window.clearTimeout(handshakeTimeoutId);
              clearPrepareTimeout();
              setState((s) => ({
                ...s,
                phase: "thinking",
                thinkingText: "",
                streamEstablished: true,
              }));
              break;

            case "thinking_chunk":
              streamEstablishedRef.current = true;
              clearPrepareTimeout();
              setState((s) => ({
                ...s,
                phase: "thinking",
                thinkingText: s.thinkingText + ((data.text as string) || ""),
                streamEstablished: true,
              }));
              break;

            case "thinking_end":
              streamEstablishedRef.current = true;
              setState((s) => ({
                ...s,
                phase: "thinking",
                thinkingText: (data.thinking as string) || s.thinkingText,
                thinkingDurationMs: (data.durationMs as number) || undefined,
                streamEstablished: true,
              }));
              break;

            case "action_start":
            case "action_end": {
              streamEstablishedRef.current = true;
              if (typeof data.id !== "string" || typeof data.label !== "string") break;
              const incoming: StreamTurnAction = {
                id: data.id,
                kind: typeof data.kind === "string" ? data.kind : "tool",
                label: data.label,
                detail: typeof data.detail === "string" ? data.detail : undefined,
                durationMs: typeof data.durationMs === "number" ? data.durationMs : undefined,
                status:
                  data.status === "done" || data.status === "failed" ? data.status : "running",
              };
              setState((s) => {
                const existing = s.actions.findIndex((a) => a.id === incoming.id);
                const actions =
                  existing >= 0
                    ? s.actions.map((a, i) => (i === existing ? incoming : a))
                    : [...s.actions, incoming];
                return { ...s, actions, streamEstablished: true };
              });
              break;
            }

            case "sources":
              streamEstablishedRef.current = true;
              if (Array.isArray(data.sources)) {
                const sources = data.sources as { title?: string; uri?: string }[];
                setState((s) => ({ ...s, sources, streamEstablished: true }));
              }
              break;

            case "reply":
              streamEstablishedRef.current = true;
              latestReplyRef.current = data;
              if (isTerminalDirectorStreamPayload(data)) {
                terminalReplyRef.current = true;
              }
              setState((s) => ({
                ...s,
                phase: "replying",
                reply: data,
                streamEstablished: true,
              }));
              break;

            case "done":
              streamEstablishedRef.current = true;
              terminalReplyRef.current = true;
              latestReplyRef.current = data;
              setState((s) => ({
                ...s,
                phase: "done",
                reply: data,
                thinkingText: (data.reasoning as string) || s.thinkingText,
                thinkingDurationMs: (data.thinkingDurationMs as number) || s.thinkingDurationMs,
                actions: Array.isArray(data.turnActions)
                  ? (data.turnActions as StreamTurnAction[])
                  : s.actions,
                sources: Array.isArray(data.researchSources)
                  ? (data.researchSources as { title?: string; uri?: string }[])
                  : s.sources,
                streamEstablished: true,
              }));
              finalizeComplete(data);
              break;

            case "error":
              setState((s) => ({
                ...s,
                phase: "error",
                error: (data.message as string) || "Stream error",
              }));
              finalizeError((data.message as string) || "Stream error");
              break;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) break;

          bumpIdleTimeout();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          parseSseEvents(lines, handleEvent, parserState);
        }

        buffer += decoder.decode();
        if (buffer.length > 0) {
          parseSseEvents(buffer.split("\n"), handleEvent, parserState);
          buffer = "";
        }
        parseSseEvents([], handleEvent, parserState, { flush: true });

        if (controller.signal.aborted) {
          finishWithPartialReply();
          return;
        }

        if (completionRef.current) return;

        if (finishWithPartialReply()) return;

        const msg = "Stream ended before the Director finished replying";
        setState({ ...INITIAL_STATE, phase: "error", error: msg });
        finalizeError(msg);
      } catch (e: unknown) {
        if ((e as Error)?.name === "AbortError") {
          if (finishWithPartialReply()) return;
          if (handshakeTimedOut) {
            const msg = "Director took too long to connect — try again or refresh";
            setState({ ...INITIAL_STATE, phase: "error", error: msg });
            finalizeError(msg);
            return;
          }
          if (prepareTimedOut) {
            const msg = "Director is still preparing your turn — try again in a moment";
            setState({ ...INITIAL_STATE, phase: "error", error: msg });
            finalizeError(msg);
            return;
          }
          if (timedOut) {
            const msg = "Stream timed out before the Director finished";
            setState({ ...INITIAL_STATE, phase: "error", error: msg });
            finalizeError(msg);
            return;
          }
          if (streamEstablishedRef.current) {
            finalizeError("Stream disconnected before the Director finished");
          }
          return;
        }
        if (finishWithPartialReply()) return;
        const msg = (e as Error)?.message || "Stream connection failed";
        setState({ ...INITIAL_STATE, phase: "error", error: msg });
        finalizeError(msg);
      } finally {
        window.clearTimeout(timeoutId);
        window.clearTimeout(handshakeTimeoutId);
        clearPrepareTimeout();
      }
    },
    [endpoint, finalizeComplete, finalizeError],
  );

  return {
    state,
    send,
    reset,
    abort,
    isStreaming: state.phase !== "idle" && state.phase !== "done" && state.phase !== "error",
  };
}
