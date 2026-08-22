import { useCallback, useEffect, useRef, useState } from "react";

import { PUBLIC_BROWSER_DEMO_MAX_SECONDS } from "../lib/public-browser-demo";
import { emitProductEvent } from "../lib/product-event-client";

const PUBLIC_DEMO_SESSION_REQUEST_TIMEOUT_MS = 15_000;
// The server may spend 15s minting a short-lived secret and then 20s exchanging SDP.
// Keep the browser alive through that valid provider window plus transport overhead.
const PUBLIC_DEMO_PROVIDER_SESSION_REQUEST_TIMEOUT_MS = 40_000;
const PUBLIC_DEMO_CONNECTION_TIMEOUT_MS = 20_000;

type PublicDemoSource = "landing_product_theater" | "showcase_browser_demo";

type DemoTicketResponse = {
  token: string;
  providerSessionEndpoint: string;
  expiresAt: string;
  maxDurationSeconds: number;
};

type DemoProviderSession = {
  sdp: string;
  greeting?: string;
  maxDurationSeconds: number;
  endsAt: string;
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
  const body = (await response.json().catch(() => null)) as {
    error?: string | { message?: string };
    message?: string;
  } | null;
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

function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, 5_000);
    function done() {
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }
    function onChange() {
      if (peer.iceGatheringState === "complete") done();
    }
    peer.addEventListener("icegatheringstatechange", onChange);
  });
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

  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const analysisContext = useRef<AudioContext | null>(null);
  const analysisSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const volumeFrame = useRef<number | null>(null);
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

  const releaseTransport = useCallback(() => {
    clearTimers();
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    if (volumeFrame.current !== null) window.cancelAnimationFrame(volumeFrame.current);
    volumeFrame.current = null;

    const activeChannel = channel.current;
    const activePeer = peer.current;
    channel.current = null;
    peer.current = null;
    activeChannel?.close();
    activePeer?.close();

    microphone.current?.getTracks().forEach((track) => track.stop());
    microphone.current = null;
    if (remoteAudio.current) {
      remoteAudio.current.pause();
      remoteAudio.current.srcObject = null;
    }
    remoteAudio.current = null;
    analysisSource.current?.disconnect();
    analyser.current?.disconnect();
    analysisSource.current = null;
    analyser.current = null;
    void analysisContext.current?.close();
    analysisContext.current = null;
    setSpeakerActive(false);
    setVolume(0);
  }, [clearTimers]);

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

  const attachRemoteAudio = useCallback((stream: MediaStream, attempt: number) => {
    const element = new Audio();
    element.autoplay = true;
    element.srcObject = stream;
    remoteAudio.current = element;
    void element.play().catch(() => undefined);

    const context = new AudioContext();
    const sourceNode = context.createMediaStreamSource(stream);
    const analyserNode = context.createAnalyser();
    analyserNode.fftSize = 256;
    sourceNode.connect(analyserNode);
    analysisContext.current = context;
    analysisSource.current = sourceNode;
    analyser.current = analyserNode;

    const samples = new Uint8Array(analyserNode.fftSize);
    const sampleVolume = () => {
      if (attempt !== attemptRef.current || analyser.current !== analyserNode) return;
      analyserNode.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      setVolume(Math.min(1, Math.sqrt(sum / samples.length) * 3));
      volumeFrame.current = window.requestAnimationFrame(sampleVolume);
    };
    sampleVolume();
  }, []);

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

      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
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

      const connection = new RTCPeerConnection();
      const events = connection.createDataChannel("oai-events");
      microphone.current = stream;
      peer.current = connection;
      channel.current = events;
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));

      connection.ontrack = (event) => {
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        attachRemoteAudio(remoteStream, attempt);
      };
      connection.onconnectionstatechange = () => {
        if (attempt !== attemptRef.current) return;
        if (connection.connectionState === "failed") {
          fail("The live connection ended. Try the public demo line instead.");
        }
      };
      events.onmessage = (message) => {
        if (attempt !== attemptRef.current) return;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(String(message.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(event.type || "");
        if (type === "output_audio_buffer.started" || type === "response.created") {
          setSpeakerActive(true);
        }
        if (
          type === "output_audio_buffer.stopped" ||
          type === "response.done" ||
          type === "response.cancelled" ||
          type === "response.failed" ||
          type === "input_audio_buffer.speech_started"
        ) {
          setSpeakerActive(false);
        }
        if (type === "error") {
          fail("The live connection ended. Try the public demo line instead.");
        }
      };
      events.onerror = () => {
        if (attempt === attemptRef.current) {
          fail("The live connection ended. Try the public demo line instead.");
        }
      };
      events.onclose = () => {
        if (attempt === attemptRef.current && startedRef.current) finish(true);
      };

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await waitForIceGathering(connection);
      const sdp = connection.localDescription?.sdp || offer.sdp || "";

      const providerController = new AbortController();
      sessionAbortRef.current = providerController;
      const providerTimeout = window.setTimeout(
        () => providerController.abort(),
        PUBLIC_DEMO_PROVIDER_SESSION_REQUEST_TIMEOUT_MS,
      );
      let providerResponse: Response;
      try {
        providerResponse = await fetch(ticket.providerSessionEndpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ticket.token}`,
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({ sdp }),
          signal: providerController.signal,
        });
      } finally {
        window.clearTimeout(providerTimeout);
        if (sessionAbortRef.current === providerController) sessionAbortRef.current = null;
      }
      if (!providerResponse.ok) throw new Error(await responseMessage(providerResponse));
      const session = (await providerResponse.json()) as DemoProviderSession;
      if (!session.sdp?.startsWith("v=") || !session.endsAt) {
        throw new Error(session.error || "The protected live demo is temporarily unavailable.");
      }
      if (attempt !== attemptRef.current) return;

      const configuredDuration = Math.max(
        15,
        Math.min(
          PUBLIC_BROWSER_DEMO_MAX_SECONDS,
          Number(session.maxDurationSeconds || ticket.maxDurationSeconds) || 0,
        ),
      );
      const serverRemainingMs = new Date(session.endsAt).getTime() - Date.now();
      const remainingMs = Math.min(configuredDuration * 1_000, serverRemainingMs);
      if (!Number.isFinite(remainingMs) || remainingMs < 1_000) {
        throw new Error("The protected live demo took too long to start. Try again.");
      }
      setMaxDurationSeconds(configuredDuration);

      clearTimers();
      watchdogRef.current = window.setTimeout(() => {
        if (attempt === attemptRef.current && !startedRef.current) {
          fail("The live connection took too long. Try the public demo line instead.");
        }
      }, PUBLIC_DEMO_CONNECTION_TIMEOUT_MS);

      events.onopen = () => {
        if (attempt !== attemptRef.current) return;
        if (watchdogRef.current !== null) {
          window.clearTimeout(watchdogRef.current);
          watchdogRef.current = null;
        }
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
          events.send(
            JSON.stringify({
              type: "response.create",
              response: { instructions: `Begin the conversation with this greeting: ${greeting}` },
            }),
          );
        }

        wrapUpTimerRef.current = window.setTimeout(
          () => {
            if (attempt !== attemptRef.current || events.readyState !== "open") return;
            events.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  instructions:
                    "End the demo now in one short sentence and invite the visitor to build a Bot free.",
                },
              }),
            );
          },
          Math.max(1_000, remainingMs - 7_000),
        );
        endTimerRef.current = window.setTimeout(() => finish(true), remainingMs + 500);
      };

      await connection.setRemoteDescription({ type: "answer", sdp: session.sdp });
    } catch (reason: unknown) {
      if (attempt !== attemptRef.current) return;
      console.error("[botbound:public-demo] call start failed", {
        name: reason instanceof Error ? reason.name : "unknown",
      });
      fail(callStartErrorMessage(reason));
    }
  }, [
    agentName,
    attachRemoteAudio,
    callActive,
    clearTimers,
    completed,
    connecting,
    fail,
    finish,
    source,
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
