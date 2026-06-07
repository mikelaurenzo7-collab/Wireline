import { GoogleStitchError } from "./google-stitch-mcp-client";

type StitchScreenLike = {
  screenId: string;
  projectId: string;
  data?: unknown;
};

type StitchProjectLike = {
  projectId: string;
  data?: unknown;
};

type StitchErrorLike = Error & {
  code: string;
  recoverable: boolean;
};

function isStitchErrorLike(error: unknown): error is StitchErrorLike {
  return (
    error instanceof Error &&
    typeof (error as StitchErrorLike).code === "string" &&
    typeof (error as StitchErrorLike).recoverable === "boolean"
  );
}

function isLikelyPlatformTimeout(message: string): boolean {
  return /timeout|timed out|504|FUNCTION_INVOCATION_TIMEOUT|ECONNRESET|ETIMEDOUT|socket hang up/i.test(
    message,
  );
}

export function mapStitchError(error: unknown): GoogleStitchError {
  if (error instanceof GoogleStitchError) return error;
  if (isStitchErrorLike(error)) {
    return new GoogleStitchError(error.message, error.code, error.recoverable);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (isLikelyPlatformTimeout(message)) {
    return new GoogleStitchError(message, "NETWORK_ERROR", true);
  }
  return new GoogleStitchError(message, "UNKNOWN_ERROR", false);
}

export function screenEntityToRecord(screen: StitchScreenLike): Record<string, unknown> {
  const data =
    screen.data && typeof screen.data === "object" && !Array.isArray(screen.data)
      ? (screen.data as Record<string, unknown>)
      : {};
  return {
    ...data,
    screenId: screen.screenId,
    projectId: screen.projectId,
  };
}

export function projectEntityToRef(project: StitchProjectLike): {
  projectId: string;
  title?: string;
  projectType?: string;
} {
  const data =
    project.data && typeof project.data === "object" && !Array.isArray(project.data)
      ? (project.data as Record<string, unknown>)
      : {};
  const title = [data.title, data.displayName, data.display_name]
    .map((v) => (typeof v === "string" ? v : ""))
    .find(Boolean);
  const projectType = [data.projectType, data.type, data.project_type]
    .map((v) => (typeof v === "string" ? v : ""))
    .find(Boolean);
  return {
    projectId: project.projectId,
    title: title || undefined,
    projectType: projectType || undefined,
  };
}

export async function withStitchAbort<T>(
  signal: AbortSignal | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!signal) return fn();
  if (signal.aborted) {
    throw new GoogleStitchError("Stitch request aborted", "NETWORK_ERROR", true);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new GoogleStitchError("Stitch request aborted", "NETWORK_ERROR", true));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    fn()
      .then(resolve, (error) => reject(mapStitchError(error)))
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}
