import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { authFetch } from "../lib/api";
import type { CommunicationChannel } from "../lib/plan-catalog";

export type ChannelEntitlements = {
  plan_id: string | null;
  subscription_status: string;
  channels: readonly CommunicationChannel[];
  is_owner: boolean;
};

export function parseChannelEntitlements(value: unknown): ChannelEntitlements | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    !(record.plan_id === null || typeof record.plan_id === "string") ||
    typeof record.subscription_status !== "string" ||
    typeof record.is_owner !== "boolean" ||
    !Array.isArray(record.channels) ||
    !record.channels.every((channel) => ["voice", "email", "sms"].includes(channel))
  )
    return null;
  return record as ChannelEntitlements;
}

/** Unknown access is never converted into a free plan or another owner's grants. */
export function useChannelEntitlements() {
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const scope = useRef({ ownerId });
  if (scope.current.ownerId !== ownerId) scope.current = { ownerId };
  const currentScope = scope.current;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    scope: typeof currentScope;
    status: "loading" | "ready" | "error";
    data: ChannelEntitlements | null;
  }>({ scope: currentScope, status: "loading", data: null });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && scope.current === currentScope;
    setState((previous) => ({
      scope: currentScope,
      status: "loading",
      data: previous.scope === currentScope ? previous.data : null,
    }));
    if (!ownerId) return () => controller.abort();
    void authFetch("/api/billing/status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Channel access unavailable");
        const body = await response.json();
        const data = parseChannelEntitlements(body?.channel_entitlements);
        if (!data) throw new Error("Channel access unavailable");
        if (isCurrent()) setState({ scope: currentScope, status: "ready", data });
      })
      .catch(() => {
        if (isCurrent())
          setState((previous) => ({
            scope: currentScope,
            status: "error",
            data: previous.scope === currentScope ? previous.data : null,
          }));
      });
    return () => controller.abort();
  }, [ownerId, currentScope, attempt]);
  const visible = state.scope === currentScope ? state : { status: "loading" as const, data: null };
  return {
    status: visible.status,
    data: visible.data,
    retry,
    includes: (channel: CommunicationChannel) =>
      visible.status === "ready" && visible.data?.channels.includes(channel) === true,
  };
}
