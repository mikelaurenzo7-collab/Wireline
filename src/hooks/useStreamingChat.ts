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
import { getFreshAccessToken } from "../lib/api";

export type StreamPhase = "idle" | "connecting" | "thinking" | "replying" | "done" | "error";

export interface StreamingState {
  /** Current phase of the streaming lifecycle. */
  phase: StreamPhase;
  /** Accumulated thinking text so far. */
  thinkingText: string;
  /** Whether the model is using deep (Opus) analysis. */
  isDeep: boolean;
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
};

interface UseStreamingChatOptions {
  /** Called when the full response is complete. */
  onComplete?: (data: Record<string, unknown>) => void;
  /** Called on error. */
  onError?: (message: string) => void;
}

/**
 * Returns a `send` function that POSTs to a streaming endpoint and
 * a reactive `state` object that updates through the streaming lifecycle.
 */
export function useStreamingChat(endpoint: string, options?: UseStreamingChatOptions) {
  const [state, setState] = useState<StreamingState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => (s.phase === "idle" || s.phase === "done" ? s : { ...s, phase: "idle" }));
  }, []);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      // Abort any existing stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ phase: "connecting", thinkingText: "", isDeep: false });

      const token = await getFreshAccessToken();
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: "Bearer " + token } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "Stream failed");
          const msg = `Stream error: ${res.status} ${errText}`;
          setState({ ...INITIAL_STATE, phase: "error", error: msg });
          options?.onError?.(msg);
          return;
        }

        if (!res.body) {
          setState({ ...INITIAL_STATE, phase: "error", error: "No response body" });
          options?.onError?.("No response body");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          let currentEvent = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ") && currentEvent) {
              const dataStr = line.slice(6);
              try {
                const data = JSON.parse(dataStr);
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

        // If we never got a "done" event, finalize anyway
        setState((s) => {
          if (s.phase !== "done" && s.phase !== "error") {
            return { ...s, phase: "done" };
          }
          return s;
        });
      } catch (e: unknown) {
        if ((e as Error)?.name === "AbortError") return;
        const msg = (e as Error)?.message || "Stream connection failed";
        setState({ ...INITIAL_STATE, phase: "error", error: msg });
        options?.onError?.(msg);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint],
  );

  function handleEvent(event: string, data: Record<string, unknown>) {
    switch (event) {
      case "meta":
        setState((s) => ({
          ...s,
          phase: "connecting",
          isDeep: data.deep === true,
          model: (data.model as string) || undefined,
        }));
        break;

      case "thinking_start":
        setState((s) => ({ ...s, phase: "thinking", thinkingText: "" }));
        break;

      case "thinking_chunk":
        setState((s) => ({
          ...s,
          phase: "thinking",
          thinkingText: s.thinkingText + ((data.text as string) || ""),
        }));
        break;

      case "thinking_end":
        setState((s) => ({
          ...s,
          phase: "thinking",
          thinkingText: (data.thinking as string) || s.thinkingText,
          thinkingDurationMs: (data.durationMs as number) || undefined,
        }));
        break;

      case "reply":
        setState((s) => ({ ...s, phase: "replying", reply: data }));
        break;

      case "done":
        setState((s) => ({
          ...s,
          phase: "done",
          reply: data,
          thinkingText: (data.reasoning as string) || s.thinkingText,
          thinkingDurationMs: (data.thinkingDurationMs as number) || s.thinkingDurationMs,
        }));
        options?.onComplete?.(data);
        break;

      case "error":
        setState((s) => ({
          ...s,
          phase: "error",
          error: (data.message as string) || "Stream error",
        }));
        options?.onError?.((data.message as string) || "Stream error");
        break;
    }
  }

  return {
    state,
    send,
    reset,
    abort,
    isStreaming: state.phase !== "idle" && state.phase !== "done" && state.phase !== "error",
  };
}
