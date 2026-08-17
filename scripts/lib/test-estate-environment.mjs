import { join } from "node:path";

/**
 * Environment names that are required to start local executables or preserve
 * stable text/locale behavior. Application, provider, deployment, account,
 * observability, and credential variables are deliberately absent.
 */
export const TEST_ESTATE_OS_PASSTHROUGH = Object.freeze([
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "ComSpec",
  "COMSPEC",
  "WINDIR",
  "TMPDIR",
  "TEMP",
  "TMP",
  "TERM",
  "LANG",
  "LC_ALL",
]);

/**
 * Construct a deterministic test environment from an allowlist rather than a
 * credential denylist. A new production secret or provider variable is safe by
 * default because unknown names never cross the process boundary.
 */
export function buildTestEstateEnvironment(source, isolatedHome) {
  const env = {};
  for (const name of TEST_ESTATE_OS_PASSTHROUGH) {
    const value = source[name];
    if (typeof value === "string" && value.length > 0) env[name] = value;
  }

  env.HOME = isolatedHome;
  env.USERPROFILE = isolatedHome;
  env.APPDATA = join(isolatedHome, "appdata");
  env.LOCALAPPDATA = join(isolatedHome, "local-appdata");
  env.XDG_CONFIG_HOME = join(isolatedHome, "xdg-config");
  env.XDG_CACHE_HOME = join(isolatedHome, "xdg-cache");
  env.NPM_CONFIG_USERCONFIG = join(isolatedHome, ".npmrc");
  env.NPM_CONFIG_CACHE = join(isolatedHome, "npm-cache");
  env.GIT_CONFIG_GLOBAL = join(isolatedHome, ".gitconfig");
  env.GIT_CONFIG_NOSYSTEM = "1";

  env.CI = "1";
  env.NODE_ENV = "test";
  env.VERCEL_ENV = "development";
  env.TZ = "UTC";
  env.NO_COLOR = "1";
  env.WIRELINE_TEST_ESTATE_CLEAN_ROOM = "true";

  return env;
}
