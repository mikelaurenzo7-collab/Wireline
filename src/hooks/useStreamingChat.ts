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
import { refreshSessionIfNeeded } from "../lib/api";

export type StreamPhase = "idle" | "connecting" | "thinking" | "replying" | "done" | "error";

export interface StreamingState {
  /** Current phase of the streaming lifecycle. */
  phase: StreamPhase;
  /** Accumulated thinking text so far. */
  thinkingText: string;
  /** Whether the model is using deep (Opus) analysis. */
  isDeep: boolean;
  /** True once the server has started the SSE stream (meta or later). */
  streamEstablished: boolean;
  /** Duration of thinking in ms (set when thinking_end fires). */
  thinkingDurationMs?: number;
  /** The final reply payload (set when reply or done fires). */
  reply?: Record<string, unknown>;
  /** Error message if something went wrong. */
  error?: string;
  /** Model name from meta event. */
  model?: string;
}

const INITIAL_STATE: StreamingState = {
  phase: "idle",
  thinkingText: "",
  isDeep: false,
  streamEstablished: false,
};

interface UseStreamingChatOptions {
  /** Called when the full response is complete. */
  onComplete?: (data: Record<string, unknown>) => void;
  /** Called on error. */
  onError?: (message: string, context: { streamEstablished: boolean }) => void;
}

/** Parse one SSE event block from a line batch. Exported for tests. */
export function parseSseEvents(
  lines: string[],
  handleEvent: (event: string, data: Record<string, unknown>) => void,
): void {
  let currentEvent = "";
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith("data: ") && currentEvent) {
      const dataStr = line.slice(6);
      try {
        const data = JSON.parse(dataStr) as Record<string, unknown>;
        handleEvent(currentEvent, data);
      } catch {
        // Non-JSON data line, skip
      }
      currentEvent = "";
    } else if (line === "") {
      currentEvent = "";
    }
  }
}

/**
 * Returns a `send` function that POSTs to a streaming endpoint and
 * a reactive `state` object that updates through the streaming lifecycle.
 */
const STREAM_IDLE_MS = 120_000;

export function useStreamingChat(endpoint: string, options?: UseStreamingChatOptions) {
  const [state, setState] = useState<StreamingState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const completionRef = useRef(false);
  const latestReplyRef = useRef<Record<string, unknown> | undefined>(undefined);
  const streamEstablishedRef = useRef(false);

  const reset = useCallback(() => {
    completionRef.current = false;
    latestReplyRef.current = undefined;
    streamEstablishedRef.current = false;
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
    });
  }, []);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, STREAM_IDLE_MS);

      completionRef.current = false;
      latestReplyRef.current = undefined;
      streamEstablishedRef.current = false;
      setState({ phase: "connecting", thinkingText: "", isDeep: false, streamEstablished: false });

      await refreshSessionIfNeeded();
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
          const msg = `Stream error: ${res.status} ${errText}`;
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

        const handleEvent = (event: string, data: Record<string, unknown>) => {
          switch (event) {
            case "meta":
              streamEstablishedRef.current = true;
              setState((s) => ({
                ...s,
                phase: "connecting",
                isDeep: data.deep === true,
                model: (data.model as string) || undefined,
                streamEstablished: true,
              }));
              break;

            case "thinking_start":
              streamEstablishedRef.current = true;
              setState((s) => ({
                ...s,
                phase: "thinking",
                thinkingText: "",
                streamEstablished: true,
              }));
              break;

            case "thinking_chunk":
              streamEstablishedRef.current = true;
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

            case "reply":
              streamEstablishedRef.current = true;
              latestReplyRef.current = data;
              setState((s) => ({
                ...s,
                phase: "replying",
                reply: data,
                streamEstablished: true,
              }));
              break;

            case "done":
              streamEstablishedRef.current = true;
              latestReplyRef.current = data;
              setState((s) => ({
                ...s,
                phase: "done",
                reply: data,
                thinkingText: (data.reasoning as string) || s.thinkingText,
                thinkingDurationMs: (data.thinkingDurationMs as number) || s.thinkingDurationMs,
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

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          parseSseEvents(lines, handleEvent);
        }

        if (controller.signal.aborted) return;

        if (completionRef.current) return;

        if (latestReplyRef.current) {
          const payload = latestReplyRef.current;
          setState((s) => ({ ...s, phase: "done", reply: payload }));
          finalizeComplete(payload);
          return;
        }

        const msg = "Stream ended before the Director finished replying";
        setState({ ...INITIAL_STATE, phase: "error", error: msg });
        finalizeError(msg);
      } catch (e: unknown) {
        if ((e as Error)?.name === "AbortError") {
          if (timedOut) {
            const msg = "Stream timed out before the Director finished";
            setState({ ...INITIAL_STATE, phase: "error", error: msg });
            finalizeError(msg);
          }
          return;
        }
        const msg = (e as Error)?.message || "Stream connection failed";
        setState({ ...INITIAL_STATE, phase: "error", error: msg });
        finalizeError(msg);
      } finally {
        window.clearTimeout(timeoutId);
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
