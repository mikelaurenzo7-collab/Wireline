import { BOTBOUND_PRODUCTION_ORIGIN } from "../brand";

/** Configuration is server-owned and shared by admission and public readiness. */
export function voiceWorkerServiceSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.WIRELINE_VOICE_WORKER_SECRET?.trim() || "";
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("WIRELINE_VOICE_WORKER_SECRET must contain at least 32 bytes.");
  }
  return secret;
}

export function voiceWorkerOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const target = new URL(env.WIRELINE_VOICE_WORKER_URL || "");
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/"
  )
    throw new Error("WIRELINE_VOICE_WORKER_URL must be an HTTPS origin.");
  const production =
    env.VERCEL_ENV === "production" ||
    (env.NODE_ENV === "production" && env.VERCEL_ENV !== "preview");
  const deployed = production || env.VERCEL === "1" || env.VERCEL_ENV === "preview";
  if (deployed && !env.APP_URL?.trim()) {
    throw new Error("APP_URL is required before deployed voice forwarding.");
  }
  const webOrigins = new Set<string>();
  if (env.APP_URL?.trim()) {
    const app = new URL(env.APP_URL.trim());
    if (
      deployed &&
      (app.protocol !== "https:" ||
        app.username ||
        app.password ||
        app.search ||
        app.hash ||
        app.pathname !== "/")
    ) {
      throw new Error("APP_URL must be the configured HTTPS web app origin.");
    }
    if (production && app.origin !== BOTBOUND_PRODUCTION_ORIGIN) {
      throw new Error("Production APP_URL must be the canonical BotBound origin.");
    }
    webOrigins.add(app.origin);
  }
  // The deployed Vercel hostname can differ from APP_URL (especially previews).
  // Only server configuration participates; request Host/Origin is never trusted.
  for (const value of [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (!value?.trim()) continue;
    const host = value.trim();
    webOrigins.add(new URL(host.includes("://") ? host : "https://" + host).origin);
  }
  if (webOrigins.has(target.origin)) {
    throw new Error("The voice worker must use a separate origin from the web app.");
  }
  return target.origin;
}

export function isPersistentVoiceWorkerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    if (env.WIRELINE_VOICE_WORKER === "true") {
      if (env.VERCEL === "1") return false;
      voiceWorkerServiceSecret(env);
      return true;
    }
    if (env.VERCEL !== "1" && env.NODE_ENV !== "production" && !env.WIRELINE_VOICE_WORKER_URL)
      return true;
    voiceWorkerOrigin(env);
    voiceWorkerServiceSecret(env);
    return true;
  } catch {
    return false;
  }
}
