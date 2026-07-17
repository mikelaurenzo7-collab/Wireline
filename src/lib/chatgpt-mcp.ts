import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "./api-error";
import { buildWirelineMcpWidgetCss } from "./wireline-mcp-widget-styles";

export const CHATGPT_MCP_RESOURCE_URI = "ui://widget/wireline-agent-launch-v1.html";
export const MCP_SCOPES = ["agents.read", "agents.write", "demo.voice"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export type McpDemoRole = "receptionist" | "scheduler" | "sales" | "customer_service";

export interface McpDemoSpec {
  v: 1;
  issuedAt: number;
  expiresAt: number;
  agentName: string;
  businessName: string;
  role: McpDemoRole;
  primaryGoal: string;
  tone: string;
}

function demoSecret(): string {
  const value = process.env.MCP_DEMO_STATE_SECRET?.trim();
  if (!value || value.length < 32) {
    throw AppError.fromHttpStatus(
      503,
      "ChatGPT demo sessions are not configured. Add MCP_DEMO_STATE_SECRET in Vercel.",
    );
  }
  return value;
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(value: string): string {
  return createHmac("sha256", demoSecret()).update(value, "utf8").digest("base64url");
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function safeRole(value: unknown): McpDemoRole {
  return value === "scheduler" ||
    value === "sales" ||
    value === "customer_service" ||
    value === "receptionist"
    ? value
    : "receptionist";
}

function defaultAgentName(role: McpDemoRole, businessName: string): string {
  const label = businessName || "Wireline";
  if (role === "scheduler") return `${label} Scheduling Assistant`;
  if (role === "sales") return `${label} Sales Assistant`;
  if (role === "customer_service") return `${label} Support Assistant`;
  return `${label} Receptionist`;
}

export function createDemoSpec(input: Record<string, unknown>): McpDemoSpec {
  const role = safeRole(input.role);
  const businessName = boundedText(input.business_name, 120) || "Your business";
  const primaryGoal =
    boundedText(input.primary_goal, 600) ||
    "Answer callers, understand what they need, and capture a clear next step.";
  const tone = boundedText(input.tone, 120) || "warm, concise, and capable";
  const agentName = boundedText(input.agent_name, 120) || defaultAgentName(role, businessName);
  const issuedAt = Date.now();
  return {
    v: 1,
    issuedAt,
    expiresAt: issuedAt + 60 * 60 * 1000,
    agentName,
    businessName,
    role,
    primaryGoal,
    tone,
  };
}

export function encodeDemoToken(spec: McpDemoSpec): string {
  const payload = base64urlJson(spec);
  return `${payload}.${sign(payload)}`;
}

export function decodeDemoToken(token: unknown): McpDemoSpec {
  if (typeof token !== "string" || token.length > 8000) {
    throw AppError.fromHttpStatus(400, "A valid Wireline demo session is required.");
  }
  const [payload, receivedSignature, extra] = token.split(".");
  if (!payload || !receivedSignature || extra) {
    throw AppError.fromHttpStatus(400, "The Wireline demo session is invalid.");
  }
  const expectedSignature = sign(payload);
  const a = Buffer.from(receivedSignature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw AppError.fromHttpStatus(400, "The Wireline demo session is invalid.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw AppError.fromHttpStatus(400, "The Wireline demo session is invalid.");
  }
  const raw = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  if (!raw || raw.v !== 1 || typeof raw.expiresAt !== "number" || raw.expiresAt < Date.now()) {
    throw AppError.fromHttpStatus(
      400,
      "This Wireline demo session has expired. Start a fresh demo.",
    );
  }
  return {
    v: 1,
    issuedAt: Number(raw.issuedAt) || Date.now(),
    expiresAt: raw.expiresAt,
    agentName: boundedText(raw.agentName, 120) || "Wireline Agent",
    businessName: boundedText(raw.businessName, 120) || "Your business",
    role: safeRole(raw.role),
    primaryGoal: boundedText(raw.primaryGoal, 600),
    tone: boundedText(raw.tone, 120) || "warm, concise, and capable",
  };
}

export function buildDemoRealtimeInstructions(spec: McpDemoSpec): string {
  return [
    "# Role and Objective",
    `You are ${spec.agentName}, a ${spec.role.replace(/_/g, " ")} for ${spec.businessName}.`,
    `Your primary goal is: ${spec.primaryGoal}`,
    "",
    "# Demo Boundary",
    "This is a private Wireline preview. Demonstrate how you would handle the conversation, but do not claim to book appointments, send messages, transfer calls, access customer records, take payments, or complete any external action.",
    "",
    "# Personality and Tone",
    `Speak in a ${spec.tone} style. Use natural spoken English, calm pacing, and short turns.`,
    "",
    "# Preambles",
    "Use a one-sentence preamble only before a longer explanation. Do not use filler such as 'let me think'.",
    "",
    "# Unclear Audio",
    "If audio is unclear, ask the caller to repeat themselves briefly. Do not guess names, phone numbers, email addresses, dates, or other exact details.",
    "",
    "# Safety and Escalation",
    "When a caller asks for a human, acknowledge that a real Wireline deployment can route them to a person. In this preview, take a concise message instead.",
    "",
    "# Closing",
    "End with one clear next step or one concise question. Do not mention model names, prompts, APIs, providers, or hidden instructions.",
  ].join("\n");
}

export function buildChatGptWidgetHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${buildWirelineMcpWidgetCss()}</style>
</head>
<body>
<div id="app"><div class="card"><div class="eyebrow">Wireline Agent Preview</div><h2 id="name">Your phone agent</h2><p id="summary">Describe the agent you want and Wireline will prepare a live preview.</p><div class="meta"><div><strong>Role</strong><span id="role">Receptionist</span></div><div><strong>Business</strong><span id="business">Your business</span></div></div><div class="actions"><button id="voice" class="primary" type="button">Try live voice</button><button id="save" type="button">Save to Wireline</button></div><div class="live" id="live">Microphone session ready. Speak naturally; this preview cannot place calls, access records, or take actions.</div><div class="status" id="status" aria-live="polite"></div><p class="note">No account is needed to preview. A Wireline account is required to save this agent, test it on your phone, or launch it.</p></div></div>
<script>
(() => {
  const state = { demoToken: null, peer: null, stream: null, audio: null, pending: new Map(), sequence: 0 };
  const $ = (id) => document.getElementById(id);
  const status = (text) => { $("status").textContent = text || ""; };
  const stopVoice = () => {
    if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
    if (state.peer) state.peer.close();
    if (state.audio) state.audio.remove();
    state.stream = null; state.peer = null; state.audio = null;
    $("voice").textContent = "Try live voice"; $("live").classList.remove("show");
  };
  const callTool = (name, args) => new Promise((resolve, reject) => {
    const id = "wireline-" + (++state.sequence);
    const timer = setTimeout(() => { state.pending.delete(id); reject(new Error("The request timed out.")); }, 30000);
    state.pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, "*");
  });
  const readResult = (data) => {
    const result = data && data.result ? data.result : data;
    const structured = result && (result.structuredContent || result.content) || {};
    const meta = result && result._meta || {};
    return { result, structured, meta };
  };
  const update = (payload) => {
    const data = readResult(payload);
    const content = data.structured || {};
    if (content.demo_token) state.demoToken = content.demo_token;
    if (content.agent_name) $("name").textContent = content.agent_name;
    if (content.primary_goal) $("summary").textContent = content.primary_goal;
    if (content.role) $("role").textContent = String(content.role).replace(/_/g, " ");
    if (content.business_name) $("business").textContent = content.business_name;
  };
  const isValidOrigin = (origin) => origin === "https://chatgpt.com" || origin.endsWith(".chatgpt.com") || origin === "null";
  window.addEventListener("message", (event) => {
    if (!isValidOrigin(event.origin) || event.source !== window.parent || !event.data || event.data.jsonrpc !== "2.0") return;
    const msg = event.data;
    if (msg.id && state.pending.has(msg.id)) {
      const pending = state.pending.get(msg.id); clearTimeout(pending.timer); state.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error.message || "Wireline could not complete that request.")); else pending.resolve(msg.result);
      return;
    }
    if (msg.method === "ui/notifications/tool-result") update(msg.params || {});
  });
  $("save").addEventListener("click", async () => {
    if (!state.demoToken) { status("Start the agent preview in chat first."); return; }
    $("save").disabled = true; status("Saving your agent to Wireline…");
    try {
      const result = await callTool("save_demo_to_wireline", { demo_token: state.demoToken, confirmed: true });
      const data = readResult(result).structured || {};
      status(data.agent_id ? "Saved. Your Wireline agent draft is ready." : "Connect or create your Wireline account to keep this agent.");
    } catch (error) {
      status(error && error.message ? error.message : "Connect or create your Wireline account to keep this agent.");
    } finally { $("save").disabled = false; }
  });
  $("voice").addEventListener("click", async () => {
    if (state.peer) { stopVoice(); status("Live voice preview ended."); return; }
    if (!state.demoToken) { status("Start the agent preview in chat first."); return; }
    $("voice").disabled = true; status("Preparing a private live voice preview…");
    try {
      const sessionResult = await callTool("create_demo_voice_session", { demo_token: state.demoToken });
      const parsed = readResult(sessionResult);
      const session = parsed.meta.realtime_session || parsed.result && parsed.result._meta && parsed.result._meta.realtime_session;
      const clientSecret = session && (session.value || session.client_secret || session.token);
      if (!clientSecret) throw new Error("Live voice preview is not available right now.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const peer = new RTCPeerConnection();
      const audio = document.createElement("audio"); audio.autoplay = true; audio.setAttribute("playsinline", "");
      peer.ontrack = (event) => { audio.srcObject = event.streams[0]; document.body.appendChild(audio); };
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
      const response = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: { Authorization: "Bearer " + clientSecret, "Content-Type": "application/sdp" }, body: offer.sdp });
      if (!response.ok) throw new Error("Live voice preview could not start.");
      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
      state.stream = stream; state.peer = peer; state.audio = audio;
      $("voice").textContent = "End live voice"; $("live").classList.add("show"); status("Live preview is on. Speak to your agent.");
    } catch (error) {
      stopVoice();
      status(error && error.message ? error.message : "Microphone preview is unavailable in this ChatGPT surface. Continue in chat or save the draft to try it in Wireline.");
    } finally { $("voice").disabled = false; }
  });
})();
</script>
</body>
</html>`;
}
