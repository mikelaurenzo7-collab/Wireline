import { useCallback, useEffect, useRef, useState } from "react";

import { PUBLIC_BROWSER_DEMO_MAX_SECONDS } from "../lib/public-browser-demo";
import { emitProductEvent } from "../lib/product-event-client";
import {
  XAI_BROWSER_PCM_RATE_HZ,
  XAIStreamingPcmEncoder,
  base64Pcm16LeToFloat32,
} from "../lib/voice/browser-pcm";

const PUBLIC_DEMO_SESSION_REQUEST_TIMEOUT_MS = 15_000;
const PUBLIC_DEMO_CONNECTION_TIMEOUT_MS = 20_000;
const CAPTURE_BUFFER_SIZE = 4_096;

type PublicDemoSource = "landing_product_theater" | "showcase_browser_demo";

type DemoTicketResponse = {
  token: string;
  providerSessionEndpoint: string;
  expiresAt: string;
  maxDurationSeconds: number;
};

type DemoProviderSession = {
  clientSecret: string;
  websocketUrl: string;
  greeting?: string;
  session: Record<string, unknown>;
  maxDurationSeconds: number;
  error?: string;
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

  const message = reason instanceof Error ? reason.message.trim() : "";
  if (
    message.startsWith("The live demo limit") ||
    message.startsWith("The protected live demo") ||
    message.startsWith("This browser does not support") ||
    message.startsWith("Microphone access") ||
    message.startsWith("No microphone") ||
    message.startsWith("The live connection")
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

function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] || 0;
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 2.5);
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

  const socket = useRef<WebSocket | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const captureSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const captureProcessor = useRef<ScriptProcessorNode | null>(null);
  const captureSink = useRef<GainNode | null>(null);
  const captureEncoder = useRef<XAIStreamingPcmEncoder | null>(null);
  const playbackSource = useRef<AudioBufferSourceNode | null>(null);
  const playbackQueue = useRef<Float32Array[]>([]);
  const playbackActive = useRef(false);
  const sessionReady = useRef(false);
  const sessionAbortRef = useRef<AbortController | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const wrapUpTimerRef = useRef<number | null>(null);
  const endTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const startedRef = useRef(false);
  const agentNameRef = useRef(agentName);
  agentNameRef.current = agentName;

  const clearTimers = useCallback(() => {
    for (const timer of [watchdogRef, wrapUpTimerRef, endTimerRef]) {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    }
  }, []);

  const stopPlayback = useCallback(() => {
    try {
      playbackSource.current?.stop();
    } catch {
      // A source may have already ended naturally.
    }
    playbackSource.current?.disconnect();
    playbackSource.current = null;
    playbackQueue.current = [];
    playbackActive.current = false;
    setSpeakerActive(false);
    setVolume(0);
  }, []);

  const playNextChunk = useCallback(() => {
    const context = audioContext.current;
    const chunk = playbackQueue.current.shift();
    if (!context || !chunk) {
      playbackActive.current = false;
      playbackSource.current = null;
      setSpeakerActive(false);
      setVolume(0);
      return;
    }

    playbackActive.current = true;
    setSpeakerActive(true);
    setVolume(rms(chunk));
    const buffer = context.createBuffer(1, chunk.length, XAI_BROWSER_PCM_RATE_HZ);
    buffer.getChannelData(0).set(chunk);
    const sourceNode = context.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.connect(context.destination);
    playbackSource.current = sourceNode;
    sourceNode.onended = () => {
      if (playbackSource.current === sourceNode) playbackSource.current = null;
      playNextChunk();
    };
    sourceNode.start();
  }, []);

  const playAudio = useCallback(
    (base64: string) => {
      if (!base64 || !audioContext.current) return;
      playbackQueue.current.push(base64Pcm16LeToFloat32(base64));
      if (!playbackActive.current) playNextChunk();
    },
    [playNextChunk],
  );

  const releaseTransport = useCallback(() => {
    clearTimers();
    sessionReady.current = false;
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    captureEncoder.current?.reset();
    captureEncoder.current = null;
    socket.current?.close(1000, "Wireline protected demo ended");
    socket.current = null;
    microphone.current?.getTracks().forEach((track) => track.stop());
    microphone.current = null;
    captureProcessor.current?.disconnect();
    captureProcessor.current = null;
    captureSource.current?.disconnect();
    captureSource.current = null;
    captureSink.current?.disconnect();
    captureSink.current = null;
    stopPlayback();
    void audioContext.current?.close();
    audioContext.current = null;
  }, [clearTimers, stopPlayback]);

  const resetCallState = useCallback(() => {
    setCallActive(false);
    setConnecting(false);
    setSpeakerActive(false);
    setVolume(0);
  }, []);

  const finish = useCallback(
    (markCompleted: boolean) => {
      attemptRef.current += 1;
      const hadStarted = startedRef.current;
      startedRef.current = false;
      releaseTransport();
      resetCallState();
      if (markCompleted && hadStarted) setCompleted(true);
    },
    [releaseTransport, resetCallState],
  );

  const fail = useCallback(
    (message: string) => {
      attemptRef.current += 1;
      startedRef.current = false;
      releaseTransport();
      resetCallState();
      setError(message);
    },
    [releaseTransport, resetCallState],
  );

  const startCapture = useCallback(
    async (stream: MediaStream, ws: WebSocket, attempt: number) => {
      const context = new AudioContext();
      if (context.state === "suspended") await context.resume();
      if (attempt !== attemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        await context.close();
        return;
      }

      const encoder = new XAIStreamingPcmEncoder({ sourceRateHz: context.sampleRate });
      const sourceNode = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
      const sink = context.createGain();
      sink.gain.value = 0;
      processor.onaudioprocess = (event) => {
        if (!sessionReady.current || ws.readyState !== WebSocket.OPEN) return;
        for (const audio of encoder.push(event.inputBuffer.getChannelData(0))) {
          ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
        }
      };
      sourceNode.connect(processor);
      processor.connect(sink);
      sink.connect(context.destination);

      microphone.current = stream;
      audioContext.current = context;
      captureSource.current = sourceNode;
      captureProcessor.current = processor;
      captureSink.current = sink;
      captureEncoder.current = encoder;
    },
    [],
  );

  useEffect(() => {
    return () => {
      attemptRef.current += 1;
      releaseTransport();
    };
  }, [releaseTransport]);

  const start = useCallback(async () => {
    if (connecting || callActive || completed) return;

    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    startedRef.current = false;
    setConnecting(true);
    setError(null);
    emitProductEvent({
      event: "landing_demo_clicked",
      surface: "marketing_web",
      metadata: { agent: agentName, mode: "protected_browser_voice", source },
    });

    try {
      const controller = new AbortController();
      sessionAbortRef.current = controller;
      const requestTimeout = window.setTimeout(
        () => controller.abort(),
        PUBLIC_DEMO_SESSION_REQUEST_TIMEOUT_MS,
      );
      let preflight: Response;
      try {
        preflight = await fetch("/api/public/demo-session", {
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
      if (!preflight.ok) throw new Error(await responseMessage(preflight));
      const ticket = (await preflight.json()) as DemoTicketResponse;
      if (!ticket.token || !ticket.providerSessionEndpoint) {
        throw new Error("The protected live demo is temporarily unavailable.");
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support microphone-based voice demos.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (attempt !== attemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const providerResponse = await fetch(ticket.providerSessionEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ticket.token}`,
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: "{}",
      });
      if (!providerResponse.ok) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error(await responseMessage(providerResponse));
      }
      const session = (await providerResponse.json()) as DemoProviderSession;
      if (!session.clientSecret || !session.websocketUrl || !session.session) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error(session.error || "The protected live demo is temporarily unavailable.");
      }
      if (attempt !== attemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const duration = Math.max(
        15,
        Math.min(
          PUBLIC_BROWSER_DEMO_MAX_SECONDS,
          Number(session.maxDurationSeconds || ticket.maxDurationSeconds) || 0,
        ),
      );
      setMaxDurationSeconds(duration);

      const ws = new WebSocket(session.websocketUrl, [
        `xai-client-secret.${session.clientSecret}`,
      ]);
      socket.current = ws;
      await startCapture(stream, ws, attempt);
      if (attempt !== attemptRef.current) return;

      clearTimers();
      watchdogRef.current = window.setTimeout(() => {
        if (attempt === attemptRef.current && !sessionReady.current) {
          fail("The live connection took too long. Try the public demo line instead.");
        }
      }, PUBLIC_DEMO_CONNECTION_TIMEOUT_MS);

      ws.onmessage = (message) => {
        if (attempt !== attemptRef.current) return;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(String(message.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(event.type || "");
        if (type === "conversation.created") {
          ws.send(JSON.stringify({ type: "session.update", session: session.session }));
        }
        if (type === "session.updated" && !sessionReady.current) {
          if (watchdogRef.current !== null) {
            window.clearTimeout(watchdogRef.current);
            watchdogRef.current = null;
          }
          sessionReady.current = true;
          startedRef.current = true;
          setConnecting(false);
          setCallActive(true);
          setError(null);

          const analytics = window as AnalyticsWindow;
          analytics.fbq?.("trackCustom", "BrowserCallStart", { agent: agentNameRef.current });
          analytics.plausible?.("BrowserCallStart", {
            props: { agent: agentNameRef.current, source },
          });

          const greeting = session.greeting?.trim();
          if (greeting) {
            ws.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "force_message",
                  role: "assistant",
                  interruptible: true,
                  content: [{ type: "output_text", text: greeting }],
                },
              }),
            );
          }

          wrapUpTimerRef.current = window.setTimeout(
            () => {
              if (attempt !== attemptRef.current || ws.readyState !== WebSocket.OPEN) return;
              ws.send(JSON.stringify({ type: "response.cancel" }));
              ws.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "force_message",
                    role: "assistant",
                    interruptible: false,
                    content: [
                      {
                        type: "output_text",
                        text: "That’s the demo. Build your own Wireline voice agent free when you’re ready.",
                      },
                    ],
                  },
                }),
              );
            },
            Math.max(8, duration - 7) * 1_000,
          );
          endTimerRef.current = window.setTimeout(() => finish(true), (duration + 1) * 1_000);
        }
        if (
          (type === "response.output_audio.delta" || type === "response.audio.delta") &&
          typeof event.delta === "string"
        ) {
          playAudio(event.delta);
        }
        if (type === "input_audio_buffer.speech_started") {
          stopPlayback();
        }
        if (type === "error") {
          fail("The live connection ended. Try the public demo line instead.");
        }
      };
      ws.onerror = () => {
        if (attempt === attemptRef.current) {
          fail("The live connection ended. Try the public demo line instead.");
        }
      };
      ws.onclose = (event) => {
        if (attempt !== attemptRef.current) return;
        if (event.code === 1000) {
          finish(true);
        } else {
          fail("The live connection ended. Try the public demo line instead.");
        }
      };
    } catch (reason: unknown) {
      if (attempt !== attemptRef.current) return;
      console.error("[wireline:public-demo] call start failed", {
        name: reason instanceof Error ? reason.name : "unknown",
      });
      fail(callStartErrorMessage(reason));
    }
  }, [
    agentName,
    callActive,
    clearTimers,
    completed,
    connecting,
    fail,
    finish,
    playAudio,
    source,
    startCapture,
    stopPlayback,
  ]);

  const stop = useCallback(() => {
    if (!callActive && !connecting) return;
    finish(startedRef.current);
  }, [callActive, connecting, finish]);

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
