export function buildPlaywrightWebServerEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const webServerEnv: Record<string, string> = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  webServerEnv.INTERNAL_JWT_SECRET ||= "playwright-local-jwt-secret-at-least-32-bytes-long";
  webServerEnv.OAUTH_STATE_SECRET ||= "playwright-local-oauth-state-secret-at-least-32-bytes-long";
  webServerEnv.APP_URL ||= "http://localhost:3000";

  return webServerEnv;
}
