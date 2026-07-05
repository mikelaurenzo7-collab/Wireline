/**
 * Gates Vapi monitor.listenUrl PCM relay to assistant speech windows.
 * Vapi's transport stream is mixed caller+agent; speech-update events (webhook
 * or listen WebSocket JSON) tell us when the assistant is speaking.
 */

const assistantSpeakingByCall = new Map<string, boolean>();

export function setVapiAssistantSpeaking(callId: string, speaking: boolean): void {
  assistantSpeakingByCall.set(callId, speaking);
}

export function clearVapiAssistantSpeaking(callId: string): void {
  assistantSpeakingByCall.delete(callId);
}

export function isVapiAssistantSpeaking(callId: string): boolean {
  return assistantSpeakingByCall.get(callId) === true;
}

/** Parse Vapi listen/control JSON frames; returns speaking state or null if unrelated. */
export function parseVapiListenControlMessage(raw: string): boolean | null {
  try {
    const msg = JSON.parse(raw) as Record<string, unknown>;
    const type = String(msg.type ?? msg.messageType ?? "");
    if (type === "speech-update") {
      const role = String(msg.role ?? "");
      const status = String(msg.status ?? msg.speechStatus ?? "");
      if (role === "assistant") {
        if (/start/i.test(status)) return true;
        if (/stop|end/i.test(status)) return false;
      }
      if (role === "user" && /start/i.test(status)) return false;
    }
    if (type === "transcript") {
      const role = String(msg.role ?? "");
      const transcriptType = String(msg.transcriptType ?? "");
      if (role === "assistant" && transcriptType === "partial") return true;
    }
  } catch {
    /* non-JSON or vendor shape drift */
  }
  return null;
}

export function applyVapiListenControlMessage(callId: string, raw: string): boolean {
  const next = parseVapiListenControlMessage(raw);
  if (next === null) return isVapiAssistantSpeaking(callId);
  setVapiAssistantSpeaking(callId, next);
  return next;
}
