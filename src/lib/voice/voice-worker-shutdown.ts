/**
 * Shutdown evidence for the persistent voice worker.
 *
 * Render sends SIGTERM to the old instance on every deploy and SIGKILLs it
 * after maxShutdownDelaySeconds (300 at most). A phone call can run up to an
 * hour, so a call still active when the host grace ends loses its control
 * plane (tools, transfers, hangup, billing finalization). The worker cannot
 * extend the host's grace; it can say how many calls were live at SIGTERM and
 * raise an error shortly before the host kills it, so the loss is visible
 * instead of silent. The release path that avoids the loss is a manual
 * pre-drain (deploy/render/drain-voice.mjs) before the deploy.
 */

/** Render's maximum and the value render.yaml declares for botbound-voice. */
export const VOICE_HOST_SHUTDOWN_GRACE_SECONDS = 300;
/** Warn this long before the host's kill so the log line lands first. */
export const VOICE_SHUTDOWN_WARNING_LEAD_SECONDS = 20;

export type VoiceShutdownLog = {
  info: (message: string, fields: Record<string, unknown>) => void;
  warn: (message: string, fields: Record<string, unknown>) => void;
  error: (message: string, fields: Record<string, unknown>) => void;
};

export type VoiceShutdownLoad = () => { active: number; pending: number };

export function resolveVoiceHostShutdownGraceSeconds(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number(env.VOICE_HOST_SHUTDOWN_GRACE_SECONDS);
  return Number.isInteger(raw) && raw >= 30 && raw <= 3600
    ? raw
    : VOICE_HOST_SHUTDOWN_GRACE_SECONDS;
}

/**
 * Log the load at SIGTERM and schedule an error just before the host grace
 * ends if any call is still active. Returns a cancel function.
 */
export function reportVoiceShutdown(input: {
  load: VoiceShutdownLoad;
  log: VoiceShutdownLog;
  hostGraceSeconds: number;
  setTimer?: (fn: () => void, ms: number) => { unref?: () => void } | unknown;
  clearTimer?: (timer: unknown) => void;
}): () => void {
  const setTimer = input.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = input.clearTimer ?? ((timer: unknown) => clearTimeout(timer as never));
  const atSignal = input.load();
  const fields = { ...atSignal, hostGraceSeconds: input.hostGraceSeconds };
  if (atSignal.active + atSignal.pending > 0) {
    input.log.warn("Voice worker received SIGTERM with live calls; draining", fields);
  } else {
    input.log.info("Voice worker received SIGTERM with no live calls", fields);
  }
  const leadMs = Math.max(1, input.hostGraceSeconds - VOICE_SHUTDOWN_WARNING_LEAD_SECONDS) * 1000;
  const timer = setTimer(() => {
    const now = input.load();
    if (now.active + now.pending === 0) return;
    input.log.error(
      "Voice worker host grace is ending with live calls; they will lose call control. Pre-drain voice before deploying.",
      { ...now, hostGraceSeconds: input.hostGraceSeconds },
    );
  }, leadMs);
  (timer as { unref?: () => void } | undefined)?.unref?.();
  return () => clearTimer(timer);
}
