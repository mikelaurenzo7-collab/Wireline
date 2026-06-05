/**
 * Browser-safe structured logging. Avoids raw console.* in product components;
 * no-ops in production except explicit error paths that need devtools signal.
 */
const IS_DEV = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

export function getClientErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

function formatErr(err: unknown): string {
  return getClientErrorMessage(err);
}

export const clientLog = {
  debug(_scope: string, _message: string, _extra?: Record<string, unknown>): void {
    // intentional no-op — eslint allows only console.error in src/
  },
  warn(scope: string, err: unknown, extra?: Record<string, unknown>): void {
    if (!IS_DEV) return;
    console.error(`[${scope}]`, formatErr(err), extra ?? "");
  },
  error(scope: string, err: unknown, extra?: Record<string, unknown>): void {
    if (!IS_DEV) return;
    console.error(`[${scope}]`, formatErr(err), extra ?? "");
  },
};
