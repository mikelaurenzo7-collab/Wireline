import { useCallback, useEffect, useRef, useState } from "react";
import type Vapi from "@vapi-ai/web";

import { emitProductEvent } from "../lib/product-event-client";

const DEFAULT_MAX_DURATION_SECONDS = 45;
/**
 * The SDK requires a typed assistant ID or assistant DTO even when a proxy owns
 * the real assistant. Wireline's proxy ignores this sentinel and injects the
 * fixed, budgeted server configuration after ticket and quota validation.
 */
const PROTECTED_DEMO_ASSISTANT_SENTINEL = "wireline-protected-public-demo";

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
  if (reason instanceof Error && reason.message) return reason.message;
  return "The live demo could not start. Build free to continue.";
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
  if (response.status === 429) return "The live demo limit is reached for now. Build free to continue.";
  if (response.status === 503) return "The protected live demo is temporarily unavailable.";
  return "The live demo could not start. Build free to continue.";
}

export function useProtectedPublicDemo(
  agentName: string,
  source: "landing_product_theater" | "showcase_browser_demo" = "showcase_browser_demo",
) {
  const [callActive, setCallActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [speakerActive, setSpeakerActive] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [maxDurationSeconds, setMaxDurationSeconds] = useState(DEFAULT_MAX_DURATION_SECONDS);

  const vapiRef = useRef<Vapi | null>(null);
  const watchdogRef = useRef<number | null>(null);
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
    async (token: string, proxyUrl: string, durationSeconds: number): Promise<Vapi> => {
      const { default: VapiSDK } = await import("@vapi-ai/web");
      const absoluteProxyUrl = new URL(proxyUrl, window.location.origin).toString().replace(/\/$/, "");
      const instance = new VapiSDK(token, absoluteProxyUrl);

      instance.on("call-start", () => {
        startedRef.current = true;
        setConnecting(false);
        setCallActive(true);
        setError(null);
        if (typeof window !== "undefined") {
          const analytics = window as AnalyticsWindow;
          analytics.fbq?.("trackCustom", "BrowserCallStart", { agent: agentNameRef.current });
          analytics.plausible?.("BrowserCallStart", {
            props: { agent: agentNameRef.current, source },
          });
        }
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
        const completedCall = startedRef.current;
        startedRef.current = false;
        resetCallState();
        vapiRef.current = null;
        if (completedCall) setCompleted(true);
      });

      instance.on("volume-level", (nextVolume: number) => {
        setVolume(nextVolume);
        setSpeakerActive(nextVolume > 0.02);
      });

      instance.on("error", (reason: unknown) => {
        console.error("[wireline:public-demo] voice bridge error:", reason);
        startedRef.current = false;
        resetCallState();
        vapiRef.current = null;
        setError("The live connection ended. Build free to keep going.");
      });

      return instance;
    },
    [clearWatchdog, resetCallState, source],
  );

  const start = useCallback(async () => {
    if (connecting || callActive || completed) return;

    try {
      setConnecting(true);
      setError(null);
      emitProductEvent({
        event: "landing_demo_clicked",
        surface: "marketing_web",
        metadata: { agent: agentName, mode: "protected_browser_voice", source },
      });

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support microphone-based voice demos.");
      }
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of permissionStream.getTracks()) track.stop();

      const response = await fetch("/api/public/demo-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ agentName, source }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));

      const session = (await response.json()) as DemoSessionResponse;
      if (!session.token || !session.proxyUrl) {
        throw new Error("The protected live demo is temporarily unavailable.");
      }

      const duration = Math.max(
        15,
        Math.min(DEFAULT_MAX_DURATION_SECONDS, Number(session.maxDurationSeconds) || 0),
      );
      setMaxDurationSeconds(duration);
      const instance = await createVapi(session.token, session.proxyUrl, duration);
      vapiRef.current = instance;
      await instance.start(PROTECTED_DEMO_ASSISTANT_SENTINEL);
    } catch (reason: unknown) {
      console.error("[wireline:public-demo] Call start failed:", reason);
      startedRef.current = false;
      resetCallState();
      vapiRef.current = null;
      setError(callStartErrorMessage(reason));
    }
  }, [agentName, callActive, completed, connecting, createVapi, resetCallState, source]);

  const stop = useCallback(() => {
    if (!callActive || connecting) return;
    setConnecting(true);
    try {
      vapiRef.current?.stop();
    } catch {
      resetCallState();
    }
  }, [callActive, connecting, resetCallState]);

  const toggle = useCallback(() => {
    if (callActive) {
      stop();
      return;
    }
    void start();
  }, [callActive, start, stop]);

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
