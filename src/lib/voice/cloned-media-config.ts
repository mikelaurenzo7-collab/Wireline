import { voiceWorkerOrigin } from "./openai-sip-worker-config";

export const CLONED_MEDIA_PATH = "/api/voice/cloned-media";
export const CLONED_MEDIA_ADMIT_PATH = "/api/voice/cloned-media/admit";
export const mediaCallSid = (id: string): string | null =>
  /^media:CA[a-f0-9]{32}$/i.test(id) ? id.slice(6) : null;

export function clonedMediaOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return voiceWorkerOrigin({
    ...env,
    WIRELINE_VOICE_WORKER_URL:
      env.WIRELINE_VOICE_WORKER_URL ||
      (env.WIRELINE_VOICE_WORKER === "true" ? env.RENDER_EXTERNAL_URL : undefined),
  });
}

export function elevenLabsCallsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.ELEVENLABS_API_KEY?.trim() || !env.OPENAI_API_KEY?.trim()) return false;
  try {
    clonedMediaOrigin(env);
    return true;
  } catch {
    return false;
  }
}

export function catalogCallsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (
    !env.OPENAI_API_KEY?.trim() ||
    !(env.CARTESIA_API_KEY?.trim() || env.ELEVENLABS_API_KEY?.trim())
  )
    return false;
  try {
    clonedMediaOrigin(env);
    return true;
  } catch {
    return false;
  }
}
