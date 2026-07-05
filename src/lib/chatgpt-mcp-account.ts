import { buildWirelineMcpWidgetCss } from "./wireline-mcp-widget-styles";

export const CHATGPT_ACCOUNT_WIDGET_URI = "ui://widget/wireline-agent-draft-v2.html";

/**
 * Account-bound widget. It intentionally has no create/save action: creation
 * occurs through the OAuth-protected tool so every resulting draft belongs to
 * the connected Wireline workspace.
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
  const state = { agentId: null, peer: null, stream: null, audio: null, pending: new Map(), sequence: 0 };
  const $ = (id) => document.getElementById(id);
  const status = (text) => { $("status").textContent = text || ""; };
  const stopVoice = () => { if (state.stream) state.stream.getTracks().forEach((track) => track.stop()); if (state.peer) state.peer.close(); if (state.audio) state.audio.remove(); state.stream = null; state.peer = null; state.audio = null; $("voice").textContent = "Try private voice"; $("live").classList.remove("show"); };
  const callTool = (name, args) => new Promise((resolve, reject) => { const id = "wireline-" + (++state.sequence); const timer = setTimeout(() => { state.pending.delete(id); reject(new Error("The request timed out.")); }, 30000); state.pending.set(id, { resolve, reject, timer }); window.parent.postMessage({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, "*"); });
  const readResult = (data) => { const result = data && data.result ? data.result : data; return { result, structured: result && (result.structuredContent || result.content) || {}, meta: result && result._meta || {} }; };
  const update = (payload) => { const data = readResult(payload); const content = data.structured || {}; if (content.agent_id) { state.agentId = content.agent_id; $("voice").disabled = false; } if (content.agent_name) $("name").textContent = content.agent_name; if (content.primary_goal) $("summary").textContent = content.primary_goal; if (content.role) $("role").textContent = String(content.role).replace(/_/g, " "); if (content.business_name) $("business").textContent = content.business_name; if (content.open_in_wireline_url) $("open").href = content.open_in_wireline_url; if (content.agent_id) status("Draft saved to your Wireline workspace. You can safely simulate it here or continue configuration in Wireline."); };
  const isValidOrigin = (origin) => origin === "https://chatgpt.com" || origin.endsWith(".chatgpt.com") || origin === "null";
  window.addEventListener("message", (event) => { if (!isValidOrigin(event.origin) || event.source !== window.parent || !event.data || event.data.jsonrpc !== "2.0") return; const msg = event.data; if (msg.id && state.pending.has(msg.id)) { const pending = state.pending.get(msg.id); clearTimeout(pending.timer); state.pending.delete(msg.id); if (msg.error) pending.reject(new Error(msg.error.message || "Wireline could not complete that request.")); else pending.resolve(msg.result); return; } if (msg.method === "ui/notifications/tool-result") update(msg.params || {}); }, { passive: true });
  $("voice").addEventListener("click", async () => { if (state.peer) { stopVoice(); status("Private voice simulation ended."); return; } if (!state.agentId) { status("Create or open a Wireline agent draft first."); return; } $("voice").disabled = true; status("Preparing a private voice simulation…"); try { const sessionResult = await callTool("start_private_voice_simulation", { agent_id: state.agentId }); const parsed = readResult(sessionResult); const session = parsed.meta.realtime_session || parsed.result && parsed.result._meta && parsed.result._meta.realtime_session; const clientSecret = session && (session.value || session.client_secret || session.token); if (!clientSecret) throw new Error("Private voice simulation is not available right now."); const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const peer = new RTCPeerConnection(); const audio = document.createElement("audio"); audio.autoplay = true; audio.setAttribute("playsinline", ""); peer.ontrack = (event) => { audio.srcObject = event.streams[0]; document.body.appendChild(audio); }; stream.getTracks().forEach((track) => peer.addTrack(track, stream)); const offer = await peer.createOffer(); await peer.setLocalDescription(offer); const response = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: { Authorization: "Bearer " + clientSecret, "Content-Type": "application/sdp" }, body: offer.sdp }); if (!response.ok) throw new Error("Private voice simulation could not start."); await peer.setRemoteDescription({ type: "answer", sdp: await response.text() }); state.stream = stream; state.peer = peer; state.audio = audio; $("voice").textContent = "End private voice"; $("live").classList.add("show"); status("Private simulation is on. Speak to your agent."); } catch (error) { stopVoice(); status(error && error.message ? error.message : "Microphone simulation is unavailable in this ChatGPT surface. Continue configuration in Wireline."); } finally { $("voice").disabled = false; } });
})();
</script>
</body>
</html>`;
}
