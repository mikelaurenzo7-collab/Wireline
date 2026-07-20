import { buildWirelineMcpWidgetCss } from "./wireline-mcp-widget-styles";

export const CHATGPT_ACCOUNT_WIDGET_URI = "ui://widget/wireline-agent-draft-v2.html";

/**
 * Account-bound widget. It intentionally has no create/save action: creation
 * occurs through the OAuth-protected tool so every resulting draft belongs to
 * the connected Wireline workspace.
 *
 * Private voice uses the same Grok/xAI WebSocket + PCM contract as Studio
 * LiveVoiceSandbox — not OpenAI Realtime WebRTC.
 */
export function buildAccountBoundWidgetHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${buildWirelineMcpWidgetCss()}</style>
</head>
<body>
<div id="app"><div class="card"><div class="eyebrow">Wireline agent draft</div><h2 id="name">Your private phone agent</h2><p id="summary">Connect Wireline, then describe the agent you want to create in your workspace.</p><div class="meta"><div><strong>Role</strong><span id="role">Not configured</span></div><div><strong>Business</strong><span id="business">Wireline workspace</span></div></div><div class="actions"><button id="voice" class="primary" type="button" disabled>Try private voice</button><a id="open" class="button" href="https://trywireline.com/studio" target="_blank" rel="noreferrer">Open in Wireline</a></div><div class="live" id="live">Private simulation ready. It cannot place calls, access records, or take an external action.</div><div class="status" id="status" aria-live="polite">Connect Wireline to create a private agent draft.</div><p class="note">Agent drafts are saved to your Wireline account. Phone numbers, real calls, messaging, integrations, and launch are configured separately in Wireline.</p></div></div>
<script>
(() => {
  const RATE = 24000;
  const CHUNK = 2400;
  const state = {
    agentId: null,
    pending: new Map(),
    sequence: 0,
    ws: null,
    stream: null,
    audio: null,
    processor: null,
    source: null,
    sink: null,
    micQueue: new Int16Array(0),
    playTime: 0,
    sources: [],
  };
  const $ = (id) => document.getElementById(id);
  const status = (text) => { $("status").textContent = text || ""; };

  function resample(input, inputRate) {
    if (inputRate === RATE) return input;
    const ratio = inputRate / RATE;
    const output = new Float32Array(Math.max(1, Math.round(input.length / ratio)));
    for (let i = 0; i < output.length; i += 1) {
      const index = i * ratio;
      const left = Math.floor(index);
      const right = Math.min(left + 1, input.length - 1);
      const fraction = index - left;
      output[i] = (input[left] || 0) * (1 - fraction) + (input[right] || 0) * fraction;
    }
    return output;
  }

  function floatToPcm(input, inputRate) {
    const sampled = resample(input, inputRate);
    const pcm = new Int16Array(sampled.length);
    for (let i = 0; i < sampled.length; i += 1) {
      const value = Math.max(-1, Math.min(1, sampled[i] || 0));
      pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
    }
    return pcm;
  }

  function encodePcm(pcm) {
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function decodePcm(input) {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  function stopPlayback() {
    state.sources.forEach((node) => { try { node.stop(); } catch (_) {} });
    state.sources = [];
    state.playTime = state.audio ? state.audio.currentTime : 0;
  }

  function playDelta(delta) {
    if (!state.audio || !delta) return;
    const pcm = decodePcm(delta);
    const buffer = state.audio.createBuffer(1, pcm.length, RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) channel[i] = (pcm[i] || 0) / 0x8000;
    const source = state.audio.createBufferSource();
    source.buffer = buffer;
    source.connect(state.audio.destination);
    const startAt = Math.max(state.playTime, state.audio.currentTime);
    source.start(startAt);
    state.playTime = startAt + buffer.duration;
    state.sources.push(source);
    source.onended = () => {
      state.sources = state.sources.filter((node) => node !== source);
    };
  }

  function flushMic() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN || state.micQueue.length < CHUNK) return;
    while (state.micQueue.length >= CHUNK) {
      const frame = state.micQueue.subarray(0, CHUNK);
      state.micQueue = state.micQueue.subarray(CHUNK);
      state.ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: encodePcm(frame) }));
    }
  }

  function queueMic(floatSamples, sampleRate) {
    const pcm = floatToPcm(floatSamples, sampleRate);
    const next = new Int16Array(state.micQueue.length + pcm.length);
    next.set(state.micQueue, 0);
    next.set(pcm, state.micQueue.length);
    state.micQueue = next.length > CHUNK * 80 ? next.subarray(next.length - CHUNK * 80) : next;
    flushMic();
  }

  function stopVoice() {
    stopPlayback();
    if (state.ws) {
      try { state.ws.close(); } catch (_) {}
    }
    if (state.processor) {
      try { state.processor.disconnect(); } catch (_) {}
    }
    if (state.source) {
      try { state.source.disconnect(); } catch (_) {}
    }
    if (state.sink) {
      try { state.sink.disconnect(); } catch (_) {}
    }
    if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
    if (state.audio) {
      try { state.audio.close(); } catch (_) {}
    }
    state.ws = null;
    state.stream = null;
    state.audio = null;
    state.processor = null;
    state.source = null;
    state.sink = null;
    state.micQueue = new Int16Array(0);
    $("voice").textContent = "Try private voice";
    $("live").classList.remove("show");
  }

  const callTool = (name, args) => new Promise((resolve, reject) => {
    const id = "wireline-" + (++state.sequence);
    const timer = setTimeout(() => {
      state.pending.delete(id);
      reject(new Error("The request timed out."));
    }, 30000);
    state.pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, "*");
  });

  const readResult = (data) => {
    const result = data && data.result ? data.result : data;
    return {
      result,
      structured: (result && (result.structuredContent || result.content)) || {},
      meta: (result && result._meta) || {},
    };
  };

  const update = (payload) => {
    const data = readResult(payload);
    const content = data.structured || {};
    if (content.agent_id) {
      state.agentId = content.agent_id;
      $("voice").disabled = false;
    }
    if (content.agent_name) $("name").textContent = content.agent_name;
    if (content.primary_goal) $("summary").textContent = content.primary_goal;
    if (content.role) $("role").textContent = String(content.role).replace(/_/g, " ");
    if (content.business_name) $("business").textContent = content.business_name;
    if (content.open_in_wireline_url) $("open").href = content.open_in_wireline_url;
    if (content.agent_id) {
      status("Draft saved to your Wireline workspace. You can safely simulate it here or continue configuration in Wireline.");
    }
  };

  const isValidOrigin = (origin) =>
    origin === "https://chatgpt.com" || origin.endsWith(".chatgpt.com") || origin === "null";

  window.addEventListener(
    "message",
    (event) => {
      if (!isValidOrigin(event.origin) || event.source !== window.parent || !event.data || event.data.jsonrpc !== "2.0") return;
      const msg = event.data;
      if (msg.id && state.pending.has(msg.id)) {
        const pending = state.pending.get(msg.id);
        clearTimeout(pending.timer);
        state.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error.message || "Wireline could not complete that request."));
        else pending.resolve(msg.result);
        return;
      }
      if (msg.method === "ui/notifications/tool-result") update(msg.params || {});
    },
    { passive: true },
  );

  $("voice").addEventListener("click", async () => {
    if (state.ws) {
      stopVoice();
      status("Private voice simulation ended.");
      return;
    }
    if (!state.agentId) {
      status("Create or open a Wireline agent draft first.");
      return;
    }
    $("voice").disabled = true;
    status("Preparing a private voice simulation…");
    try {
      const sessionResult = await callTool("start_private_voice_simulation", { agent_id: state.agentId });
      const parsed = readResult(sessionResult);
      const session =
        parsed.meta.realtime_session ||
        (parsed.result && parsed.result._meta && parsed.result._meta.realtime_session);
      const token = session && (session.token || session.value || session.client_secret);
      const endpoint = session && session.endpoint;
      const sessionConfig = session && session.session;
      if (!token || !endpoint || !sessionConfig) {
        throw new Error("Private voice simulation is not available right now.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      const audio = new AudioContext({ sampleRate: RATE });
      await audio.resume();
      const source = audio.createMediaStreamSource(stream);
      const processor = audio.createScriptProcessor(2048, 1, 1);
      const sink = audio.createGain();
      sink.gain.value = 0;
      processor.onaudioprocess = (event) =>
        queueMic(event.inputBuffer.getChannelData(0), audio.sampleRate);
      source.connect(processor);
      processor.connect(sink);
      sink.connect(audio.destination);

      const ws = new WebSocket(String(endpoint), ["xai-client-secret." + token]);
      state.stream = stream;
      state.audio = audio;
      state.source = source;
      state.processor = processor;
      state.sink = sink;
      state.ws = ws;
      state.playTime = 0;

      await new Promise((resolve, reject) => {
        const watchdog = setTimeout(() => {
          reject(new Error("Private voice simulation did not connect."));
        }, 10000);
        ws.onopen = () => {
          clearTimeout(watchdog);
          ws.send(JSON.stringify({ type: "session.update", session: sessionConfig }));
          flushMic();
          if (session.greeting) {
            ws.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "force_message",
                  role: "assistant",
                  interruptible: true,
                  content: [{ type: "output_text", text: session.greeting }],
                },
              }),
            );
          }
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(watchdog);
          reject(new Error("Private voice simulation could not start."));
        };
        ws.onclose = () => {
          clearTimeout(watchdog);
          reject(new Error("Private voice simulation closed before it was ready."));
        };
      });

      ws.onmessage = (message) => {
        let event;
        try {
          event = JSON.parse(String(message.data));
        } catch (_) {
          return;
        }
        const type = String(event.type || "");
        if (type === "response.output_audio.delta" && typeof event.delta === "string") {
          playDelta(event.delta);
        }
        if (type === "input_audio_buffer.speech_started") stopPlayback();
        if (type === "error") {
          const detail = event.error && event.error.message ? event.error.message : "Private voice encountered an error.";
          stopVoice();
          status(detail);
        }
      };

      ws.onclose = () => {
        if (state.ws === ws) {
          stopVoice();
          status("Private voice simulation ended.");
        }
      };

      $("voice").textContent = "End private voice";
      $("live").classList.add("show");
      status("Private simulation is on. Speak to your agent.");
    } catch (error) {
      stopVoice();
      status(
        error && error.message
          ? error.message
          : "Microphone simulation is unavailable in this ChatGPT surface. Continue configuration in Wireline.",
      );
    } finally {
      $("voice").disabled = false;
    }
  });
})();
</script>
</body>
</html>`;
}
