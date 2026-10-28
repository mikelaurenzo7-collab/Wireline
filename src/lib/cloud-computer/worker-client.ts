import { AppError } from "../api-error";
import { VOICE_WORKER_AUTH_HEADER } from "../voice/openai-sip-worker-dispatch";
import { voiceWorkerServiceSecret } from "../voice/openai-sip-worker-config";
import {
  getComputerTaskForOwner,
  listComputerTasksForOwner,
  replyToComputerTask,
  startComputerTask,
  stopComputerTask,
  type ComputerTaskView,
} from "./task-runner";

export const VOICE_WORKER_COMPUTER_USER_HEADER = "x-botbound-voice-worker-user-id";
const WORKER_COMPUTER_TIMEOUT_MS = 15_000;

export function backendComputerOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.BOTBOUND_BACKEND_ORIGIN?.trim() || env.APP_URL?.trim() || "";
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function shouldProxyComputerToBackend(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.WIRELINE_VOICE_WORKER !== "true") return false;
  const origin = backendComputerOrigin(env);
  if (!origin) return false;
  try {
    return Boolean(voiceWorkerServiceSecret(env));
  } catch {
    return false;
  }
}

async function requestBackendComputer<T>(
  userId: string,
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const origin = backendComputerOrigin(env);
  if (!origin) {
    throw AppError.serviceUnavailable("Cloud Computer backend origin is not configured.");
  }
  const secret = voiceWorkerServiceSecret(env);
  const url = new URL(path, origin).toString();
  const response = await fetch(url, {
    method: init.method,
    redirect: "error",
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      [VOICE_WORKER_AUTH_HEADER]: secret,
      [VOICE_WORKER_COMPUTER_USER_HEADER]: userId,
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(WORKER_COMPUTER_TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const code =
      typeof payload?.code === "string" && payload.code.trim()
        ? payload.code.trim()
        : "COMPUTER_UNAVAILABLE";
    const message =
      typeof payload?.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : "Cloud Computer is unavailable right now.";
    throw new AppError(response.status, code, message);
  }
  return (payload ?? {}) as T;
}

export async function dispatchStartComputerTaskForOwner(
  userId: string,
  agentId: string,
  input: { goal: string; startUrl?: string },
): Promise<ComputerTaskView> {
  if (!shouldProxyComputerToBackend()) {
    return startComputerTask(userId, agentId, input);
  }
  const data = await requestBackendComputer<{ task?: ComputerTaskView }>(
    userId,
    "/api/computer/tasks",
    {
      method: "POST",
      body: {
        agentId,
        goal: input.goal,
        ...(input.startUrl ? { startUrl: input.startUrl } : {}),
      },
    },
  );
  if (!data?.task) {
    throw AppError.serviceUnavailable("Cloud Computer did not return a task receipt.");
  }
  return data.task;
}

export async function dispatchGetComputerTaskForOwner(
  userId: string,
  taskId: string,
): Promise<ComputerTaskView> {
  if (!shouldProxyComputerToBackend()) {
    return getComputerTaskForOwner(userId, taskId);
  }
  const data = await requestBackendComputer<{ task?: ComputerTaskView }>(
    userId,
    `/api/computer/tasks/${encodeURIComponent(taskId)}`,
    { method: "GET" },
  );
  if (!data?.task) {
    throw AppError.notFound("Task not found.");
  }
  return data.task;
}

export async function dispatchListComputerTasksForOwner(
  userId: string,
  agentId?: string,
): Promise<ComputerTaskView[]> {
  if (!shouldProxyComputerToBackend()) {
    return listComputerTasksForOwner(userId, agentId);
  }
  const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
  const data = await requestBackendComputer<{ tasks?: ComputerTaskView[] }>(
    userId,
    `/api/computer/tasks${query}`,
    { method: "GET" },
  );
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

export async function dispatchReplyComputerTaskForOwner(
  userId: string,
  taskId: string,
  message: string,
): Promise<ComputerTaskView> {
  if (!shouldProxyComputerToBackend()) {
    return replyToComputerTask(userId, taskId, { message });
  }
  const data = await requestBackendComputer<{ task?: ComputerTaskView }>(
    userId,
    `/api/computer/tasks/${encodeURIComponent(taskId)}/reply`,
    {
      method: "POST",
      body: { message },
    },
  );
  if (!data?.task) {
    throw AppError.serviceUnavailable("Cloud Computer did not confirm the reply.");
  }
  return data.task;
}

export async function dispatchStopComputerTaskForOwner(
  userId: string,
  taskId: string,
): Promise<ComputerTaskView> {
  if (!shouldProxyComputerToBackend()) {
    return stopComputerTask(userId, taskId);
  }
  const data = await requestBackendComputer<{ task?: ComputerTaskView }>(
    userId,
    `/api/computer/tasks/${encodeURIComponent(taskId)}/stop`,
    {
      method: "POST",
      body: {},
    },
  );
  if (!data?.task) {
    throw AppError.serviceUnavailable("Cloud Computer did not confirm stopping the task.");
  }
  return data.task;
}
