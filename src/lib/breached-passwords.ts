import { createHash } from "node:crypto";

const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range";
const DEFAULT_TIMEOUT_MS = 2500;
const PASSWORD_CHECK_USER_AGENT = "Wireline-password-security/1.0 (+https://trywireline.com)";

export type PasswordBreachCheckMode = "enforce" | "warn" | "off";
export type PasswordBreachCheckContext = "signup" | "reset";

export type PasswordBreachCheckResult = {
  checked: boolean;
  breached: boolean;
  prevalence: number;
  error?: string;
};

export type PasswordBreachCheckOptions = {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  mode?: PasswordBreachCheckMode;
  timeoutMs?: number;
  context?: PasswordBreachCheckContext;
};

export type PasswordRejectedCode = "PASSWORD_COMPROMISED" | "PASSWORD_SECURITY_CHECK_UNAVAILABLE";

export class PasswordRejectedError extends Error {
  readonly code: PasswordRejectedCode;
  readonly httpStatus: number;

  constructor(message: string, code: PasswordRejectedCode, httpStatus: number) {
    super(message);
    this.name = "PasswordRejectedError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function resolvePasswordBreachCheckMode(
  env: NodeJS.ProcessEnv = process.env,
): PasswordBreachCheckMode {
  const raw = (env.WIRELINE_PASSWORD_BREACH_CHECK || "").trim().toLowerCase();
  if (["off", "false", "0", "disabled"].includes(raw)) return "off";
  if (["warn", "permissive", "monitor"].includes(raw)) return "warn";
  if (["enforce", "true", "1", "required"].includes(raw)) return "enforce";

  if (env.NODE_ENV === "test") return "off";
  if (env.NODE_ENV === "production" || env.VERCEL === "1") return "enforce";
  return "warn";
}

function sha1PasswordRange(password: string): { prefix: string; suffix: string } {
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return { prefix: sha1.slice(0, 5), suffix: sha1.slice(5) };
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      headers: {
        "Add-Padding": "true",
        "User-Agent": PASSWORD_CHECK_USER_AGENT,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkPwnedPassword(
  password: string,
  options: PasswordBreachCheckOptions = {},
): Promise<PasswordBreachCheckResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Pwned Passwords fetch is unavailable");
  }

  const { prefix, suffix } = sha1PasswordRange(password);
  const endpoint = (options.endpoint || PWNED_PASSWORDS_RANGE_URL).replace(/\/+$/, "");
  const response = await fetchWithTimeout(
    fetchImpl,
    `${endpoint}/${prefix}`,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Pwned Passwords returned HTTP ${response.status}`);
  }

  const body = await response.text();
  for (const rawLine of body.split(/\r?\n/)) {
    const [candidateSuffix, countText] = rawLine.trim().split(":");
    if (!candidateSuffix || candidateSuffix.toUpperCase() !== suffix) continue;
    const prevalence = Number.parseInt(countText || "0", 10);
    return {
      checked: true,
      breached: Number.isFinite(prevalence) && prevalence > 0,
      prevalence: Number.isFinite(prevalence) ? prevalence : 0,
    };
  }

  return { checked: true, breached: false, prevalence: 0 };
}

export async function assertPasswordIsSafe(
  password: string,
  options: PasswordBreachCheckOptions = {},
): Promise<PasswordBreachCheckResult> {
  const mode = options.mode ?? resolvePasswordBreachCheckMode();
  if (mode === "off") {
    return { checked: false, breached: false, prevalence: 0 };
  }

  let result: PasswordBreachCheckResult;
  try {
    result = await checkPwnedPassword(password, options);
  } catch (error) {
    if (mode === "enforce") {
      throw new PasswordRejectedError(
        "Password safety check is temporarily unavailable. Try again in a minute.",
        "PASSWORD_SECURITY_CHECK_UNAVAILABLE",
        503,
      );
    }
    return {
      checked: false,
      breached: false,
      prevalence: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (result.breached) {
    throw new PasswordRejectedError(
      "Choose a different password. This one appears in known breach lists.",
      "PASSWORD_COMPROMISED",
      400,
    );
  }

  return result;
}
