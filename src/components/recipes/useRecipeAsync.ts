/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payloads bridge loosely typed agent API. */
import { useState, useCallback, useRef } from "react";
import { authFetch } from "../../lib/api";

/**
 * Shared async-state hook for recipe forms.
 *
 * Eliminates repeated loading/error/result useState + try/catch/finally
 * boilerplate across all 13 recipe form components.
 *
 * @param endpoint  POST endpoint (e.g. "/api/claude/qualify")
 * @param extract   Optional key to pluck from the response JSON (e.g. "qualification")
 */
export function useRecipeAsync<T = any>(endpoint: string, extract?: string) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const runIdRef = useRef(0);

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      const runId = ++runIdRef.current;
      setLoading(true);
      setErr(null);
      setResult(null);
      try {
        const r = await authFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Request failed");
        if (runId !== runIdRef.current) return;
        setResult(extract ? data[extract] : data);
      } catch (e: any) {
        if (runId === runIdRef.current) setErr(e.message);
      } finally {
        if (runId === runIdRef.current) setLoading(false);
      }
    },
    [endpoint, extract],
  );

  return { loading, err, result, run } as const;
}
