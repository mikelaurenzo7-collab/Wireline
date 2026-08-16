import { useCallback, useEffect, useRef, useState } from "react";
import type Vapi from "@vapi-ai/web";

import { PUBLIC_BROWSER_DEMO_MAX_SECONDS } from "../lib/public-browser-demo";
import { emitProductEvent } from "../lib/product-event-client";

/**
 * The SDK requires an assistant identifier even though Wireline's proxy owns
 * the real, fixed assistant payload. The proxy ignores this sentinel after it
 * validates the one-use ticket and provider budget.
 */
const PROTECTED_DEMO_ASSISTANT_SENTINEL = "wireline-protected-public-demo";
const PUBLIC_DEMO_SESSION_REQUEST_TIMEOUT_MS = 15_000;
const PUBLIC_DEMO_CONNECTION_TIMEOUT_MS = 20_000;

type PublicDemoSource = "landing_product_theater" | "showcase_browser_demo";

type DemoSessionResponse = {
  token: string;
  proxyUrl: string;
  expiresAt: string;
  maxDurationSeconds: number;
};

type AnalyticsWindow = Window & {
  fbq?: (event: string, action: string, data?: Record<string, unknown>) => void;
  plausible?: (event: string, data?: Record<string, unknown>) => void;
};

function callStartErrorMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "NotAllowedError") {
    return "Microphone access is required for the live demo.";
  }
  if (reason instanceof DOMException && reason.name === "NotFoundError") {
    return "No microphone was found on this device.";
  }
  if (reason instanceof DOMException && reason.name === "AbortError") {
    return "The protected live demo took too long to start. Try the public demo line instead.";
  }

  // Preserve only messages intentionally produced by Wireline's public route or
  // this hook. Provider/SDK exception text can contain internal transport detail
  // and is not a customer-safe error contract.
  const message = reason instanceof Error ? reason.message.trim() : "";
  if (
    message.startsWith("The live demo limit") ||
    message.startsWith("The protected live demo") ||
    message.startsWith("This browser does not support") ||
    message.startsWith("Microphone access") ||
    message.startsWith("No microphone")
  ) {
    return message;
  }
  return "The protected live demo could not start. Try the public demo line instead.";
}

async function responseMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: string | { message?: string }; message?: string }
    | null;
  if (typeof body?.error === "string" && body.error) return body.error;
  if (body?.error && typeof body.error === "object" && body.error.message) {
    return body.error.message;
  }
  if (body?.message) return body.message;
  if (response.status === 429) {
    return "The live demo limit is reached for now. Try the public demo line instead.";
  }
  if (response.status === 503) return "The protected live demo is temporarily unavailable.";
  return "The protected live demo could not start.";
}

export function useProtectedPublicDemo(
  agentName: string,
  source: PublicDemoSource = "showcase_browser_demo",
) {
  const [callActive, setCallActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [speakerActive, setSpeakerActive] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [maxDurationSeconds, setMaxDurationSeconds] = useState<number>(
    PUBLIC_BROWSER_DEMO_MAX_SECONDS,
  );

  const vapiRef = useRef<Vapi | null>(null);
  const sessionAbortRef = useRef<AbortController | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const startedRef = useRef(false);
  const agentNameRef = useRef(agentName);
  agentNameRef.current = agentName;

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const resetCallState = useCallback(() => {
    clearWatchdog();
    setCallActive(false);
    setConnecting(false);
    setSpeakerActive(false);
    setVolume(0);
  }, [clearWatchdog]);

  useEffect(() => {
    return () => {
      attemptRef.current += 1;
      sessionAbortRef.current?.abort();
      sessionAbortRef.current = null;
      clearWatchdog();
      try {
        vapiRef.current?.stop();
      } catch {
        // A session that never connected has nothing to stop.
      }
      vapiRef.current = null;
    };
  }, [clearWatchdog]);

  const createVapi = useCallback(
    async (
      token: string,
      proxyUrl: string,
      durationSeconds: number,
      attempt: number,
    ): Promise<Vapi> => {
      const { default: VapiSDK } = await import("@vapi-ai/web");
      const absoluteProxyUrl = new URL(proxyUrl, window.location.origin)
        .toString()
        .replace(/\/$/, "");
      const instance = new VapiSDK(token, absoluteProxyUrl);

      instance.on("call-start", () => {
        if (attempt !== attemptRef.current || vapiRef.current !== instance) {
          try {
            instance.stop();
          } catch {
            // A superseded attempt is already fenced from UI state.
          }
          return;
        }

        startedRef.current = true;
        setConnecting(false);
        setCallActive(true);
        setError(null);
        const analytics = window as AnalyticsWindow;
        analytics.fbq?.("trackCustom", "BrowserCallStart", {
          agent: agentNameRef.current,
        });
        analytics.plausible?.("BrowserCallStart", {
          props: { agent: agentNameRef.current, source },
        });

        clearWatchdog();
        watchdogRef.current = window.setTimeout(
          () => {
            try {
              instance.stop();
            } catch {
              resetCallState();
            }
          },
          (durationSeconds + 3) * 1000,
        );
      });

      instance.on("call-end", () => {
        if (attempt !== attemptRef.current) return;
        const completedCall = startedRef.current;
        startedRef.current = false;
        resetCallState();
        if (vapiRef.current === instance) vapiRef.current = null;
        if (completedCall) setCompleted(true);
      });

      instance.on("volume-level", (nextVolume: number) => {
        if (attempt !== attemptRef.current) return;
        setVolume(nextVolume);
        setSpeakerActive(nextVolume > 0.02);
      });

      instance.on("error", (reason: unknown) => {
        if (attempt !== attemptRef.current) return;
        console.error("[wireline:public-demo] voice bridge error", {
          name: reason instanceof Error ? reason.name : "unknown",
        });
        try {
          instance.stop();
        } catch {
          // The error may already represent a closed provider session.
        }
        startedRef.current = false;
        resetCallState();
        if (vapiRef.current === instance) vapiRef.current = null;
        setError("The live connection ended. Try the public demo line instead.");
      });

      return instance;
    },
    [clearWatchdog, resetCallState, source],
  );

  const start = useCallback(async () => {
    if (connecting || callActive || completed) return;

    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    startedRef.current = false;
    sessionAbortRef.current?.abort();

    try {
      setConnecting(true);
      setError(null);
      emitProductEvent({
        event: "landing_demo_clicked",
        surface: "marketing_web",
        metadata: { agent: agentName, mode: "protected_browser_voice", source },
      });

      const controller = new AbortController();
      sessionAbortRef.current = controller;
      const requestTimeout = window.setTimeout(
        () => controller.abort(),
        PUBLIC_DEMO_SESSION_REQUEST_TIMEOUT_MS,
      );
      let response: Response;
      try {
        response = await fetch("/api/public/demo-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ agentName, source }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(requestTimeout);
        if (sessionAbortRef.current === controller) sessionAbortRef.current = null;
      }
      if (attempt !== attemptRef.current) return;
      if (!response.ok) throw new Error(await responseMessage(response));

      const session = (await response.json()) as DemoSessionResponse;
      if (!session.token || !session.proxyUrl) {
        throw new Error("The protected live demo is temporarily unavailable.");
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support microphone-based voice demos.");
      }
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of permissionStream.getTracks()) track.stop();
      if (attempt !== attemptRef.current) return;

      const duration = Math.max(
        15,
        Math.min(
          PUBLIC_BROWSER_DEMO_MAX_SECONDS,
          Number(session.maxDurationSeconds) || 0,
        ),
      );
      setMaxDurationSeconds(duration);
      const instance = await createVapi(session.token, session.proxyUrl, duration, attempt);
      if (attempt !== attemptRef.current) {
        try {
          instance.stop();
        } catch {
          // The superseded attempt never became the active owner.
        }
        return;
      }

      vapiRef.current = instance;
      clearWatchdog();
      watchdogRef.current = window.setTimeout(() => {
        if (attempt !== attemptRef.current || startedRef.current) return;
        attemptRef.current += 1;
        try {
          instance.stop();
        } catch {
          // Reset below is authoritative even if the SDK never fully started.
        }
        if (vapiRef.current === instance) vapiRef.current = null;
        resetCallState();
        setError("The live connection took too long. Try the public demo line instead.");
      }, PUBLIC_DEMO_CONNECTION_TIMEOUT_MS);

      await instance.start(PROTECTED_DEMO_ASSISTANT_SENTINEL);
    } catch (reason: unknown) {
      if (attempt !== attemptRef.current) return;
      console.error("[wireline:public-demo] call start failed", {
        name: reason instanceof Error ? reason.name : "unknown",
      });
      try {
        vapiRef.current?.stop();
      } catch {
        // A rejected SDK start may not have a connected session to stop.
      }
      startedRef.current = false;
      resetCallState();
      vapiRef.current = null;
      setError(callStartErrorMessage(reason));
    }
  }, [agentName, callActive, completed, connecting, createVapi, clearWatchdog, resetCallState, source]);

  const stop = useCallback(() => {
    if (!callActive && !connecting) return;

    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    if (connecting && !callActive) {
      // Fence the in-flight fetch, permission prompt, or SDK start. Each await
      // checks this generation before it can reclaim UI or provider ownership.
      attemptRef.current += 1;
    }

    const instance = vapiRef.current;
    if (!callActive) {
      try {
        instance?.stop();
      } catch {
        // A connecting session may not yet have anything to stop.
      }
      vapiRef.current = null;
      startedRef.current = false;
      resetCallState();
      return;
    }

    setConnecting(true);
    try {
      instance?.stop();
    } catch {
      resetCallState();
    }
  }, [callActive, connecting, resetCallState]);

  const toggle = useCallback(() => {
    if (callActive || connecting) {
      stop();
      return;
    }
    void start();
  }, [callActive, connecting, start, stop]);

  return {
    callActive,
    connecting,
    speakerActive,
    volume,
    error,
    completed,
    maxDurationSeconds,
    start,
    stop,
    toggle,
  };
}
